package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"

	"rina-backend/internal/config"
	"rina-backend/internal/models"
)

func setupTestConfig(t *testing.T) {
	config.Set(config.Config{
		Port:         8080,
		NodeEnv:      "development",
		DatabaseURL:  "postgres://localhost/test",
		RedisURL:     "redis://localhost:6379",
		JWTSecret:    "supersecretkeythatis32byteslong!!",
		CookieSecret: "supersecretcookiethatis32bytes!!",
	})
}

func TestGenerateToken(t *testing.T) {
	setupTestConfig(t)

	user := &models.User{
		ID:          "user-1",
		Username:    "maroon",
		DisplayName: "Maroon",
		Timezone:    "UTC",
	}

	t.Run("success", func(t *testing.T) {
		token, err := GenerateToken(user)
		assert.NoError(t, err)
		assert.NotEmpty(t, token)
	})
}

func TestVerifyToken(t *testing.T) {
	setupTestConfig(t)

	user := &models.User{
		ID:          "user-1",
		Username:    "maroon",
		DisplayName: "Maroon",
		Timezone:    "UTC",
	}

	t.Run("valid token", func(t *testing.T) {
		token, err := GenerateToken(user)
		assert.NoError(t, err)

		payload, err := VerifyToken(token)
		assert.NoError(t, err)
		assert.NotNil(t, payload)
		assert.Equal(t, "user-1", payload.ID)
		assert.Equal(t, "maroon", payload.Username)
		assert.Equal(t, "Maroon", payload.DisplayName)
		assert.Equal(t, "UTC", payload.Timezone)
	})

	t.Run("invalid token", func(t *testing.T) {
		payload, err := VerifyToken("invalid.token.here")
		assert.Error(t, err)
		assert.Nil(t, payload)
	})

	t.Run("expired token", func(t *testing.T) {
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"id":          "user-1",
			"username":    "maroon",
			"displayName": "Maroon",
			"timezone":    "UTC",
			"iat":         time.Now().Add(-14 * 24 * time.Hour).Unix(),
			"exp":         time.Now().Add(-7 * 24 * time.Hour).Unix(),
		})
		tokenString, err := token.SignedString([]byte(config.Get().JWTSecret))
		assert.NoError(t, err)

		payload, err := VerifyToken(tokenString)
		assert.Error(t, err)
		assert.Nil(t, payload)
	})

	t.Run("wrong signing method", func(t *testing.T) {
		token := jwt.NewWithClaims(jwt.SigningMethodNone, jwt.MapClaims{
			"id":       "user-1",
			"username": "maroon",
			"exp":      time.Now().Add(7 * 24 * time.Hour).Unix(),
		})
		tokenString, err := token.SignedString(jwt.UnsafeAllowNoneSignatureType)
		assert.NoError(t, err)

		payload, err := VerifyToken(tokenString)
		assert.Error(t, err)
		assert.Nil(t, payload)
	})
}

func TestAuthMiddleware(t *testing.T) {
	setupTestConfig(t)

	e := echo.New()
	handler := func(c echo.Context) error {
		return c.String(http.StatusOK, "ok")
	}

	t.Run("no token", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		m := AuthMiddleware()
		err := m(handler)(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Nil(t, GetUser(c))
	})

	t.Run("valid cookie", func(t *testing.T) {
		user := &models.User{
			ID:          "user-1",
			Username:    "maroon",
			DisplayName: "Maroon",
			Timezone:    "UTC",
		}
		token, err := GenerateToken(user)
		assert.NoError(t, err)

		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.AddCookie(&http.Cookie{Name: CookieName, Value: token})
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		m := AuthMiddleware()
		err = m(handler)(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.NotNil(t, GetUser(c))
		assert.Equal(t, "user-1", GetUser(c).ID)
	})

	t.Run("valid bearer header", func(t *testing.T) {
		user := &models.User{
			ID:          "user-1",
			Username:    "maroon",
			DisplayName: "Maroon",
			Timezone:    "UTC",
		}
		token, err := GenerateToken(user)
		assert.NoError(t, err)

		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		m := AuthMiddleware()
		err = m(handler)(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.NotNil(t, GetUser(c))
	})

	t.Run("invalid token in cookie", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.AddCookie(&http.Cookie{Name: CookieName, Value: "bad-token"})
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		m := AuthMiddleware()
		err := m(handler)(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Nil(t, GetUser(c))
	})
}

func TestRequireAuth(t *testing.T) {
	e := echo.New()
	handler := func(c echo.Context) error {
		return c.String(http.StatusOK, "ok")
	}

	t.Run("unauthorized", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		err := RequireAuth(handler)(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("authorized", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.Set(string(UserContextKey), &models.JWTPayload{ID: "user-1"})

		err := RequireAuth(handler)(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)
	})
}

func TestGetUser(t *testing.T) {
	e := echo.New()

	t.Run("returns user", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.Set(string(UserContextKey), &models.JWTPayload{ID: "user-1"})

		user := GetUser(c)
		assert.NotNil(t, user)
		assert.Equal(t, "user-1", user.ID)
	})

	t.Run("returns nil", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		user := GetUser(c)
		assert.Nil(t, user)
	})

	t.Run("returns nil on wrong type", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.Set(string(UserContextKey), "not-a-jwt-payload")

		user := GetUser(c)
		assert.Nil(t, user)
	})
}

func TestAdminOnly(t *testing.T) {
	e := echo.New()
	handler := func(c echo.Context) error {
		return c.String(http.StatusOK, "ok")
	}

	// AdminOnly is in handlers package, not middleware. Skip here.
	_ = e
	_ = handler
}
