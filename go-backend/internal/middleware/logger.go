package middleware

import (
	"time"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
)

// LoggerMiddleware logs every HTTP request with structured fields.
// It must be registered after RequestIDMiddleware and before AuthMiddleware
// so that request_id and user_id are available in the context.
func LoggerMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			start := time.Now()

			err := next(c)

			duration := time.Since(start)
			reqID := GetRequestID(c)

			status := c.Response().Status
			if status == 0 {
				status = 200
			}

			logger := log.Logger.With().
				Str("request_id", reqID).
				Str("method", c.Request().Method).
				Str("path", c.Request().URL.Path).
				Int("status_code", status).
				Float64("duration_ms", float64(duration.Microseconds())/1000.0).
				Str("user_agent", c.Request().UserAgent()).
				Str("remote_ip", c.RealIP()).
				Logger()

			if user := GetUser(c); user != nil {
				logger = logger.With().Str("user_id", user.ID).Logger()
			}

			if err != nil {
				logger.Error().Err(err).Msg("request failed")
			} else if status >= 500 {
				logger.Error().Msg("server error")
			} else if status >= 400 {
				logger.Warn().Msg("client error")
			} else {
				logger.Info().Msg("request completed")
			}

			return err
		}
	}
}
