package middleware

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"

	"rina-backend/internal/config"
)

type errorResponse struct {
	Error   string `json:"error,omitempty"`
	Message string `json:"message,omitempty"`
}

// CustomHTTPErrorHandler centralizes error handling for Echo.
// Full error details are logged server-side; sanitized responses are returned in production.
func CustomHTTPErrorHandler(err error, c echo.Context) {
	reqID := GetRequestID(c)

	var status int
	var message string

	if he, ok := err.(*echo.HTTPError); ok {
		status = he.Code
		switch msg := he.Message.(type) {
		case string:
			message = msg
		case error:
			message = msg.Error()
		default:
			message = http.StatusText(he.Code)
		}
	} else {
		status = http.StatusInternalServerError
		message = err.Error()
	}

	logger := log.Logger.With().
		Str("request_id", reqID).
		Int("status_code", status).
		Str("method", c.Request().Method).
		Str("path", c.Request().URL.Path).
		Str("remote_ip", c.RealIP()).
		Logger()

	logger.Error().Err(err).Msg("http error")

	if c.Response().Committed {
		return
	}

	cfg := config.Get()
	var resp errorResponse
	if cfg.IsProduction() {
		if status >= 500 {
			resp = errorResponse{Error: "internal server error"}
		} else {
			resp = errorResponse{Error: http.StatusText(status)}
		}
	} else {
		resp = errorResponse{
			Error:   http.StatusText(status),
			Message: message,
		}
	}

	if writeErr := c.JSON(status, resp); writeErr != nil {
		logger.Error().Err(writeErr).Msg("failed to write error response")
	}
}
