package handlers

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"

	"rina-backend/internal/db"
	"rina-backend/internal/models"
	authmw "rina-backend/internal/middleware"
	"rina-backend/internal/services"
)

func ListMovies(c echo.Context) error {
	ctx := context.Background()
	pool := db.Get()
	rows, err := pool.Query(ctx, "SELECT id, title, poster_path, backdrop_path, trailer_url, s3_key, added_by, created_at FROM movies ORDER BY created_at DESC")
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch movies"})
	}
	defer rows.Close()

	var movies []models.Movie
	for rows.Next() {
		var m models.Movie
		var poster, backdrop, trailer, s3key *string
		if err := rows.Scan(&m.ID, &m.Title, &poster, &backdrop, &trailer, &s3key, &m.UploadedBy, &m.CreatedAt); err != nil {
			continue
		}
		m.PosterPath = poster
		m.BackdropPath = backdrop
		m.TrailerURL = trailer
		m.FilePath = ""
		if s3key != nil {
			m.FilePath = *s3key
		}
		movies = append(movies, m)
	}

	return c.JSON(http.StatusOK, movies)
}

func GetMovie(c echo.Context) error {
	id := c.Param("id")
	ctx := context.Background()
	pool := db.Get()

	var m models.Movie
	var poster, backdrop, trailer, s3key *string
	if err := pool.QueryRow(ctx, "SELECT id, title, poster_path, backdrop_path, trailer_url, s3_key, added_by, created_at FROM movies WHERE id = $1", id).Scan(&m.ID, &m.Title, &poster, &backdrop, &trailer, &s3key, &m.UploadedBy, &m.CreatedAt); err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "movie not found"})
	}
	m.PosterPath = poster
	m.BackdropPath = backdrop
	m.TrailerURL = trailer
	if s3key != nil {
		m.FilePath = *s3key
	}
	return c.JSON(http.StatusOK, m)
}

func CreateMovie(c echo.Context) error {
	title := c.FormValue("title")
	if title == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "title required"})
	}

	posterUrl := c.FormValue("posterPath")
	backdropUrl := c.FormValue("backdropPath")
	trailerUrl := c.FormValue("trailerUrl")

	file, err := c.FormFile("file")
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "file required"})
	}

	src, err := file.Open()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to read file"})
	}
	defer src.Close()

	data, err := io.ReadAll(src)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to read file"})
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext == "" {
		ext = ".mp4"
	}
	s3Key := fmt.Sprintf("movies/%s-%s%s", uuid.New().String(), sanitizeFilename(title), ext)

	ctx := context.Background()
	if services.GetS3Client() != nil {
		if err := services.UploadFile(ctx, s3Key, data, file.Header.Get("Content-Type")); err != nil {
			log.Error().Err(err).Str("key", s3Key).Msg("s3 upload failed")
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "upload failed"})
		}
	} else {
		log.Warn().Msg("S3 not configured, movie metadata saved without file upload")
	}

	user := authmw.GetUser(c)
	pool := db.Get()

	var poster, backdrop, trailer interface{}
	if posterUrl != "" { poster = posterUrl }
	if backdropUrl != "" { backdrop = backdropUrl }
	if trailerUrl != "" { trailer = trailerUrl }

	var m models.Movie
	if err := pool.QueryRow(ctx,
		"INSERT INTO movies (title, poster_path, backdrop_path, trailer_url, s3_key, added_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at",
		title, poster, backdrop, trailer, s3Key, user.ID,
	).Scan(&m.ID, &m.CreatedAt); err != nil {
		log.Error().Err(err).Msg("create movie failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create movie"})
	}

	m.Title = title
	if posterUrl != "" { m.PosterPath = &posterUrl }
	if backdropUrl != "" { m.BackdropPath = &backdropUrl }
	if trailerUrl != "" { m.TrailerURL = &trailerUrl }
	m.FilePath = s3Key
	m.UploadedBy = user.ID

	return c.JSON(http.StatusCreated, m)
}

func DownloadMovie(c echo.Context) error {
	id := c.Param("id")
	ctx := context.Background()
	pool := db.Get()

	var s3Key string
	if err := pool.QueryRow(ctx, "SELECT s3_key FROM movies WHERE id = $1", id).Scan(&s3Key); err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "movie not found"})
	}

	if services.GetS3Client() == nil {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "S3 not configured"})
	}

	url, err := services.GetPresignedDownloadURL(ctx, s3Key, 15*time.Minute)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to generate download URL"})
	}

	return c.Redirect(http.StatusFound, url)
}

func WatchMovie(c echo.Context) error {
	id := c.Param("id")
	ctx := context.Background()
	pool := db.Get()

	var s3Key string
	if err := pool.QueryRow(ctx, "SELECT s3_key FROM movies WHERE id = $1", id).Scan(&s3Key); err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "movie not found"})
	}

	if services.GetS3Client() == nil {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "S3 not configured"})
	}

	url, err := services.GetPresignedDownloadURL(ctx, s3Key, 15*time.Minute)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to generate watch URL"})
	}

	return c.Redirect(http.StatusFound, url)
}

func DeleteMovie(c echo.Context) error {
	id := c.Param("id")
	ctx := context.Background()
	pool := db.Get()

	var s3Key string
	if err := pool.QueryRow(ctx, "SELECT s3_key FROM movies WHERE id = $1", id).Scan(&s3Key); err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "movie not found"})
	}

	if _, err := pool.Exec(ctx, "DELETE FROM movies WHERE id = $1", id); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete movie"})
	}

	if s3Key != "" && services.GetS3Client() != nil {
		if err := services.DeleteFile(ctx, s3Key); err != nil {
			log.Warn().Err(err).Str("key", s3Key).Msg("failed to delete s3 object")
		}
	}

	return c.NoContent(http.StatusNoContent)
}

func sanitizeFilename(name string) string {
	replacer := strings.NewReplacer(
		" ", "-",
		"/", "-",
		"\\", "-",
		":", "-",
		"*", "-",
		"?", "-",
		"\"", "-",
		"<", "-",
		">", "-",
		"|", "-",
	)
	return strings.ToLower(replacer.Replace(name))
}
