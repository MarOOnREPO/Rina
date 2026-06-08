package middleware

import (
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

const RequestIDHeader = "X-Request-ID"

const requestIDContextKey contextKey = "request_id"

// RequestIDMiddleware injects a request ID into the Echo context and response headers.
// If the client provides an X-Request-ID header, it is reused; otherwise a UUID is generated.
func RequestIDMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			reqID := c.Request().Header.Get(RequestIDHeader)
			if reqID == "" {
				reqID = uuid.New().String()
			}

			c.Set(string(requestIDContextKey), reqID)
			c.Response().Header().Set(RequestIDHeader, reqID)

			return next(c)
		}
	}
}

// GetRequestID returns the request ID from the Echo context.
func GetRequestID(c echo.Context) string {
	reqID, ok := c.Get(string(requestIDContextKey)).(string)
	if !ok {
		return ""
	}
	return reqID
}
