package websocket

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"

	authmw "rina-backend/internal/middleware"
	"rina-backend/internal/services"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // CORS handled by Echo middleware
	},
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

type Client struct {
	Hub      *Hub
	Conn     *websocket.Conn
	Send     chan []byte
	Username string
	UserID   string
}

type Hub struct {
	Clients    map[*Client]bool
	UserRooms  map[string]map[*Client]bool
	Register   chan *Client
	Unregister chan *Client
	Broadcast  chan Message
	mu         sync.RWMutex
}

type Message struct {
	Event   string          `json:"event"`
	Payload json.RawMessage `json:"payload"`
	From    string          `json:"from,omitempty"`
	To      string          `json:"to,omitempty"`
}

func NewHub() *Hub {
	return &Hub{
		Clients:    make(map[*Client]bool),
		UserRooms:  make(map[string]map[*Client]bool),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		Broadcast:  make(chan Message, 256),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.mu.Lock()
			h.Clients[client] = true
			if h.UserRooms[client.Username] == nil {
				h.UserRooms[client.Username] = make(map[*Client]bool)
			}
			h.UserRooms[client.Username][client] = true
			h.mu.Unlock()

			ctx := context.Background()
			services.AddUserSocket(ctx, client.Username, client.UserID)
			services.SetSocket(ctx, client.Username, client.UserID)
			services.SetStatus(ctx, client.Username, services.PresenceData{
				Status:      "online",
				LastSeen:    time.Now().Format(time.RFC3339),
				DisplayName: client.Username,
			})
			services.SetHeartbeat(ctx, client.Username)
			h.broadcastPresence(client.Username, "online")

		case client := <-h.Unregister:
			h.mu.Lock()
			if _, ok := h.Clients[client]; ok {
				delete(h.Clients, client)
				if room := h.UserRooms[client.Username]; room != nil {
					delete(room, client)
					if len(room) == 0 {
						delete(h.UserRooms, client.Username)
					}
				}
				close(client.Send)
			}
			h.mu.Unlock()

			ctx := context.Background()
			services.RemoveUserSocket(ctx, client.Username, client.UserID)
			sockets, _ := services.GetUserSockets(ctx, client.Username)
			if len(sockets) == 0 {
				services.SetStatus(ctx, client.Username, services.PresenceData{
					Status:      "offline",
					LastSeen:    time.Now().Format(time.RFC3339),
					DisplayName: client.Username,
				})
				h.broadcastPresence(client.Username, "offline")
			}

		case msg := <-h.Broadcast:
			h.mu.RLock()
			if msg.To != "" {
				for client := range h.UserRooms[msg.To] {
					select {
					case client.Send <- mustJSON(msg):
					default:
						close(client.Send)
						delete(h.Clients, client)
					}
				}
			} else {
				for client := range h.Clients {
					select {
					case client.Send <- mustJSON(msg):
					default:
						close(client.Send)
						delete(h.Clients, client)
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) broadcastPresence(username, status string) {
	payload, _ := json.Marshal(map[string]string{
		"username": username,
		"status":   status,
		"timestamp": time.Now().Format(time.RFC3339),
	})
	msg := Message{Event: "presence:update", Payload: payload}
	for client := range h.Clients {
		if client.Username != username {
			select {
			case client.Send <- mustJSON(msg):
			default:
			}
		}
	}
}

func mustJSON(v interface{}) []byte {
	b, _ := json.Marshal(v)
	return b
}

func (h *Hub) HandleWebSocket(c echo.Context) error {
	tokenStr := c.QueryParam("token")
	if tokenStr == "" {
		cookie, err := c.Cookie(authmw.CookieName)
		if err == nil {
			tokenStr = cookie.Value
		}
	}
	if tokenStr == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "token required"})
	}

	payload, err := authmw.VerifyToken(tokenStr)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid token"})
	}

	conn, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}

	client := &Client{
		Hub:      h,
		Conn:     conn,
		Send:     make(chan []byte, 256),
		Username: payload.Username,
		UserID:   payload.ID,
	}

	h.Register <- client

	go client.writePump()
	go client.readPump()

	return nil
}

func (c *Client) readPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()
	c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		ctx := context.Background()
		services.SetHeartbeat(ctx, c.Username)
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Error().Err(err).Str("user", c.Username).Msg("websocket read error")
			}
			break
		}

		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		ctx := context.Background()
		services.SetHeartbeat(ctx, c.Username)

		switch msg.Event {
		case "heartbeat:ping":
			c.send(Message{Event: "heartbeat:pong", Payload: json.RawMessage(`{"serverTime":` + string(time.Now().UnixMilli()) + `}`)})
		case "typing:start":
			services.SetStatus(ctx, c.Username, services.PresenceData{
				Status:      "typing",
				LastSeen:    time.Now().Format(time.RFC3339),
				DisplayName: c.Username,
			})
			c.Hub.broadcastToPartner(c.Username, Message{Event: "typing:start", Payload: json.RawMessage(`{"username":"` + c.Username + `"}`)})
		case "typing:stop":
			services.SetStatus(ctx, c.Username, services.PresenceData{
				Status:      "online",
				LastSeen:    time.Now().Format(time.RFC3339),
				DisplayName: c.Username,
			})
			c.Hub.broadcastToPartner(c.Username, Message{Event: "typing:stop", Payload: json.RawMessage(`{"username":"` + c.Username + `"}`)})
		case "chat:message":
			c.Hub.broadcastToPartner(c.Username, msg)
		case "sync:update", "media:sync":
			c.Hub.broadcastToPartner(c.Username, msg)
		case "webrtc:offer", "webrtc:answer", "webrtc:ice":
			c.Hub.broadcastToPartner(c.Username, msg)
		}
	}
}

func (h *Hub) broadcastToPartner(username string, msg Message) {
	ctx := context.Background()
	partner, err := services.GetPartnerByUsername(ctx, username)
	if err != nil || partner == "" {
		return
	}
	msg.To = partner
	h.Broadcast <- msg
}

func (c *Client) writePump() {
	ticker := time.NewTicker(25 * time.Second)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			c.Conn.WriteMessage(websocket.TextMessage, message)
		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) send(msg Message) {
	select {
	case c.Send <- mustJSON(msg):
	default:
	}
}
