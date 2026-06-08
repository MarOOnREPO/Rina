package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"rina-backend/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "config: %v\n", err)
		os.Exit(1)
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "db connect: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()

	// Ensure migrations table exists
	_, err = pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ DEFAULT NOW()
		)
	`)
	if err != nil {
		fmt.Fprintf(os.Stderr, "create migrations table: %v\n", err)
		os.Exit(1)
	}

	// Read all migration files
	entries, err := os.ReadDir("migrations")
	if err != nil {
		fmt.Fprintf(os.Stderr, "read migrations dir: %v\n", err)
		os.Exit(1)
	}

	var migrations []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasSuffix(name, ".up.sql") {
			migrations = append(migrations, name)
		}
	}

	sort.Strings(migrations)

	applied := 0
	for _, name := range migrations {
		version := strings.TrimSuffix(name, ".up.sql")

		// Check if already applied
		var exists bool
		err := pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = $1)", version).Scan(&exists)
		if err != nil {
			fmt.Fprintf(os.Stderr, "check migration %s: %v\n", version, err)
			os.Exit(1)
		}
		if exists {
			fmt.Printf("⏭️  Skipping %s (already applied)\n", name)
			continue
		}

		// Read and execute migration
		migrationPath := filepath.Join("migrations", name)
		sql, err := os.ReadFile(migrationPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "read migration %s: %v\n", migrationPath, err)
			os.Exit(1)
		}

		_, err = pool.Exec(ctx, string(sql))
		if err != nil {
			fmt.Fprintf(os.Stderr, "migrate %s: %v\n", name, err)
			os.Exit(1)
		}

		// Record migration
		_, err = pool.Exec(ctx, "INSERT INTO schema_migrations (version) VALUES ($1)", version)
		if err != nil {
			fmt.Fprintf(os.Stderr, "record migration %s: %v\n", version, err)
			os.Exit(1)
		}

		fmt.Printf("✅ Applied %s\n", name)
		applied++
	}

	if applied == 0 {
		fmt.Println("✅ All migrations already applied")
	} else {
		fmt.Printf("✅ Applied %d migration(s)\n", applied)
	}
}
