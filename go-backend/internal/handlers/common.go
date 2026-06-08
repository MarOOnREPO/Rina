package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"rina-backend/internal/config"
	authmw "rina-backend/internal/middleware"
)

func AdminOnly(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		user := authmw.GetUser(c)
		if user == nil || !config.IsAdmin(user.Username) {
			return c.JSON(http.StatusForbidden, map[string]string{"error": "Admin access required"})
		}
		return next(c)
	}
}

func HealthHandler(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}
