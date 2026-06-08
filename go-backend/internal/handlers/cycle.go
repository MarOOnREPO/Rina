package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"rina-backend/internal/db"
	"rina-backend/internal/models"
	authmw "rina-backend/internal/middleware"
)

func ListCycle(c echo.Context) error {
	user := authmw.GetUser(c)
	from := c.QueryParam("from")
	to := c.QueryParam("to")

	ctx := context.Background()
	pool := db.Get()

	query := "SELECT id, user_id, date, flow_intensity, symptoms, temperature, notes, created_at FROM cycle_entries WHERE user_id = $1"
	args := []interface{}{user.ID}

	if from != "" {
		query += " AND date >= $2"
		args = append(args, from)
	}
	if to != "" {
		if from != "" {
			query += " AND date <= $3"
		} else {
			query += " AND date <= $2"
		}
		args = append(args, to)
	}
	query += " ORDER BY date DESC"

	rows, err := pool.Query(ctx, query, args...)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch entries"})
	}
	defer rows.Close()

	var entries []models.CycleEntry
	for rows.Next() {
		var e models.CycleEntry
		var flowIntensity *int16
		var temp *float32
		var notes *string
		if err := rows.Scan(&e.ID, &e.UserID, &e.Date, &flowIntensity, &e.Symptoms, &temp, &notes, &e.CreatedAt); err != nil {
			continue
		}
		if flowIntensity != nil { e.FlowIntensity = flowIntensity }
		if temp != nil { e.Temperature = temp }
		if notes != nil { e.Notes = notes }
		entries = append(entries, e)
	}

	return c.JSON(http.StatusOK, entries)
}

func CreateCycle(c echo.Context) error {
	user := authmw.GetUser(c)
	var req struct {
		Date          string   `json:"date" validate:"required"`
		FlowIntensity *int16   `json:"flowIntensity,omitempty"`
		Symptoms      []string `json:"symptoms,omitempty"`
		Temperature   *float32 `json:"temperature,omitempty"`
		Notes         *string  `json:"notes,omitempty"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	ctx := context.Background()
	pool := db.Get()

	var e models.CycleEntry
	err := pool.QueryRow(ctx,
		"INSERT INTO cycle_entries (user_id, date, flow_intensity, symptoms, temperature, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at",
		user.ID, req.Date, req.FlowIntensity, req.Symptoms, req.Temperature, req.Notes,
	).Scan(&e.ID, &e.CreatedAt)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create entry"})
	}

	e.UserID = user.ID
	e.Date, _ = time.Parse("2006-01-02", req.Date)
	e.FlowIntensity = req.FlowIntensity
	e.Symptoms = req.Symptoms
	e.Temperature = req.Temperature
	e.Notes = req.Notes

	return c.JSON(http.StatusCreated, e)
}

func UpdateCycle(c echo.Context) error {
	user := authmw.GetUser(c)
	id := c.Param("id")
	var req struct {
		Date          *string  `json:"date,omitempty"`
		FlowIntensity *int16   `json:"flowIntensity,omitempty"`
		Symptoms      []string `json:"symptoms,omitempty"`
		Temperature   *float32 `json:"temperature,omitempty"`
		Notes         *string  `json:"notes,omitempty"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	ctx := context.Background()
	pool := db.Get()

	var ownerID string
	if err := pool.QueryRow(ctx, "SELECT user_id FROM cycle_entries WHERE id = $1", id).Scan(&ownerID); err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "entry not found"})
	}
	if ownerID != user.ID {
		return c.JSON(http.StatusForbidden, map[string]string{"error": "not authorized"})
	}

	_, err := pool.Exec(ctx,
		"UPDATE cycle_entries SET date = COALESCE($1, date), flow_intensity = COALESCE($2, flow_intensity), symptoms = COALESCE($3, symptoms), temperature = COALESCE($4, temperature), notes = COALESCE($5, notes) WHERE id = $6",
		req.Date, req.FlowIntensity, req.Symptoms, req.Temperature, req.Notes, id,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update entry"})
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

func DeleteCycle(c echo.Context) error {
	user := authmw.GetUser(c)
	id := c.Param("id")

	ctx := context.Background()
	pool := db.Get()

	var ownerID string
	if err := pool.QueryRow(ctx, "SELECT user_id FROM cycle_entries WHERE id = $1", id).Scan(&ownerID); err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "entry not found"})
	}
	if ownerID != user.ID {
		return c.JSON(http.StatusForbidden, map[string]string{"error": "not authorized"})
	}

	if _, err := pool.Exec(ctx, "DELETE FROM cycle_entries WHERE id = $1", id); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete entry"})
	}

	return c.NoContent(http.StatusNoContent)
}
