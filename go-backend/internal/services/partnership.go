package services

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"rina-backend/internal/db"
)

var partnershipCache = make(map[string]string)

func ClearPartnershipCache() {
	partnershipCache = make(map[string]string)
}

func EnsureDefaultPartnership(ctx context.Context) error {
	pool := db.Get()
	var count int
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM partnerships").Scan(&count); err != nil {
		return fmt.Errorf("count partnerships: %w", err)
	}
	if count > 0 {
		return nil
	}

	var maroonID, rinaID string
	if err := pool.QueryRow(ctx, "SELECT id FROM users WHERE username = 'maroon'").Scan(&maroonID); err != nil {
		return fmt.Errorf("find maroon: %w", err)
	}
	if err := pool.QueryRow(ctx, "SELECT id FROM users WHERE username = 'rina'").Scan(&rinaID); err != nil {
		return fmt.Errorf("find rina: %w", err)
	}

	_, err := pool.Exec(ctx, "INSERT INTO partnerships (user_a_id, user_b_id) VALUES ($1, $2)", maroonID, rinaID)
	if err != nil {
		return fmt.Errorf("create partnership: %w", err)
	}
	return nil
}

func GetPartner(ctx context.Context, userID string) (string, error) {
	if cached, ok := partnershipCache[userID]; ok {
		return cached, nil
	}
	pool := db.Get()
	var partnerID string
	err := pool.QueryRow(ctx, `
		SELECT CASE WHEN user_a_id = $1 THEN user_b_id ELSE user_a_id END
		FROM partnerships WHERE user_a_id = $1 OR user_b_id = $1
	`, userID).Scan(&partnerID)
	if err == pgx.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	partnershipCache[userID] = partnerID
	return partnerID, nil
}

func GetPartnerByUsername(ctx context.Context, username string) (string, error) {
	pool := db.Get()
	var partnerUsername string
	err := pool.QueryRow(ctx, `
		SELECT u2.username
		FROM partnerships p
		JOIN users u1 ON (p.user_a_id = u1.id OR p.user_b_id = u1.id)
		JOIN users u2 ON (p.user_a_id = u2.id OR p.user_b_id = u2.id)
		WHERE u1.username = $1 AND u2.username != $1
		LIMIT 1
	`, username).Scan(&partnerUsername)
	if err == pgx.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return partnerUsername, nil
}
