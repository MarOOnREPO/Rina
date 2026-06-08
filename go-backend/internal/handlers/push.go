package handlers

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
	webpush "github.com/SherClockHolmes/webpush-go"

	"rina-backend/internal/config"
	"rina-backend/internal/db"
	authmw "rina-backend/internal/middleware"
	"rina-backend/internal/services"
)

func SubscribePush(c echo.Context) error {
	user := authmw.GetUser(c)
	var req struct {
		Endpoint string `json:"endpoint" validate:"required"`
		P256DH   string `json:"p256dh" validate:"required"`
		Auth     string `json:"auth" validate:"required"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	ctx := context.Background()
	pool := db.Get()

	_, err := pool.Exec(ctx,
		"INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4) ON CONFLICT (endpoint) DO UPDATE SET p256dh = $3, auth = $4",
		user.ID, req.Endpoint, req.P256DH, req.Auth,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to subscribe"})
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

func UnsubscribePush(c echo.Context) error {
	user := authmw.GetUser(c)
	var req struct {
		Endpoint string `json:"endpoint" validate:"required"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	ctx := context.Background()
	pool := db.Get()
	_, err := pool.Exec(ctx, "DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2", user.ID, req.Endpoint)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to unsubscribe"})
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

func NotifyPush(c echo.Context) error {
	user := authmw.GetUser(c)
	var req struct {
		Title string `json:"title"`
		Body  string `json:"body"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	ctx := context.Background()
	partner, err := services.GetPartner(ctx, user.ID)
	if err != nil || partner == "" {
		return c.JSON(http.StatusOK, map[string]string{"status": "no partner"})
	}

	pool := db.Get()
	rows, err := pool.Query(ctx, "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1", partner)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch subscriptions"})
	}
	defer rows.Close()

	cfg := config.Get()
	if cfg.VapidPublicKey == "" || cfg.VapidPrivateKey == "" {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "push not configured"})
	}

	payload, _ := json.Marshal(map[string]string{"title": req.Title, "body": req.Body})

	for rows.Next() {
		var endpoint, p256dh, auth string
		if err := rows.Scan(&endpoint, &p256dh, &auth); err != nil {
			continue
		}
		s := &webpush.Subscription{
			Endpoint: endpoint,
			Keys: webpush.Keys{
				P256dh: p256dh,
				Auth:   auth,
			},
		}
		_, err := webpush.SendNotification(payload, s, &webpush.Options{
			Subscriber:      "mailto:admin@rina.app",
			VAPIDPublicKey:  cfg.VapidPublicKey,
			VAPIDPrivateKey: cfg.VapidPrivateKey,
			TTL:             30,
		})
		if err != nil {
			log.Warn().Err(err).Str("endpoint", endpoint).Msg("push failed, removing sub")
			pool.Exec(ctx, "DELETE FROM push_subscriptions WHERE endpoint = $1", endpoint)
		}
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

func GetVapidPublicKey(c echo.Context) error {
	cfg := config.Get()
	if cfg.VapidPublicKey == "" {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "push not configured"})
	}
	return c.JSON(http.StatusOK, map[string]string{"publicKey": cfg.VapidPublicKey})
}
