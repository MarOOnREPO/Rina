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

func ListCalendar(c echo.Context) error {
	user := authmw.GetUser(c)
	from := c.QueryParam("from")
	to := c.QueryParam("to")

	ctx := context.Background()
	pool := db.Get()

	query := "SELECT id, title, description, start_time, end_time, type, creator_id, all_day, color, created_at, updated_at FROM calendar_events WHERE creator_id = $1"
	args := []interface{}{user.ID}
	argCount := 1

	if from != "" {
		argCount++
		query += " AND start_time >= $" + string(rune('0'+argCount))
		args = append(args, from)
	}
	if to != "" {
		argCount++
		query += " AND start_time <= $" + string(rune('0'+argCount))
		args = append(args, to)
	}
	query += " ORDER BY start_time ASC"

	rows, err := pool.Query(ctx, query, args...)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch events"})
	}
	defer rows.Close()

	var events []models.CalendarEvent
	for rows.Next() {
		var e models.CalendarEvent
		var etype string
		var desc, endTime, color *string
		if err := rows.Scan(&e.ID, &e.Title, &desc, &e.StartTime, &endTime, &etype, &e.CreatorID, &e.AllDay, &color, &e.CreatedAt, &e.UpdatedAt); err != nil {
			continue
		}
		e.Type = models.EventType(etype)
		if desc != nil { e.Description = desc }
		if endTime != nil {
			t, _ := time.Parse(time.RFC3339, *endTime)
			e.EndTime = &t
		}
		if color != nil { e.Color = color }
		events = append(events, e)
	}

	return c.JSON(http.StatusOK, events)
}

func CreateCalendar(c echo.Context) error {
	user := authmw.GetUser(c)
	var req struct {
		Title       string  `json:"title" validate:"required,max=200"`
		Description *string `json:"description,omitempty"`
		StartTime   string  `json:"startTime" validate:"required"`
		EndTime     *string `json:"endTime,omitempty"`
		Type        string  `json:"type" validate:"omitempty,oneof=WORK SHARED"`
		AllDay      bool    `json:"allDay"`
		Color       *string `json:"color,omitempty"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	et := models.EventTypeShared
	if req.Type != "" {
		et = models.EventType(req.Type)
	}

	ctx := context.Background()
	pool := db.Get()

	var e models.CalendarEvent
	var endTime interface{}
	if req.EndTime != nil {
		endTime = *req.EndTime
	}
	err := pool.QueryRow(ctx,
		"INSERT INTO calendar_events (title, description, start_time, end_time, type, creator_id, all_day, color) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, created_at, updated_at",
		req.Title, req.Description, req.StartTime, endTime, string(et), user.ID, req.AllDay, req.Color,
	).Scan(&e.ID, &e.CreatedAt, &e.UpdatedAt)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create event"})
	}

	e.Title = req.Title
	e.Description = req.Description
	e.StartTime, _ = time.Parse(time.RFC3339, req.StartTime)
	if req.EndTime != nil {
		t, _ := time.Parse(time.RFC3339, *req.EndTime)
		e.EndTime = &t
	}
	e.Type = et
	e.CreatorID = user.ID
	e.AllDay = req.AllDay
	e.Color = req.Color

	return c.JSON(http.StatusCreated, e)
}

func UpdateCalendar(c echo.Context) error {
	user := authmw.GetUser(c)
	id := c.Param("id")
	var req struct {
		Title       *string `json:"title,omitempty"`
		Description *string `json:"description,omitempty"`
		StartTime   *string `json:"startTime,omitempty"`
		EndTime     *string `json:"endTime,omitempty"`
		Type        *string `json:"type,omitempty"`
		AllDay      *bool   `json:"allDay,omitempty"`
		Color       *string `json:"color,omitempty"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	ctx := context.Background()
	pool := db.Get()

	var creatorID string
	if err := pool.QueryRow(ctx, "SELECT creator_id FROM calendar_events WHERE id = $1", id).Scan(&creatorID); err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "event not found"})
	}
	if creatorID != user.ID {
		return c.JSON(http.StatusForbidden, map[string]string{"error": "not authorized"})
	}

	var etype interface{}
	if req.Type != nil {
		etype = *req.Type
	}
	var endTime interface{}
	if req.EndTime != nil {
		endTime = *req.EndTime
	}

	_, err := pool.Exec(ctx,
		"UPDATE calendar_events SET title = COALESCE($1, title), description = COALESCE($2, description), start_time = COALESCE($3, start_time), end_time = COALESCE($4, end_time), type = COALESCE($5, type), all_day = COALESCE($6, all_day), color = COALESCE($7, color), updated_at = NOW() WHERE id = $8",
		req.Title, req.Description, req.StartTime, endTime, etype, req.AllDay, req.Color, id,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update event"})
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

func DeleteCalendar(c echo.Context) error {
	user := authmw.GetUser(c)
	id := c.Param("id")

	ctx := context.Background()
	pool := db.Get()

	var creatorID string
	if err := pool.QueryRow(ctx, "SELECT creator_id FROM calendar_events WHERE id = $1", id).Scan(&creatorID); err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "event not found"})
	}
	if creatorID != user.ID {
		return c.JSON(http.StatusForbidden, map[string]string{"error": "not authorized"})
	}

	if _, err := pool.Exec(ctx, "DELETE FROM calendar_events WHERE id = $1", id); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete event"})
	}

	return c.NoContent(http.StatusNoContent)
}
