package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
	"rina-backend/internal/config"
	"rina-backend/internal/models"
)

const CookieName = "rina_auth_token"

type contextKey string

const UserContextKey contextKey = "user"

func GenerateToken(user *models.User) (string, error) {
	cfg := config.Get()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"id":          user.ID,
		"username":    user.Username,
		"displayName": user.DisplayName,
		"timezone":    user.Timezone,
		"iat":         time.Now().Unix(),
		"exp":         time.Now().Add(7 * 24 * time.Hour).Unix(),
	})
	return token.SignedString([]byte(cfg.JWTSecret))
}

func VerifyToken(tokenString string) (*models.JWTPayload, error) {
	cfg := config.Get()
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(cfg.JWTSecret), nil
	}, jwt.WithValidMethods([]string{"HS256"}), jwt.WithLeeway(30*time.Second))
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return nil, jwt.ErrTokenInvalidClaims
	}

	return &models.JWTPayload{
		ID:          getString(claims, "id"),
		Username:    getString(claims, "username"),
		DisplayName: getString(claims, "displayName"),
		Timezone:    getString(claims, "timezone"),
	}, nil
}

func getString(claims jwt.MapClaims, key string) string {
	v, _ := claims[key].(string)
	return v
}

func AuthMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			var tokenStr string

			// Try cookie first
			cookie, err := c.Cookie(CookieName)
			if err == nil && cookie.Value != "" {
				tokenStr = cookie.Value
			}

			// Fallback to Authorization header
			if tokenStr == "" {
				auth := c.Request().Header.Get("Authorization")
				if strings.HasPrefix(auth, "Bearer ") {
					tokenStr = strings.TrimPrefix(auth, "Bearer ")
				}
			}

			if tokenStr != "" {
				payload, err := VerifyToken(tokenStr)
				if err == nil {
					c.Set(string(UserContextKey), payload)
				}
			}

			return next(c)
		}
	}
}

func RequireAuth(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		user := c.Get(string(UserContextKey))
		if user == nil {
			return c.JSON(http.StatusUnauthorized, map[string]string{"error": "Authentication required"})
		}
		return next(c)
	}
}

func GetUser(c echo.Context) *models.JWTPayload {
	u, ok := c.Get(string(UserContextKey)).(*models.JWTPayload)
	if !ok {
		return nil
	}
	return u
}
