package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"golang.org/x/crypto/bcrypt"

	"rina-backend/internal/config"
	"rina-backend/internal/db"
	"rina-backend/internal/models"
	authmw "rina-backend/internal/middleware"
	"rina-backend/internal/services"
)

// ─── Mocks ─────────────────────────────────────────────────────────

type mockDBPool struct {
	queryRowFunc func(ctx context.Context, sql string, args ...any) pgx.Row
	queryFunc    func(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	execFunc     func(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
}

func (m *mockDBPool) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	if m.queryRowFunc != nil {
		return m.queryRowFunc(ctx, sql, args...)
	}
	return &mockRow{}
}

func (m *mockDBPool) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	if m.queryFunc != nil {
		return m.queryFunc(ctx, sql, args...)
	}
	return &mockRows{}, nil
}

func (m *mockDBPool) Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error) {
	if m.execFunc != nil {
		return m.execFunc(ctx, sql, arguments...)
	}
	return pgconn.CommandTag{}, nil
}

type mockRow struct {
	scanFunc func(dest ...any) error
}

func (m *mockRow) Scan(dest ...any) error {
	if m.scanFunc != nil {
		return m.scanFunc(dest...)
	}
	return nil
}

type mockRows struct {
	nextReturns   []bool
	nextIdx       int
	scanFunc      func(dest ...any) error
	scanCallCount int
	closeCalled   bool
	errFunc       func() error
}

func (m *mockRows) Close() {
	m.closeCalled = true
}

func (m *mockRows) Err() error {
	if m.errFunc != nil {
		return m.errFunc()
	}
	return nil
}

func (m *mockRows) CommandTag() pgconn.CommandTag {
	return pgconn.CommandTag{}
}

func (m *mockRows) FieldDescriptions() []pgconn.FieldDescription {
	return nil
}

func (m *mockRows) Next() bool {
	if m.nextIdx < len(m.nextReturns) {
		v := m.nextReturns[m.nextIdx]
		m.nextIdx++
		return v
	}
	return false
}

func (m *mockRows) Scan(dest ...any) error {
	m.scanCallCount++
	if m.scanFunc != nil {
		return m.scanFunc(dest...)
	}
	return nil
}

func (m *mockRows) Values() ([]any, error) {
	return nil, nil
}

func (m *mockRows) RawValues() [][]byte {
	return nil
}

func (m *mockRows) Conn() *pgx.Conn {
	return nil
}

// ─── Helpers ───────────────────────────────────────────────────────

func setupEcho(method, target string, body io.Reader) (echo.Context, *httptest.ResponseRecorder) {
	e := echo.New()
	req := httptest.NewRequest(method, target, body)
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	return c, rec
}

func setupEchoWithAuth(method, target string, body io.Reader, user *models.JWTPayload) (echo.Context, *httptest.ResponseRecorder) {
	c, rec := setupEcho(method, target, body)
	if user != nil {
		c.Set(string(authmw.UserContextKey), user)
	}
	return c, rec
}

func strPtr(s string) *string { return &s }

func setupTestConfig(t *testing.T) {
	hash, err := bcrypt.GenerateFromPassword([]byte("testpass"), bcrypt.DefaultCost)
	assert.NoError(t, err)

	config.Set(config.Config{
		Port:               8080,
		NodeEnv:            "development",
		DatabaseURL:        "postgres://localhost/test",
		RedisURL:           "redis://localhost:6379",
		JWTSecret:          "supersecretkeythatis32byteslong!!",
		CookieSecret:       "supersecretcookiethatis32bytes!!",
		MaroonPasswordHash: string(hash),
		RinaPasswordHash:   string(hash),
		YoutubeAPIKey:      "",
		VapidPublicKey:     "",
		VapidPrivateKey:    "",
		CoturnRealm:        "",
		CoturnSecret:       "",
	})

	services.ClearPartnershipCache()
}

func jsonBody(v any) io.Reader {
	b, _ := json.Marshal(v)
	return bytes.NewReader(b)
}

// ─── Auth Tests ────────────────────────────────────────────────────

func TestLogin(t *testing.T) {
	setupTestConfig(t)

	t.Run("success", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					*dest[0].(*string) = "user-id-1"
					*dest[1].(*string) = "maroon"
					*dest[2].(*string) = "Maroon"
					*(dest[3].(**string)) = strPtr("")
					*dest[4].(*string) = "UTC"
					*dest[5].(*time.Time) = time.Now()
					*dest[6].(*time.Time) = time.Now()
					return nil
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEcho(http.MethodPost, "/login", jsonBody(map[string]string{
			"username": "maroon",
			"password": "testpass",
		}))
		err := Login(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp models.User
		assert.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.Equal(t, "maroon", resp.Username)

		cookies := rec.Result().Cookies()
		assert.Len(t, cookies, 1)
		assert.Equal(t, authmw.CookieName, cookies[0].Name)
		assert.NotEmpty(t, cookies[0].Value)
	})

	t.Run("invalid username", func(t *testing.T) {
		c, rec := setupEcho(http.MethodPost, "/login", jsonBody(map[string]string{
			"username": "unknown",
			"password": "testpass",
		}))
		err := Login(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("invalid password", func(t *testing.T) {
		c, rec := setupEcho(http.MethodPost, "/login", jsonBody(map[string]string{
			"username": "maroon",
			"password": "wrongpass",
		}))
		err := Login(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("db error", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					return errors.New("db down")
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEcho(http.MethodPost, "/login", jsonBody(map[string]string{
			"username": "maroon",
			"password": "testpass",
		}))
		err := Login(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}

func TestLogout(t *testing.T) {
	setupTestConfig(t)
	c, rec := setupEcho(http.MethodPost, "/logout", nil)
	err := Logout(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)

	cookies := rec.Result().Cookies()
	assert.Len(t, cookies, 1)
	assert.Equal(t, authmw.CookieName, cookies[0].Name)
	assert.Equal(t, "", cookies[0].Value)
	assert.Equal(t, -1, cookies[0].MaxAge)
}

func TestGetMe(t *testing.T) {
	setupTestConfig(t)
	now := time.Now()

	t.Run("unauthorized", func(t *testing.T) {
		c, rec := setupEchoWithAuth(http.MethodGet, "/me", nil, nil)
		err := GetMe(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("success with partner", func(t *testing.T) {
		services.ClearPartnershipCache()
		userID := "user-a"
		partnerID := "user-b"

		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				if strings.Contains(sql, "partnerships") {
					return &mockRow{scanFunc: func(dest ...any) error {
						*dest[0].(*string) = partnerID
						return nil
					}}
				}
				return &mockRow{scanFunc: func(dest ...any) error {
					id := dest[0].(*string)
					username := dest[1].(*string)
					displayName := dest[2].(*string)
					avatarURL := dest[3].(**string)
					tz := dest[4].(*string)
					createdAt := dest[5].(*time.Time)
					updatedAt := dest[6].(*time.Time)

					if args[0] == userID {
						*id = userID
						*username = "maroon"
						*displayName = "Maroon"
						*avatarURL = strPtr("")
						*tz = "UTC"
						*createdAt = now
						*updatedAt = now
					} else if args[0] == partnerID {
						*id = partnerID
						*username = "rina"
						*displayName = "Rina"
						*avatarURL = strPtr("")
						*tz = "UTC"
						*createdAt = now
						*updatedAt = now
					}
					return nil
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodGet, "/me", nil, &models.JWTPayload{
			ID:       userID,
			Username: "maroon",
		})
		err := GetMe(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp map[string]any
		assert.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.NotNil(t, resp["user"])
		assert.NotNil(t, resp["partner"])
	})

	t.Run("success without partner", func(t *testing.T) {
		services.ClearPartnershipCache()
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				if strings.Contains(sql, "partnerships") {
					return &mockRow{scanFunc: func(dest ...any) error {
						return pgx.ErrNoRows
					}}
				}
				return &mockRow{scanFunc: func(dest ...any) error {
					*dest[0].(*string) = "user-a"
					*dest[1].(*string) = "maroon"
					*dest[2].(*string) = "Maroon"
					*(dest[3].(**string)) = strPtr("")
					*dest[4].(*string) = "UTC"
					*dest[5].(*time.Time) = now
					*dest[6].(*time.Time) = now
					return nil
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodGet, "/me", nil, &models.JWTPayload{
			ID:       "user-a",
			Username: "maroon",
		})
		err := GetMe(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp map[string]any
		assert.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.NotNil(t, resp["user"])
		assert.Nil(t, resp["partner"])
	})

	t.Run("db error on user lookup", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					return errors.New("db error")
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodGet, "/me", nil, &models.JWTPayload{
			ID:       "user-a",
			Username: "maroon",
		})
		err := GetMe(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}

func TestUpdateMe(t *testing.T) {
	setupTestConfig(t)

	t.Run("unauthorized", func(t *testing.T) {
		c, rec := setupEchoWithAuth(http.MethodPatch, "/me", jsonBody(map[string]string{"displayName": "New"}), nil)
		err := UpdateMe(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("success", func(t *testing.T) {
		mock := &mockDBPool{
			execFunc: func(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error) {
				return pgconn.CommandTag{}, nil
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPatch, "/me", jsonBody(map[string]string{"displayName": "New"}), &models.JWTPayload{
			ID:       "user-a",
			Username: "maroon",
		})
		err := UpdateMe(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("db error", func(t *testing.T) {
		mock := &mockDBPool{
			execFunc: func(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error) {
				return pgconn.CommandTag{}, errors.New("db error")
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPatch, "/me", jsonBody(map[string]string{"displayName": "New"}), &models.JWTPayload{
			ID:       "user-a",
			Username: "maroon",
		})
		err := UpdateMe(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}

func TestGetNotifications(t *testing.T) {
	setupTestConfig(t)
	now := time.Now()

	t.Run("success", func(t *testing.T) {
		mock := &mockDBPool{
			queryFunc: func(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
				return &mockRows{
					nextReturns: []bool{true, true, false},
					scanFunc: func(dest ...any) error {
						*dest[0].(*string) = "notif-1"
						*dest[1].(*string) = "user-a"
						*dest[2].(*string) = "msg"
						*dest[3].(*string) = "Title"
						*dest[4].(*string) = "Body"
						*(dest[5].(**map[string]any)) = nil
						*dest[6].(*bool) = false
						*dest[7].(*time.Time) = now
						return nil
					},
				}, nil
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodGet, "/notifications", nil, &models.JWTPayload{ID: "user-a"})
		err := GetNotifications(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp []models.Notification
		assert.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.Len(t, resp, 2)
	})

	t.Run("db error", func(t *testing.T) {
		mock := &mockDBPool{
			queryFunc: func(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
				return nil, errors.New("db error")
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodGet, "/notifications", nil, &models.JWTPayload{ID: "user-a"})
		err := GetNotifications(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}

func TestMarkNotificationsRead(t *testing.T) {
	setupTestConfig(t)

	t.Run("success", func(t *testing.T) {
		mock := &mockDBPool{
			execFunc: func(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error) {
				return pgconn.CommandTag{}, nil
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPost, "/notifications/read", nil, &models.JWTPayload{ID: "user-a"})
		err := MarkNotificationsRead(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("db error", func(t *testing.T) {
		mock := &mockDBPool{
			execFunc: func(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error) {
				return pgconn.CommandTag{}, errors.New("db error")
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPost, "/notifications/read", nil, &models.JWTPayload{ID: "user-a"})
		err := MarkNotificationsRead(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}

// ─── Messages Tests ────────────────────────────────────────────────

func TestListMessages(t *testing.T) {
	setupTestConfig(t)
	now := time.Now()

	t.Run("success default limit", func(t *testing.T) {
		mock := &mockDBPool{
			queryFunc: func(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
				return &mockRows{
					nextReturns: []bool{true, false},
					scanFunc: func(dest ...any) error {
						*dest[0].(*string) = "msg-1"
						*dest[1].(*string) = "user-a"
						*dest[2].(*string) = "hello"
						*dest[3].(*string) = "TEXT"
						*dest[7].(*time.Time) = now
						return nil
					},
				}, nil
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodGet, "/messages", nil, &models.JWTPayload{ID: "user-a"})
		err := ListMessages(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp []models.Message
		assert.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.Len(t, resp, 1)
		assert.Equal(t, "hello", resp[0].Content)
	})

	t.Run("success with before", func(t *testing.T) {
		mock := &mockDBPool{
			queryFunc: func(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
				assert.Len(t, args, 2) // before, limit
				return &mockRows{nextReturns: []bool{false}}, nil
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodGet, "/messages?before=2024-01-01T00:00:00Z&limit=10", nil, &models.JWTPayload{ID: "user-a"})
		err := ListMessages(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "null\n", rec.Body.String())
	})

	t.Run("db error", func(t *testing.T) {
		mock := &mockDBPool{
			queryFunc: func(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
				return nil, errors.New("db error")
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodGet, "/messages", nil, &models.JWTPayload{ID: "user-a"})
		err := ListMessages(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}

func TestCreateMessage(t *testing.T) {
	setupTestConfig(t)
	now := time.Now()

	t.Run("success", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				if strings.Contains(sql, "EXISTS") {
					return &mockRow{scanFunc: func(dest ...any) error {
						*dest[0].(*bool) = true
						return nil
					}}
				}
				return &mockRow{scanFunc: func(dest ...any) error {
					*dest[0].(*string) = "msg-1"
					*dest[1].(*time.Time) = now
					return nil
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPost, "/messages", jsonBody(messageRequest{
			Content:   "hello",
			Type:      "TEXT",
			ReplyToID: strPtr("reply-id"),
		}), &models.JWTPayload{ID: "user-a"})
		err := CreateMessage(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusCreated, rec.Code)

		var resp models.Message
		assert.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.Equal(t, "hello", resp.Content)
	})

	t.Run("invalid request", func(t *testing.T) {
		c, rec := setupEchoWithAuth(http.MethodPost, "/messages", strings.NewReader("not json"), &models.JWTPayload{ID: "user-a"})
		err := CreateMessage(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("empty content", func(t *testing.T) {
		c, rec := setupEchoWithAuth(http.MethodPost, "/messages", jsonBody(messageRequest{Content: ""}), &models.JWTPayload{ID: "user-a"})
		err := CreateMessage(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("reply to not found", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					*dest[0].(*bool) = false
					return nil
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPost, "/messages", jsonBody(messageRequest{
			Content:   "hello",
			ReplyToID: strPtr("bad-id"),
		}), &models.JWTPayload{ID: "user-a"})
		err := CreateMessage(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("db insert error", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					return errors.New("db error")
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPost, "/messages", jsonBody(messageRequest{Content: "hello"}), &models.JWTPayload{ID: "user-a"})
		err := CreateMessage(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}

func TestEditMessage(t *testing.T) {
	setupTestConfig(t)
	now := time.Now()

	t.Run("success", func(t *testing.T) {
		callCount := 0
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				callCount++
				return &mockRow{scanFunc: func(dest ...any) error {
					if callCount == 1 {
						*dest[0].(*string) = "user-a"
						return nil
					}
					*dest[0].(*string) = "msg-1"
					*dest[1].(*string) = "user-a"
					*dest[2].(*string) = "updated"
					*dest[3].(*string) = "TEXT"
					*(dest[6].(**time.Time)) = &now
					*dest[7].(*time.Time) = now
					return nil
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPatch, "/messages/msg-1", jsonBody(map[string]string{"content": "updated"}), &models.JWTPayload{ID: "user-a"})
		c.SetParamNames("id")
		c.SetParamValues("msg-1")
		err := EditMessage(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("message not found", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					return pgx.ErrNoRows
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPatch, "/messages/msg-1", jsonBody(map[string]string{"content": "updated"}), &models.JWTPayload{ID: "user-a"})
		c.SetParamNames("id")
		c.SetParamValues("msg-1")
		err := EditMessage(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("forbidden", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					*dest[0].(*string) = "user-b"
					return nil
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPatch, "/messages/msg-1", jsonBody(map[string]string{"content": "updated"}), &models.JWTPayload{ID: "user-a"})
		c.SetParamNames("id")
		c.SetParamValues("msg-1")
		err := EditMessage(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusForbidden, rec.Code)
	})

	t.Run("db update error", func(t *testing.T) {
		callCount := 0
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				callCount++
				return &mockRow{scanFunc: func(dest ...any) error {
					if callCount == 1 {
						*dest[0].(*string) = "user-a"
						return nil
					}
					return errors.New("db error")
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPatch, "/messages/msg-1", jsonBody(map[string]string{"content": "updated"}), &models.JWTPayload{ID: "user-a"})
		c.SetParamNames("id")
		c.SetParamValues("msg-1")
		err := EditMessage(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}

func TestDeleteMessage(t *testing.T) {
	setupTestConfig(t)

	t.Run("success", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					*dest[0].(*string) = "user-a"
					return nil
				}}
			},
			execFunc: func(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error) {
				return pgconn.CommandTag{}, nil
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodDelete, "/messages/msg-1", nil, &models.JWTPayload{ID: "user-a"})
		c.SetParamNames("id")
		c.SetParamValues("msg-1")
		err := DeleteMessage(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("not found", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					return pgx.ErrNoRows
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodDelete, "/messages/msg-1", nil, &models.JWTPayload{ID: "user-a"})
		c.SetParamNames("id")
		c.SetParamValues("msg-1")
		err := DeleteMessage(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("forbidden", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					*dest[0].(*string) = "user-b"
					return nil
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodDelete, "/messages/msg-1", nil, &models.JWTPayload{ID: "user-a"})
		c.SetParamNames("id")
		c.SetParamValues("msg-1")
		err := DeleteMessage(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusForbidden, rec.Code)
	})
}

// ─── Calendar Tests ────────────────────────────────────────────────

func TestListCalendar(t *testing.T) {
	setupTestConfig(t)
	now := time.Now()

	t.Run("success without filters", func(t *testing.T) {
		mock := &mockDBPool{
			queryFunc: func(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
				assert.Len(t, args, 1)
				return &mockRows{
					nextReturns: []bool{true, false},
					scanFunc: func(dest ...any) error {
						*dest[0].(*string) = "evt-1"
						*dest[1].(*string) = "Meeting"
						*dest[3].(*time.Time) = now
						*dest[5].(*string) = "SHARED"
						*dest[6].(*string) = "user-a"
						*dest[7].(*bool) = false
						*dest[9].(*time.Time) = now
						*dest[10].(*time.Time) = now
						return nil
					},
				}, nil
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodGet, "/calendar", nil, &models.JWTPayload{ID: "user-a"})
		err := ListCalendar(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp []models.CalendarEvent
		assert.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.Len(t, resp, 1)
		assert.Equal(t, "Meeting", resp[0].Title)
	})

	t.Run("success with filters", func(t *testing.T) {
		mock := &mockDBPool{
			queryFunc: func(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
				assert.Len(t, args, 3)
				return &mockRows{nextReturns: []bool{false}}, nil
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodGet, "/calendar?from=2024-01-01T00:00:00Z&to=2024-12-31T23:59:59Z", nil, &models.JWTPayload{ID: "user-a"})
		err := ListCalendar(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("db error", func(t *testing.T) {
		mock := &mockDBPool{
			queryFunc: func(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
				return nil, errors.New("db error")
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodGet, "/calendar", nil, &models.JWTPayload{ID: "user-a"})
		err := ListCalendar(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}

func TestCreateCalendar(t *testing.T) {
	setupTestConfig(t)
	now := time.Now()

	t.Run("success", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					*dest[0].(*string) = "evt-1"
					*dest[1].(*time.Time) = now
					*dest[2].(*time.Time) = now
					return nil
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPost, "/calendar", jsonBody(map[string]any{
			"title":     "Meeting",
			"startTime": now.Format(time.RFC3339),
			"type":      "WORK",
			"allDay":    false,
		}), &models.JWTPayload{ID: "user-a"})
		err := CreateCalendar(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusCreated, rec.Code)

		var resp models.CalendarEvent
		assert.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.Equal(t, "Meeting", resp.Title)
	})

	t.Run("invalid request", func(t *testing.T) {
		c, rec := setupEchoWithAuth(http.MethodPost, "/calendar", strings.NewReader("not json"), &models.JWTPayload{ID: "user-a"})
		err := CreateCalendar(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("db error", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					return errors.New("db error")
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPost, "/calendar", jsonBody(map[string]any{
			"title":     "Meeting",
			"startTime": now.Format(time.RFC3339),
		}), &models.JWTPayload{ID: "user-a"})
		err := CreateCalendar(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}

func TestUpdateCalendar(t *testing.T) {
	setupTestConfig(t)

	t.Run("success", func(t *testing.T) {
		callCount := 0
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				callCount++
				return &mockRow{scanFunc: func(dest ...any) error {
					if callCount == 1 {
						*dest[0].(*string) = "user-a"
						return nil
					}
					return nil
				}}
			},
			execFunc: func(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error) {
				return pgconn.CommandTag{}, nil
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPatch, "/calendar/evt-1", jsonBody(map[string]string{"title": "Updated"}), &models.JWTPayload{ID: "user-a"})
		c.SetParamNames("id")
		c.SetParamValues("evt-1")
		err := UpdateCalendar(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("not found", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					return pgx.ErrNoRows
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPatch, "/calendar/evt-1", jsonBody(map[string]string{"title": "Updated"}), &models.JWTPayload{ID: "user-a"})
		c.SetParamNames("id")
		c.SetParamValues("evt-1")
		err := UpdateCalendar(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("forbidden", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					*dest[0].(*string) = "user-b"
					return nil
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPatch, "/calendar/evt-1", jsonBody(map[string]string{"title": "Updated"}), &models.JWTPayload{ID: "user-a"})
		c.SetParamNames("id")
		c.SetParamValues("evt-1")
		err := UpdateCalendar(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusForbidden, rec.Code)
	})
}

func TestDeleteCalendar(t *testing.T) {
	setupTestConfig(t)

	t.Run("success", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					*dest[0].(*string) = "user-a"
					return nil
				}}
			},
			execFunc: func(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error) {
				return pgconn.CommandTag{}, nil
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodDelete, "/calendar/evt-1", nil, &models.JWTPayload{ID: "user-a"})
		c.SetParamNames("id")
		c.SetParamValues("evt-1")
		err := DeleteCalendar(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("not found", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					return pgx.ErrNoRows
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodDelete, "/calendar/evt-1", nil, &models.JWTPayload{ID: "user-a"})
		c.SetParamNames("id")
		c.SetParamValues("evt-1")
		err := DeleteCalendar(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}

// ─── Cycle Tests ───────────────────────────────────────────────────

func TestListCycle(t *testing.T) {
	setupTestConfig(t)
	now := time.Now()

	t.Run("success", func(t *testing.T) {
		mock := &mockDBPool{
			queryFunc: func(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
				return &mockRows{
					nextReturns: []bool{true, false},
					scanFunc: func(dest ...any) error {
						*dest[0].(*string) = "entry-1"
						*dest[1].(*string) = "user-a"
						*dest[2].(*time.Time) = now
						*dest[4].(*[]string) = nil
						*dest[7].(*time.Time) = now
						return nil
					},
				}, nil
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodGet, "/cycle", nil, &models.JWTPayload{ID: "user-a"})
		err := ListCycle(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp []models.CycleEntry
		assert.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.Len(t, resp, 1)
	})

	t.Run("db error", func(t *testing.T) {
		mock := &mockDBPool{
			queryFunc: func(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
				return nil, errors.New("db error")
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodGet, "/cycle", nil, &models.JWTPayload{ID: "user-a"})
		err := ListCycle(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}

func TestCreateCycle(t *testing.T) {
	setupTestConfig(t)
	now := time.Now()

	t.Run("success", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					*dest[0].(*string) = "entry-1"
					*dest[1].(*time.Time) = now
					return nil
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPost, "/cycle", jsonBody(map[string]any{
			"date": now.Format("2006-01-02"),
		}), &models.JWTPayload{ID: "user-a"})
		err := CreateCycle(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusCreated, rec.Code)

		var resp models.CycleEntry
		assert.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.Equal(t, "user-a", resp.UserID)
	})

	t.Run("invalid request", func(t *testing.T) {
		c, rec := setupEchoWithAuth(http.MethodPost, "/cycle", strings.NewReader("bad"), &models.JWTPayload{ID: "user-a"})
		err := CreateCycle(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("db error", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					return errors.New("db error")
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPost, "/cycle", jsonBody(map[string]any{
			"date": "2024-01-01",
		}), &models.JWTPayload{ID: "user-a"})
		err := CreateCycle(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}

func TestUpdateCycle(t *testing.T) {
	setupTestConfig(t)

	t.Run("success", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					*dest[0].(*string) = "user-a"
					return nil
				}}
			},
			execFunc: func(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error) {
				return pgconn.CommandTag{}, nil
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPatch, "/cycle/entry-1", jsonBody(map[string]any{"notes": "note"}), &models.JWTPayload{ID: "user-a"})
		c.SetParamNames("id")
		c.SetParamValues("entry-1")
		err := UpdateCycle(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("not found", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					return pgx.ErrNoRows
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPatch, "/cycle/entry-1", jsonBody(map[string]any{"notes": "note"}), &models.JWTPayload{ID: "user-a"})
		c.SetParamNames("id")
		c.SetParamValues("entry-1")
		err := UpdateCycle(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("forbidden", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					*dest[0].(*string) = "user-b"
					return nil
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPatch, "/cycle/entry-1", jsonBody(map[string]any{"notes": "note"}), &models.JWTPayload{ID: "user-a"})
		c.SetParamNames("id")
		c.SetParamValues("entry-1")
		err := UpdateCycle(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusForbidden, rec.Code)
	})
}

func TestDeleteCycle(t *testing.T) {
	setupTestConfig(t)

	t.Run("success", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					*dest[0].(*string) = "user-a"
					return nil
				}}
			},
			execFunc: func(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error) {
				return pgconn.CommandTag{}, nil
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodDelete, "/cycle/entry-1", nil, &models.JWTPayload{ID: "user-a"})
		c.SetParamNames("id")
		c.SetParamValues("entry-1")
		err := DeleteCycle(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("not found", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					return pgx.ErrNoRows
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodDelete, "/cycle/entry-1", nil, &models.JWTPayload{ID: "user-a"})
		c.SetParamNames("id")
		c.SetParamValues("entry-1")
		err := DeleteCycle(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}

// ─── Movies Tests ──────────────────────────────────────────────────

func TestListMovies(t *testing.T) {
	setupTestConfig(t)
	now := time.Now()

	t.Run("success", func(t *testing.T) {
		mock := &mockDBPool{
			queryFunc: func(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
				return &mockRows{
					nextReturns: []bool{true, false},
					scanFunc: func(dest ...any) error {
						*dest[0].(*string) = "movie-1"
						*dest[1].(*string) = "Inception"
						*dest[6].(*string) = "user-a"
						*dest[7].(*time.Time) = now
						return nil
					},
				}, nil
			},
		}
		db.SetPool(mock)

		c, rec := setupEcho(http.MethodGet, "/movies", nil)
		err := ListMovies(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp []models.Movie
		assert.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.Len(t, resp, 1)
		assert.Equal(t, "Inception", resp[0].Title)
	})

	t.Run("db error", func(t *testing.T) {
		mock := &mockDBPool{
			queryFunc: func(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
				return nil, errors.New("db error")
			},
		}
		db.SetPool(mock)

		c, rec := setupEcho(http.MethodGet, "/movies", nil)
		err := ListMovies(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}

func TestGetMovie(t *testing.T) {
	setupTestConfig(t)
	now := time.Now()

	t.Run("success", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					*dest[0].(*string) = "movie-1"
					*dest[1].(*string) = "Inception"
					*dest[6].(*string) = "user-a"
					*dest[7].(*time.Time) = now
					return nil
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEcho(http.MethodGet, "/movies/movie-1", nil)
		c.SetParamNames("id")
		c.SetParamValues("movie-1")
		err := GetMovie(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp models.Movie
		assert.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.Equal(t, "Inception", resp.Title)
	})

	t.Run("not found", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					return pgx.ErrNoRows
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEcho(http.MethodGet, "/movies/movie-1", nil)
		c.SetParamNames("id")
		c.SetParamValues("movie-1")
		err := GetMovie(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}

func TestCreateMovie(t *testing.T) {
	setupTestConfig(t)
	now := time.Now()

	buildMultipart := func(title string, hasFile bool) (io.Reader, string) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		writer.WriteField("title", title)
		writer.WriteField("posterPath", "poster.jpg")
		if hasFile {
			part, _ := writer.CreateFormFile("file", "test.mp4")
			part.Write([]byte("fake video data"))
		}
		writer.Close()
		return body, writer.FormDataContentType()
	}

	t.Run("success without s3", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					*dest[0].(*string) = "movie-1"
					*dest[1].(*time.Time) = now
					return nil
				}}
			},
		}
		db.SetPool(mock)

		body, ct := buildMultipart("Inception", true)
		c, rec := setupEchoWithAuth(http.MethodPost, "/movies", body, &models.JWTPayload{ID: "user-a"})
		c.Request().Header.Set(echo.HeaderContentType, ct)
		err := CreateMovie(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusCreated, rec.Code)

		var resp models.Movie
		assert.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.Equal(t, "Inception", resp.Title)
	})

	t.Run("missing title", func(t *testing.T) {
		body, ct := buildMultipart("", true)
		c, rec := setupEchoWithAuth(http.MethodPost, "/movies", body, &models.JWTPayload{ID: "user-a"})
		c.Request().Header.Set(echo.HeaderContentType, ct)
		err := CreateMovie(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("missing file", func(t *testing.T) {
		body, ct := buildMultipart("Inception", false)
		c, rec := setupEchoWithAuth(http.MethodPost, "/movies", body, &models.JWTPayload{ID: "user-a"})
		c.Request().Header.Set(echo.HeaderContentType, ct)
		err := CreateMovie(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("db error", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					return errors.New("db error")
				}}
			},
		}
		db.SetPool(mock)

		body, ct := buildMultipart("Inception", true)
		c, rec := setupEchoWithAuth(http.MethodPost, "/movies", body, &models.JWTPayload{ID: "user-a"})
		c.Request().Header.Set(echo.HeaderContentType, ct)
		err := CreateMovie(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}

func TestDeleteMovie(t *testing.T) {
	setupTestConfig(t)

	t.Run("success", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					*dest[0].(*string) = "s3-key"
					return nil
				}}
			},
			execFunc: func(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error) {
				return pgconn.CommandTag{}, nil
			},
		}
		db.SetPool(mock)

		c, rec := setupEcho(http.MethodDelete, "/movies/movie-1", nil)
		c.SetParamNames("id")
		c.SetParamValues("movie-1")
		err := DeleteMovie(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("not found", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					return pgx.ErrNoRows
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEcho(http.MethodDelete, "/movies/movie-1", nil)
		c.SetParamNames("id")
		c.SetParamValues("movie-1")
		err := DeleteMovie(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}

// ─── YouTube Tests ─────────────────────────────────────────────────

type mockTransport struct {
	resp *http.Response
	err  error
}

func (m *mockTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return m.resp, m.err
}

func TestSearchYouTube(t *testing.T) {
	setupTestConfig(t)

	t.Run("missing query", func(t *testing.T) {
		c, rec := setupEcho(http.MethodGet, "/youtube", nil)
		err := SearchYouTube(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("api not configured", func(t *testing.T) {
		c, rec := setupEcho(http.MethodGet, "/youtube?q=test", nil)
		err := SearchYouTube(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusServiceUnavailable, rec.Code)
	})

	t.Run("success", func(t *testing.T) {
		config.Set(config.Config{
			Port:          8080,
			NodeEnv:       "development",
			DatabaseURL:   "postgres://localhost/test",
			RedisURL:      "redis://localhost:6379",
			JWTSecret:     "supersecretkeythatis32byteslong!!",
			CookieSecret:  "supersecretcookiethatis32bytes!!",
			YoutubeAPIKey: "fake-api-key",
		})

		oldTransport := http.DefaultClient.Transport
		defer func() { http.DefaultClient.Transport = oldTransport }()

		http.DefaultClient.Transport = &mockTransport{
			resp: &http.Response{
				StatusCode: http.StatusOK,
				Body: io.NopCloser(strings.NewReader(`{
					"items": [
						{
							"id": {"videoId": "abc123"},
							"snippet": {
								"title": "Test Video",
								"description": "A test video",
								"thumbnails": {"default": {"url": "http://thumb.jpg"}}
							}
						}
					]
				}`)),
				Header: http.Header{"Content-Type": []string{"application/json"}},
			},
		}

		c, rec := setupEcho(http.MethodGet, "/youtube?q=test", nil)
		err := SearchYouTube(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp []map[string]any
		assert.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.Len(t, resp, 1)
		assert.Equal(t, "abc123", resp[0]["videoId"])
	})

	t.Run("youtube request failed", func(t *testing.T) {
		config.Set(config.Config{
			Port:          8080,
			NodeEnv:       "development",
			DatabaseURL:   "postgres://localhost/test",
			RedisURL:      "redis://localhost:6379",
			JWTSecret:     "supersecretkeythatis32byteslong!!",
			CookieSecret:  "supersecretcookiethatis32bytes!!",
			YoutubeAPIKey: "fake-api-key",
		})

		oldTransport := http.DefaultClient.Transport
		defer func() { http.DefaultClient.Transport = oldTransport }()

		http.DefaultClient.Transport = &mockTransport{
			err: errors.New("network error"),
		}

		c, rec := setupEcho(http.MethodGet, "/youtube?q=test", nil)
		err := SearchYouTube(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusBadGateway, rec.Code)
	})
}

// ─── Push Tests ────────────────────────────────────────────────────

func TestSubscribePush(t *testing.T) {
	setupTestConfig(t)

	t.Run("success", func(t *testing.T) {
		mock := &mockDBPool{
			execFunc: func(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error) {
				return pgconn.CommandTag{}, nil
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPost, "/push/subscribe", jsonBody(map[string]string{
			"endpoint": "https://push.example.com/1",
			"p256dh":   "key",
			"auth":     "secret",
		}), &models.JWTPayload{ID: "user-a"})
		err := SubscribePush(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("invalid request", func(t *testing.T) {
		c, rec := setupEchoWithAuth(http.MethodPost, "/push/subscribe", strings.NewReader("bad"), &models.JWTPayload{ID: "user-a"})
		err := SubscribePush(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("db error", func(t *testing.T) {
		mock := &mockDBPool{
			execFunc: func(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error) {
				return pgconn.CommandTag{}, errors.New("db error")
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPost, "/push/subscribe", jsonBody(map[string]string{
			"endpoint": "https://push.example.com/1",
			"p256dh":   "key",
			"auth":     "secret",
		}), &models.JWTPayload{ID: "user-a"})
		err := SubscribePush(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}

func TestUnsubscribePush(t *testing.T) {
	setupTestConfig(t)

	t.Run("success", func(t *testing.T) {
		mock := &mockDBPool{
			execFunc: func(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error) {
				return pgconn.CommandTag{}, nil
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPost, "/push/unsubscribe", jsonBody(map[string]string{
			"endpoint": "https://push.example.com/1",
		}), &models.JWTPayload{ID: "user-a"})
		err := UnsubscribePush(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("db error", func(t *testing.T) {
		mock := &mockDBPool{
			execFunc: func(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error) {
				return pgconn.CommandTag{}, errors.New("db error")
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPost, "/push/unsubscribe", jsonBody(map[string]string{
			"endpoint": "https://push.example.com/1",
		}), &models.JWTPayload{ID: "user-a"})
		err := UnsubscribePush(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}

func TestNotifyPush(t *testing.T) {
	setupTestConfig(t)

	t.Run("no partner", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				return &mockRow{scanFunc: func(dest ...any) error {
					return pgx.ErrNoRows
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPost, "/push/notify", jsonBody(map[string]string{
			"title": "Hi",
			"body":  "Hello",
		}), &models.JWTPayload{ID: "user-a"})
		err := NotifyPush(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Contains(t, rec.Body.String(), "no partner")
	})

	t.Run("push not configured", func(t *testing.T) {
		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				if strings.Contains(sql, "partnerships") {
					return &mockRow{scanFunc: func(dest ...any) error {
						*dest[0].(*string) = "user-b"
						return nil
					}}
				}
				return &mockRow{scanFunc: func(dest ...any) error {
					return pgx.ErrNoRows
				}}
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPost, "/push/notify", jsonBody(map[string]string{
			"title": "Hi",
			"body":  "Hello",
		}), &models.JWTPayload{ID: "user-a"})
		err := NotifyPush(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusServiceUnavailable, rec.Code)
	})

	t.Run("db error fetching subscriptions", func(t *testing.T) {
		config.Set(config.Config{
			Port:           8080,
			NodeEnv:        "development",
			DatabaseURL:    "postgres://localhost/test",
			RedisURL:       "redis://localhost:6379",
			JWTSecret:      "supersecretkeythatis32byteslong!!",
			CookieSecret:   "supersecretcookiethatis32bytes!!",
			VapidPublicKey: "pub",
			VapidPrivateKey: "priv",
		})

		mock := &mockDBPool{
			queryRowFunc: func(ctx context.Context, sql string, args ...any) pgx.Row {
				if strings.Contains(sql, "partnerships") {
					return &mockRow{scanFunc: func(dest ...any) error {
						*dest[0].(*string) = "user-b"
						return nil
					}}
				}
				return &mockRow{scanFunc: func(dest ...any) error {
					return pgx.ErrNoRows
				}}
			},
			queryFunc: func(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
				return nil, errors.New("db error")
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPost, "/push/notify", jsonBody(map[string]string{
			"title": "Hi",
			"body":  "Hello",
		}), &models.JWTPayload{ID: "user-a"})
		err := NotifyPush(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}

func TestGetVapidPublicKey(t *testing.T) {
	setupTestConfig(t)

	t.Run("not configured", func(t *testing.T) {
		c, rec := setupEcho(http.MethodGet, "/push/vapid", nil)
		err := GetVapidPublicKey(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusServiceUnavailable, rec.Code)
	})

	t.Run("success", func(t *testing.T) {
		config.Set(config.Config{
			Port:           8080,
			NodeEnv:        "development",
			DatabaseURL:    "postgres://localhost/test",
			RedisURL:       "redis://localhost:6379",
			JWTSecret:      "supersecretkeythatis32byteslong!!",
			CookieSecret:   "supersecretcookiethatis32bytes!!",
			VapidPublicKey: "my-public-key",
		})

		c, rec := setupEcho(http.MethodGet, "/push/vapid", nil)
		err := GetVapidPublicKey(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Contains(t, rec.Body.String(), "my-public-key")
	})
}

// ─── RTC Tests ─────────────────────────────────────────────────────

func TestGetIceServers(t *testing.T) {
	setupTestConfig(t)

	t.Run("without coturn", func(t *testing.T) {
		c, rec := setupEchoWithAuth(http.MethodGet, "/rtc/ice", nil, &models.JWTPayload{Username: "maroon"})
		err := GetIceServers(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp map[string]any
		assert.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		servers := resp["iceServers"].([]any)
		assert.Len(t, servers, 1)
	})

	t.Run("with coturn", func(t *testing.T) {
		config.Set(config.Config{
			Port:         8080,
			NodeEnv:      "development",
			DatabaseURL:  "postgres://localhost/test",
			RedisURL:     "redis://localhost:6379",
			JWTSecret:    "supersecretkeythatis32byteslong!!",
			CookieSecret: "supersecretcookiethatis32bytes!!",
			CoturnRealm:  "turn.example.com",
			CoturnSecret: "secret",
		})

		c, rec := setupEchoWithAuth(http.MethodGet, "/rtc/ice", nil, &models.JWTPayload{Username: "maroon"})
		err := GetIceServers(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp map[string]any
		assert.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		servers := resp["iceServers"].([]any)
		assert.Len(t, servers, 2)
	})
}

// ─── Admin Tests ───────────────────────────────────────────────────

func TestListConfig(t *testing.T) {
	setupTestConfig(t)
	now := time.Now()

	t.Run("success", func(t *testing.T) {
		mock := &mockDBPool{
			queryFunc: func(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
				return &mockRows{
					nextReturns: []bool{true, false},
					scanFunc: func(dest ...any) error {
						*dest[0].(*string) = "cfg-1"
						*dest[1].(*string) = "key1"
						*dest[2].(*string) = "value1"
						*dest[3].(*interface{}) = now
						*dest[4].(*string) = "maroon"
						return nil
					},
				}, nil
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodGet, "/admin/config", nil, &models.JWTPayload{Username: "maroon"})
		err := ListConfig(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp []map[string]any
		assert.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.Len(t, resp, 1)
	})

	t.Run("db error", func(t *testing.T) {
		mock := &mockDBPool{
			queryFunc: func(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
				return nil, errors.New("db error")
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodGet, "/admin/config", nil, &models.JWTPayload{Username: "maroon"})
		err := ListConfig(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}

func TestGetPublicConfig(t *testing.T) {
	setupTestConfig(t)

	t.Run("success with defaults", func(t *testing.T) {
		mock := &mockDBPool{
			queryFunc: func(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
				return &mockRows{nextReturns: []bool{false}}, nil
			},
		}
		db.SetPool(mock)

		c, rec := setupEcho(http.MethodGet, "/config", nil)
		err := GetPublicConfig(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp map[string]any
		assert.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.Equal(t, false, resp["youtube"])
		assert.Equal(t, false, resp["push"])
	})

	t.Run("success with rows", func(t *testing.T) {
		mock := &mockDBPool{
			queryFunc: func(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
				return &mockRows{
					nextReturns: []bool{true, false},
					scanFunc: func(dest ...any) error {
						*dest[0].(*string) = "feature-x"
						*dest[1].(*string) = "enabled"
						return nil
					},
				}, nil
			},
		}
		db.SetPool(mock)

		c, rec := setupEcho(http.MethodGet, "/config", nil)
		err := GetPublicConfig(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp map[string]any
		assert.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.Equal(t, "enabled", resp["feature-x"])
	})
}

func TestUpdateConfig(t *testing.T) {
	setupTestConfig(t)

	t.Run("success", func(t *testing.T) {
		mock := &mockDBPool{
			execFunc: func(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error) {
				return pgconn.CommandTag{}, nil
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPut, "/admin/config/feature-x", jsonBody(map[string]string{
			"value": "enabled",
		}), &models.JWTPayload{Username: "maroon"})
		c.SetParamNames("key")
		c.SetParamValues("feature-x")
		err := UpdateConfig(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("invalid request", func(t *testing.T) {
		c, rec := setupEchoWithAuth(http.MethodPut, "/admin/config/feature-x", strings.NewReader("bad"), &models.JWTPayload{Username: "maroon"})
		c.SetParamNames("key")
		c.SetParamValues("feature-x")
		err := UpdateConfig(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("db error", func(t *testing.T) {
		mock := &mockDBPool{
			execFunc: func(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error) {
				return pgconn.CommandTag{}, errors.New("db error")
			},
		}
		db.SetPool(mock)

		c, rec := setupEchoWithAuth(http.MethodPut, "/admin/config/feature-x", jsonBody(map[string]string{
			"value": "enabled",
		}), &models.JWTPayload{Username: "maroon"})
		c.SetParamNames("key")
		c.SetParamValues("feature-x")
		err := UpdateConfig(c)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}
