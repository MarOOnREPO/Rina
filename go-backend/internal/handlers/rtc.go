package handlers

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"rina-backend/internal/config"
	authmw "rina-backend/internal/middleware"
)

func GetIceServers(c echo.Context) error {
	user := authmw.GetUser(c)
	cfg := config.Get()

	iceServers := []map[string]interface{}{
		{
			"urls": []string{"stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"},
		},
	}

	if cfg.CoturnRealm != "" && cfg.CoturnSecret != "" {
		username := fmt.Sprintf("%d:%s", time.Now().Add(time.Hour).Unix(), user.Username)
		mac := hmac.New(sha1.New, []byte(cfg.CoturnSecret))
		mac.Write([]byte(username))
		password := base64.StdEncoding.EncodeToString(mac.Sum(nil))

		iceServers = append(iceServers, map[string]interface{}{
			"urls":       []string{fmt.Sprintf("turn:%s:3478", cfg.CoturnRealm)},
			"username":   username,
			"credential": password,
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{"iceServers": iceServers})
}

func GetIceServersHandler(c echo.Context) error {
	return GetIceServers(c)
}
