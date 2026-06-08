package handlers

import (
	"context"
	"net/http"

	"github.com/labstack/echo/v4"

	"rina-backend/internal/config"
	"rina-backend/internal/db"
	authmw "rina-backend/internal/middleware"
)

func ListConfig(c echo.Context) error {
	ctx := context.Background()
	pool := db.Get()
	rows, err := pool.Query(ctx, "SELECT id, key, value, updated_at, updated_by FROM config ORDER BY key")
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch config"})
	}
	defer rows.Close()

	var configs []map[string]interface{}
	for rows.Next() {
		var id, key, value, updatedBy string
		var updatedAt interface{}
		if err := rows.Scan(&id, &key, &value, &updatedAt, &updatedBy); err != nil {
			continue
		}
		configs = append(configs, map[string]interface{}{
			"id":        id,
			"key":       key,
			"value":     value,
			"updatedAt": updatedAt,
			"updatedBy": updatedBy,
		})
	}

	return c.JSON(http.StatusOK, configs)
}

func GetPublicConfig(c echo.Context) error {
	ctx := context.Background()
	pool := db.Get()
	rows, err := pool.Query(ctx, "SELECT key, value FROM config")
	if err != nil {
		return c.JSON(http.StatusOK, map[string]interface{}{})
	}
	defer rows.Close()

	result := map[string]interface{}{
		"youtube": config.Get().YoutubeAPIKey != "",
		"push":    config.Get().VapidPublicKey != "",
		"uploads": false,
		"cinema":  false,
		"tmdb":    false,
		"backup":  false,
		"mapbox":  false,
	}

	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			continue
		}
		result[key] = value
	}

	return c.JSON(http.StatusOK, result)
}

func UpdateConfig(c echo.Context) error {
	key := c.Param("key")
	var req struct {
		Value string `json:"value" validate:"required"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	user := authmw.GetUser(c)
	ctx := context.Background()
	pool := db.Get()

	_, err := pool.Exec(ctx,
		"INSERT INTO config (key, value, updated_by) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()",
		key, req.Value, user.Username,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update config"})
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}
