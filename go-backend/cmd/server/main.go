package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"rina-backend/internal/config"
	"rina-backend/internal/db"
	"rina-backend/internal/handlers"
	authmw "rina-backend/internal/middleware"
	"rina-backend/internal/services"
	"rina-backend/internal/websocket"
)

func main() {
	// ─── Logger ──────────────────────────────────────────────────
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339}).With().Timestamp().Logger()

	// ─── Config ──────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load config")
	}

	// ─── Database ────────────────────────────────────────────────
	if _, err := db.Connect(); err != nil {
		log.Fatal().Err(err).Msg("failed to connect to database")
	}
	defer db.Close()

	if err := db.SeedUsers(); err != nil {
		log.Fatal().Err(err).Msg("failed to seed users")
	}
	if err := services.EnsureDefaultPartnership(context.Background()); err != nil {
		log.Fatal().Err(err).Msg("failed to ensure partnership")
	}

	// ─── Redis ───────────────────────────────────────────────────
	if err := services.ConnectRedis(); err != nil {
		log.Fatal().Err(err).Msg("failed to connect to redis")
	}
	defer services.CloseRedis()

	// ─── S3 ──────────────────────────────────────────────────────
	if cfg.AWSAccessKeyID != "" && cfg.AWSSecretAccessKey != "" {
		if err := services.InitS3(cfg.AWSRegion, cfg.S3BucketName); err != nil {
			log.Warn().Err(err).Msg("failed to init s3, movie uploads disabled")
		} else {
			log.Info().Str("bucket", cfg.S3BucketName).Msg("s3 initialized")
		}
	}

	// ─── Echo ────────────────────────────────────────────────────
	e := echo.New()
	e.HideBanner = true
	e.HTTPErrorHandler = authmw.CustomHTTPErrorHandler

	// Middleware order: request ID → logger → recovery → auth
	e.Use(authmw.RequestIDMiddleware())
	e.Use(authmw.LoggerMiddleware())
	e.Use(middleware.Recover())
	e.Use(authmw.AuthMiddleware())

	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins:     cfg.AllowedOrigins(),
		AllowCredentials: true,
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowHeaders:     []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAccept, echo.HeaderAuthorization},
	}))
	e.Use(middleware.SecureWithConfig(middleware.SecureConfig{
		ContentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' wss: ws: https://api.open-meteo.com https://api.mapbox.com https://events.mapbox.com https://www.youtube.com https://www.googleapis.com; font-src 'self'; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; object-src 'none';",
	}))

	// ─── Rate Limit ──────────────────────────────────────────────
	e.Use(middleware.RateLimiter(middleware.NewRateLimiterMemoryStore(100)))

	// ─── Routes ──────────────────────────────────────────────────
	registerRoutes(e)

	// ─── WebSocket ───────────────────────────────────────────────
	wsHub := websocket.NewHub()
	go wsHub.Run()
	e.GET("/ws", wsHub.HandleWebSocket)

	// ─── Graceful Shutdown ───────────────────────────────────────
	go func() {
		if err := e.Start(":" + strconv.Itoa(cfg.Port)); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("server error")
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := e.Shutdown(ctx); err != nil {
		log.Error().Err(err).Msg("forced shutdown")
	}
}

func registerRoutes(e *echo.Echo) {
	// Health
	e.GET("/api/health", handlers.HealthHandler)

	// Public config
	e.GET("/api/config", handlers.GetPublicConfig)

	// Auth
	e.POST("/api/auth/login", handlers.Login)
	e.POST("/api/auth/logout", handlers.Logout)
	e.GET("/api/auth/me", authmw.RequireAuth(handlers.GetMe))
	e.GET("/api/auth/notifications", authmw.RequireAuth(handlers.GetNotifications))
	e.POST("/api/auth/notifications/read", authmw.RequireAuth(handlers.MarkNotificationsRead))
	e.PATCH("/api/auth/me", authmw.RequireAuth(handlers.UpdateMe))

	// Messages
	e.GET("/api/messages", authmw.RequireAuth(handlers.ListMessages))
	e.POST("/api/messages", authmw.RequireAuth(handlers.CreateMessage))
	e.PATCH("/api/messages/:id", authmw.RequireAuth(handlers.EditMessage))
	e.DELETE("/api/messages/:id", authmw.RequireAuth(handlers.DeleteMessage))

	// Calendar
	e.GET("/api/calendar", authmw.RequireAuth(handlers.ListCalendar))
	e.POST("/api/calendar", authmw.RequireAuth(handlers.CreateCalendar))
	e.PATCH("/api/calendar/:id", authmw.RequireAuth(handlers.UpdateCalendar))
	e.DELETE("/api/calendar/:id", authmw.RequireAuth(handlers.DeleteCalendar))

	// Cycle
	e.GET("/api/cycle", authmw.RequireAuth(handlers.ListCycle))
	e.POST("/api/cycle", authmw.RequireAuth(handlers.CreateCycle))
	e.PATCH("/api/cycle/:id", authmw.RequireAuth(handlers.UpdateCycle))
	e.DELETE("/api/cycle/:id", authmw.RequireAuth(handlers.DeleteCycle))

	// Movies
	e.GET("/api/movies", authmw.RequireAuth(handlers.ListMovies))
	e.POST("/api/movies", authmw.RequireAuth(handlers.AdminOnly(handlers.CreateMovie)))
	e.GET("/api/movies/:id", authmw.RequireAuth(handlers.GetMovie))
	e.GET("/api/movies/:id/download", authmw.RequireAuth(handlers.DownloadMovie))
	e.GET("/api/movies/:id/watch", authmw.RequireAuth(handlers.WatchMovie))
	e.DELETE("/api/movies/:id", authmw.RequireAuth(handlers.AdminOnly(handlers.DeleteMovie)))

	// YouTube
	e.GET("/api/youtube/search", authmw.RequireAuth(handlers.SearchYouTube))

	// Push
	e.POST("/api/push/subscribe", authmw.RequireAuth(handlers.SubscribePush))
	e.POST("/api/push/unsubscribe", authmw.RequireAuth(handlers.UnsubscribePush))
	e.POST("/api/push/notify", authmw.RequireAuth(handlers.NotifyPush))
	e.GET("/api/push/vapid-public", handlers.GetVapidPublicKey)

	// RTC
	e.GET("/api/rtc/ice-servers", authmw.RequireAuth(handlers.GetIceServers))

	// Admin
	e.GET("/api/admin/config", authmw.RequireAuth(handlers.AdminOnly(handlers.ListConfig)))
	e.GET("/api/admin/config/public", handlers.GetPublicConfig)
	e.PUT("/api/admin/config/:key", authmw.RequireAuth(handlers.AdminOnly(handlers.UpdateConfig)))
}
