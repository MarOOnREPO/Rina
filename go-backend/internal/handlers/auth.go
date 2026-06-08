package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/bcrypt"

	"rina-backend/internal/config"
	"rina-backend/internal/db"
	"rina-backend/internal/models"
	authmw "rina-backend/internal/middleware"
	"rina-backend/internal/services"
)

type loginRequest struct {
	Username string `json:"username" validate:"required"`
	Password string `json:"password" validate:"required"`
}

func Login(c echo.Context) error {
	var req loginRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	cfg := config.Get()
	var hash string
	switch req.Username {
	case "maroon":
		hash = cfg.MaroonPasswordHash
	case "rina":
		hash = cfg.RinaPasswordHash
	default:
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
	}

	ctx := context.Background()
	pool := db.Get()
	var user models.User
	if err := pool.QueryRow(ctx,
		"SELECT id, username, display_name, avatar_url, timezone, created_at, updated_at FROM users WHERE username = $1",
		req.Username,
	).Scan(&user.ID, &user.Username, &user.DisplayName, &user.AvatarURL, &user.Timezone, &user.CreatedAt, &user.UpdatedAt); err != nil {
		log.Error().Err(err).Str("username", req.Username).Msg("user not found in db")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "user lookup failed"})
	}

	token, err := authmw.GenerateToken(&user)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "token generation failed"})
	}

	cookie := new(http.Cookie)
	cookie.Name = authmw.CookieName
	cookie.Value = token
	cookie.HttpOnly = true
	cookie.Secure = cfg.IsProduction()
	cookie.SameSite = http.SameSiteStrictMode
	cookie.Path = "/"
	cookie.Expires = time.Now().Add(7 * 24 * time.Hour)
	c.SetCookie(cookie)

	return c.JSON(http.StatusOK, user)
}

func Logout(c echo.Context) error {
	cookie := new(http.Cookie)
	cookie.Name = authmw.CookieName
	cookie.Value = ""
	cookie.HttpOnly = true
	cookie.Secure = config.Get().IsProduction()
	cookie.SameSite = http.SameSiteStrictMode
	cookie.Path = "/"
	cookie.MaxAge = -1
	c.SetCookie(cookie)
	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

func GetMe(c echo.Context) error {
	user := authmw.GetUser(c)
	if user == nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "not authenticated"})
	}

	ctx := context.Background()
	pool := db.Get()

	var u models.User
	if err := pool.QueryRow(ctx,
		"SELECT id, username, display_name, avatar_url, timezone, created_at, updated_at FROM users WHERE id = $1",
		user.ID,
	).Scan(&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.Timezone, &u.CreatedAt, &u.UpdatedAt); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "user lookup failed"})
	}

	partnerID, _ := services.GetPartner(ctx, u.ID)
	var partner *models.User
	if partnerID != "" {
		var p models.User
		if err := pool.QueryRow(ctx,
			"SELECT id, username, display_name, avatar_url, timezone, created_at, updated_at FROM users WHERE id = $1",
			partnerID,
		).Scan(&p.ID, &p.Username, &p.DisplayName, &p.AvatarURL, &p.Timezone, &p.CreatedAt, &p.UpdatedAt); err == nil {
			partner = &p
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"user":    u,
		"partner": partner,
	})
}

func UpdateMe(c echo.Context) error {
	user := authmw.GetUser(c)
	if user == nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "not authenticated"})
	}

	var req struct {
		DisplayName *string `json:"displayName,omitempty"`
		Timezone    *string `json:"timezone,omitempty"`
		AvatarURL   *string `json:"avatarUrl,omitempty"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	ctx := context.Background()
	pool := db.Get()
	_, err := pool.Exec(ctx,
		"UPDATE users SET display_name = COALESCE($1, display_name), timezone = COALESCE($2, timezone), avatar_url = COALESCE($3, avatar_url), updated_at = NOW() WHERE id = $4",
		req.DisplayName, req.Timezone, req.AvatarURL, user.ID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "update failed"})
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

func GetNotifications(c echo.Context) error {
	user := authmw.GetUser(c)
	ctx := context.Background()
	pool := db.Get()
	rows, err := pool.Query(ctx,
		"SELECT id, user_id, type, title, body, data, read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC",
		user.ID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch notifications"})
	}
	defer rows.Close()

	var notifications []models.Notification
	for rows.Next() {
		var n models.Notification
		var data *map[string]interface{}
		if err := rows.Scan(&n.ID, &n.UserID, &n.Type, &n.Title, &n.Body, &data, &n.Read, &n.CreatedAt); err != nil {
			continue
		}
		if data != nil {
			n.Data = data
		}
		notifications = append(notifications, n)
	}

	return c.JSON(http.StatusOK, notifications)
}

func MarkNotificationsRead(c echo.Context) error {
	user := authmw.GetUser(c)
	ctx := context.Background()
	pool := db.Get()
	_, err := pool.Exec(ctx, "UPDATE notifications SET read = true WHERE user_id = $1", user.ID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to mark read"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}
