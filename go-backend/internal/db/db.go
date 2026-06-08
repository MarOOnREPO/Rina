package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"rina-backend/internal/config"
)

// DBPool abstracts the database pool for testability.
type DBPool interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
}

var pool DBPool

func Connect() (DBPool, error) {
	cfg := config.Get()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pgxCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse db config: %w", err)
	}
	pgxCfg.MaxConns = 10
	pgxCfg.MinConns = 2
	pgxCfg.MaxConnLifetime = time.Hour

	p, err := pgxpool.NewWithConfig(ctx, pgxCfg)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	if err := p.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}

	pool = p
	return pool, nil
}

func Get() DBPool {
	return pool
}

func SetPool(p DBPool) {
	pool = p
}

func Close() {
	if p, ok := pool.(*pgxpool.Pool); ok && p != nil {
		p.Close()
	}
}
