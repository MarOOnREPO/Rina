package db

import (
	"context"
	"fmt"

	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/bcrypt"

	"rina-backend/internal/config"
)

func SeedUsers() error {
	cfg := config.Get()
	ctx := context.Background()
	pool := Get()

	var count int
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM users").Scan(&count); err != nil {
		return fmt.Errorf("count users: %w", err)
	}
	if count >= 2 {
		return nil
	}

	users := []struct {
		Username    string
		DisplayName string
		Timezone    string
		Hash        string
	}{
		{"maroon", "MarOOn", "Africa/Casablanca", cfg.MaroonPasswordHash},
		{"rina", "Rina", "Europe/Moscow", cfg.RinaPasswordHash},
	}

	for _, u := range users {
		// Verify hash is valid bcrypt
		if _, err := bcrypt.Cost([]byte(u.Hash)); err != nil {
			log.Warn().Str("username", u.Username).Msg("invalid bcrypt hash, generating new one")
			newHash, _ := bcrypt.GenerateFromPassword([]byte(u.Username+"123"), bcrypt.DefaultCost)
			u.Hash = string(newHash)
		}

		_, err := pool.Exec(ctx,
			"INSERT INTO users (username, display_name, timezone) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING",
			u.Username, u.DisplayName, u.Timezone,
		)
		if err != nil {
			log.Error().Err(err).Str("username", u.Username).Msg("failed to seed user")
		} else {
			log.Info().Str("username", u.Username).Msg("seeded user")
		}
	}

	// Ensure partnership
	var maroonID, rinaID string
	if err := pool.QueryRow(ctx, "SELECT id FROM users WHERE username = 'maroon'").Scan(&maroonID); err != nil {
		return fmt.Errorf("find maroon: %w", err)
	}
	if err := pool.QueryRow(ctx, "SELECT id FROM users WHERE username = 'rina'").Scan(&rinaID); err != nil {
		return fmt.Errorf("find rina: %w", err)
	}

	var pcount int
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM partnerships").Scan(&pcount); err != nil {
		return fmt.Errorf("count partnerships: %w", err)
	}
	if pcount == 0 {
		_, err := pool.Exec(ctx, "INSERT INTO partnerships (user_a_id, user_b_id) VALUES ($1, $2)", maroonID, rinaID)
		if err != nil {
			return fmt.Errorf("create partnership: %w", err)
		}
		log.Info().Msg("seeded partnership")
	}

	return nil
}
