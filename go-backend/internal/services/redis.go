package services

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"rina-backend/internal/config"
)

var rdb *redis.Client

func ConnectRedis() error {
	cfg := config.Get()
	opt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return fmt.Errorf("parse redis url: %w", err)
	}
	rdb = redis.NewClient(opt)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("ping redis: %w", err)
	}
	return nil
}

func GetRedis() *redis.Client {
	return rdb
}

func CloseRedis() {
	if rdb != nil {
		rdb.Close()
	}
}

// ─── Cache Helpers ─────────────────────────────────────────────────

func CacheGet[T any](ctx context.Context, key string) (T, error) {
	var result T
	data, err := rdb.Get(ctx, key).Result()
	if err != nil {
		return result, err
	}
	if err := json.Unmarshal([]byte(data), &result); err != nil {
		return result, err
	}
	return result, nil
}

func CacheSet(ctx context.Context, key string, value interface{}, ttl time.Duration) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return rdb.Set(ctx, key, data, ttl).Err()
}

func CacheDel(ctx context.Context, key string) error {
	return rdb.Del(ctx, key).Err()
}

// ─── Presence ──────────────────────────────────────────────────────

const (
	SocketTTL       = 3600 * time.Second
	PresenceTTL     = 30 * time.Second
	HeartbeatTTL    = 10 * time.Second
)

type PresenceData struct {
	Status      string `json:"status"`
	LastSeen    string `json:"lastSeen"`
	DisplayName string `json:"displayName"`
}

func SetSocket(ctx context.Context, username, socketID string) error {
	return rdb.Set(ctx, fmt.Sprintf("rina:socket:%s", username), socketID, SocketTTL).Err()
}

func GetSocket(ctx context.Context, username string) (string, error) {
	return rdb.Get(ctx, fmt.Sprintf("rina:socket:%s", username)).Result()
}

func DelSocket(ctx context.Context, username string) error {
	return rdb.Del(ctx, fmt.Sprintf("rina:socket:%s", username)).Err()
}

func AddUserSocket(ctx context.Context, username, socketID string) error {
	key := fmt.Sprintf("rina:sockets:%s", username)
	if err := rdb.SAdd(ctx, key, socketID).Err(); err != nil {
		return err
	}
	return rdb.Expire(ctx, key, SocketTTL).Err()
}

func RemoveUserSocket(ctx context.Context, username, socketID string) error {
	return rdb.SRem(ctx, fmt.Sprintf("rina:sockets:%s", username), socketID).Err()
}

func SetStatus(ctx context.Context, username string, data PresenceData) error {
	b, _ := json.Marshal(data)
	return rdb.Set(ctx, fmt.Sprintf("rina:status:%s", username), b, PresenceTTL).Err()
}

func GetStatus(ctx context.Context, username string) (*PresenceData, error) {
	data, err := rdb.Get(ctx, fmt.Sprintf("rina:status:%s", username)).Result()
	if err != nil {
		return nil, err
	}
	var pd PresenceData
	if err := json.Unmarshal([]byte(data), &pd); err != nil {
		return nil, err
	}
	return &pd, nil
}

func SetHeartbeat(ctx context.Context, username string) error {
	return rdb.Set(ctx, fmt.Sprintf("rina:heartbeat:%s", username), time.Now().Format(time.RFC3339), HeartbeatTTL).Err()
}

func GetUserSockets(ctx context.Context, username string) ([]string, error) {
	return rdb.SMembers(ctx, fmt.Sprintf("rina:sockets:%s", username)).Result()
}
