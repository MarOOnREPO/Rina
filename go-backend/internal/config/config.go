package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/caarlos0/env/v11"
)

type Config struct {
	Port                int    `env:"PORT" envDefault:"8080"`
	NodeEnv             string `env:"NODE_ENV" envDefault:"development"`
	DatabaseURL         string `env:"DATABASE_URL,required"`
	RedisURL            string `env:"REDIS_URL,required"`
	JWTSecret           string `env:"JWT_SECRET,required"`
	CookieSecret        string `env:"COOKIE_SECRET,required"`
	CORSOrigin          string `env:"CORS_ORIGIN"`
	MaroonPasswordHash  string `env:"MAROON_PASSWORD_HASH,required"`
	RinaPasswordHash    string `env:"RINA_PASSWORD_HASH,required"`
	VapidPublicKey      string `env:"VAPID_PUBLIC_KEY"`
	VapidPrivateKey     string `env:"VAPID_PRIVATE_KEY"`
	YoutubeAPIKey       string `env:"YOUTUBE_API_KEY"`
	CoturnRealm         string `env:"COTURN_REALM"`
	CoturnSecret        string `env:"COTURN_SECRET"`
	AWSRegion           string `env:"AWS_REGION" envDefault:"eu-central-1"`
	AWSAccessKeyID      string `env:"AWS_ACCESS_KEY_ID"`
	AWSSecretAccessKey  string `env:"AWS_SECRET_ACCESS_KEY"`
	S3BucketName        string `env:"S3_BUCKET_NAME" envDefault:"rina-movies-storage"`
}

var cfg Config

func Load() (*Config, error) {
	if err := env.Parse(&cfg); err != nil {
		return nil, err
	}

	if len(cfg.JWTSecret) < 32 {
		return nil, fmt.Errorf("JWT_SECRET must be at least 32 characters")
	}
	if len(cfg.CookieSecret) < 32 {
		return nil, fmt.Errorf("COOKIE_SECRET must be at least 32 characters")
	}
	if cfg.NodeEnv == "production" && cfg.CORSOrigin == "" {
		return nil, fmt.Errorf("CORS_ORIGIN must be set in production")
	}

	return &cfg, nil
}

func Get() *Config {
	return &cfg
}

func Set(c Config) {
	cfg = c
}

func (c *Config) AllowedOrigins() []string {
	if c.NodeEnv == "production" {
		return []string{c.CORSOrigin}
	}
	return []string{"http://localhost:5173", "http://localhost:4173"}
}

func (c *Config) IsProduction() bool {
	return c.NodeEnv == "production"
}

func MustGetenv(key string) string {
	val := os.Getenv(key)
	if val == "" {
		panic(fmt.Sprintf("required environment variable %s is not set", key))
	}
	return val
}

func Getenv(key, fallback string) string {
	val := os.Getenv(key)
	if val == "" {
		return fallback
	}
	return val
}

func GetenvInt(key string, fallback int) int {
	val := os.Getenv(key)
	if val == "" {
		return fallback
	}
	i, err := strconv.Atoi(val)
	if err != nil {
		return fallback
	}
	return i
}

func IsAdmin(username string) bool {
	return strings.EqualFold(username, "maroon")
}
