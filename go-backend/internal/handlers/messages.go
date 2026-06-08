package handlers

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"

	"rina-backend/internal/db"
	"rina-backend/internal/models"
	authmw "rina-backend/internal/middleware"
)

type messageRequest struct {
	Content   string  `json:"content" validate:"required,max=4000"`
	Type      string  `json:"type" validate:"omitempty,oneof=TEXT IMAGE AUDIO VIDEO"`
	MediaURL  *string `json:"mediaUrl,omitempty"`
	ReplyToID *string `json:"replyToId,omitempty"`
}

func ListMessages(c echo.Context) error {
	_ = authmw.GetUser(c)
	limitStr := c.QueryParam("limit")
	before := c.QueryParam("before")

	limit := 50
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 200 {
		limit = l
	}

	ctx := context.Background()
	pool := db.Get()

	var rows interface{}
	var err error
	if before != "" {
		rows, err = pool.Query(ctx,
			"SELECT id, sender_id, content, type, media_url, reply_to_id, edited_at, created_at FROM messages WHERE created_at < $1 ORDER BY created_at DESC LIMIT $2",
			before, limit,
		)
	} else {
		rows, err = pool.Query(ctx,
			"SELECT id, sender_id, content, type, media_url, reply_to_id, edited_at, created_at FROM messages ORDER BY created_at DESC LIMIT $1",
			limit,
		)
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch messages"})
	}
	defer rows.(interface{ Close() }).Close()

	var messages []models.Message
	for rows.(interface{ Next() bool }).Next() {
		var m models.Message
		var msgType string
		var mediaURL, replyToID *string
		var editedAt *time.Time
		if err := rows.(interface {
			Scan(dest ...interface{}) error
		}).Scan(&m.ID, &m.SenderID, &m.Content, &msgType, &mediaURL, &replyToID, &editedAt, &m.CreatedAt); err != nil {
			continue
		}
		m.Type = models.MessageType(msgType)
		m.MediaURL = mediaURL
		m.ReplyToID = replyToID
		m.EditedAt = editedAt
		messages = append(messages, m)
	}

	return c.JSON(http.StatusOK, messages)
}

func CreateMessage(c echo.Context) error {
	user := authmw.GetUser(c)
	var req messageRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if req.Content == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "content required"})
	}

	msgType := models.MessageTypeText
	if req.Type != "" {
		msgType = models.MessageType(req.Type)
	}

	ctx := context.Background()
	pool := db.Get()

	if req.ReplyToID != nil {
		var exists bool
		if err := pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM messages WHERE id = $1)", *req.ReplyToID).Scan(&exists); err != nil || !exists {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "reply-to message does not exist"})
		}
	}

	var m models.Message
	var replyToID interface{}
	if req.ReplyToID != nil {
		replyToID = *req.ReplyToID
	}
	var mediaURL interface{}
	if req.MediaURL != nil {
		mediaURL = *req.MediaURL
	}

	err := pool.QueryRow(ctx,
		"INSERT INTO messages (sender_id, content, type, media_url, reply_to_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at",
		user.ID, req.Content, string(msgType), mediaURL, replyToID,
	).Scan(&m.ID, &m.CreatedAt)
	if err != nil {
		log.Error().Err(err).Msg("create message failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to send message"})
	}

	m.SenderID = user.ID
	m.Content = req.Content
	m.Type = msgType
	m.MediaURL = req.MediaURL
	m.ReplyToID = req.ReplyToID

	return c.JSON(http.StatusCreated, m)
}

func EditMessage(c echo.Context) error {
	user := authmw.GetUser(c)
	id := c.Param("id")
	var req struct {
		Content string `json:"content" validate:"required,max=4000"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	ctx := context.Background()
	pool := db.Get()

	var senderID string
	if err := pool.QueryRow(ctx, "SELECT sender_id FROM messages WHERE id = $1", id).Scan(&senderID); err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "message not found"})
	}
	if senderID != user.ID {
		return c.JSON(http.StatusForbidden, map[string]string{"error": "not authorized"})
	}

	var m models.Message
	var msgType string
	var mediaURL, replyToID *string
	var editedAt *time.Time
	if err := pool.QueryRow(ctx,
		"UPDATE messages SET content = $1, edited_at = NOW() WHERE id = $2 RETURNING id, sender_id, content, type, media_url, reply_to_id, edited_at, created_at",
		req.Content, id,
	).Scan(&m.ID, &m.SenderID, &m.Content, &msgType, &mediaURL, &replyToID, &editedAt, &m.CreatedAt); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to edit message"})
	}
	m.Type = models.MessageType(msgType)
	m.MediaURL = mediaURL
	m.ReplyToID = replyToID
	m.EditedAt = editedAt

	return c.JSON(http.StatusOK, m)
}

func DeleteMessage(c echo.Context) error {
	user := authmw.GetUser(c)
	id := c.Param("id")

	ctx := context.Background()
	pool := db.Get()

	var senderID string
	if err := pool.QueryRow(ctx, "SELECT sender_id FROM messages WHERE id = $1", id).Scan(&senderID); err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "message not found"})
	}
	if senderID != user.ID {
		return c.JSON(http.StatusForbidden, map[string]string{"error": "not authorized"})
	}

	if _, err := pool.Exec(ctx, "DELETE FROM messages WHERE id = $1", id); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete message"})
	}

	return c.NoContent(http.StatusNoContent)
}
