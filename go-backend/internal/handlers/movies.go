package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
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

	source := c.QueryParam("source")
	whereClause := ""
	if source == "uploaded" {
		whereClause = "WHERE source_type = 'uploaded'"
	} else if source == "watchlist" {
		whereClause = "WHERE source_type = 'watchlist'"
	}

	query := fmt.Sprintf(`SELECT id, title, poster_path, backdrop_path, trailer_url, s3_key, added_by, created_at,
		tmdb_id, overview, release_date, runtime, vote_average, genres, cast, director,
		source_type, watched, watched_at, rating
		FROM movies %s ORDER BY created_at DESC`, whereClause)

	rows, err := pool.Query(ctx, query)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch movies"})
	}
	defer rows.Close()

	var movies []models.Movie
	for rows.Next() {
		var m models.Movie
		var poster, backdrop, trailer, s3key, overview, director *string
		var tmdbID, runtime, rating *int
		var voteAvg *float64
		var releaseDate, watchedAt *time.Time
		var genresJSON, castJSON []byte

		if err := rows.Scan(&m.ID, &m.Title, &poster, &backdrop, &trailer, &s3key, &m.UploadedBy, &m.CreatedAt,
			&tmdbID, &overview, &releaseDate, &runtime, &voteAvg, &genresJSON, &castJSON, &director,
			&m.SourceType, &m.Watched, &watchedAt, &rating); err != nil {
			log.Warn().Err(err).Msg("scan movie row failed")
			continue
		}

		m.PosterPath = poster
		m.BackdropPath = backdrop
		m.TrailerURL = trailer
		m.FilePath = s3key
		m.TmdbID = tmdbID
		m.Overview = overview
		m.ReleaseDate = releaseDate
		m.Runtime = runtime
		m.VoteAverage = voteAvg
		m.Director = director
		m.WatchedAt = watchedAt
		m.Rating = rating

		if genresJSON != nil {
			_ = json.Unmarshal(genresJSON, &m.Genres)
		}
		if castJSON != nil {
			_ = json.Unmarshal(castJSON, &m.Cast)
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
	var poster, backdrop, trailer, s3key, overview, director *string
	var tmdbID, runtime, rating *int
	var voteAvg *float64
	var releaseDate, watchedAt *time.Time
	var genresJSON, castJSON []byte

	err := pool.QueryRow(ctx, `SELECT id, title, poster_path, backdrop_path, trailer_url, s3_key, added_by, created_at,
		tmdb_id, overview, release_date, runtime, vote_average, genres, cast, director,
		source_type, watched, watched_at, rating
		FROM movies WHERE id = $1`, id).Scan(
		&m.ID, &m.Title, &poster, &backdrop, &trailer, &s3key, &m.UploadedBy, &m.CreatedAt,
		&tmdbID, &overview, &releaseDate, &runtime, &voteAvg, &genresJSON, &castJSON, &director,
		&m.SourceType, &m.Watched, &watchedAt, &rating,
	)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "movie not found"})
	}

	m.PosterPath = poster
	m.BackdropPath = backdrop
	m.TrailerURL = trailer
	m.FilePath = s3key
	m.TmdbID = tmdbID
	m.Overview = overview
	m.ReleaseDate = releaseDate
	m.Runtime = runtime
	m.VoteAverage = voteAvg
	m.Director = director
	m.WatchedAt = watchedAt
	m.Rating = rating

	if genresJSON != nil {
		_ = json.Unmarshal(genresJSON, &m.Genres)
	}
	if castJSON != nil {
		_ = json.Unmarshal(castJSON, &m.Cast)
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
	tmdbIdStr := c.FormValue("tmdbId")

	var tmdbID *int
	if tmdbIdStr != "" {
		if id, err := strconv.Atoi(tmdbIdStr); err == nil {
			tmdbID = &id
		}
	}

	if err := c.Request().ParseMultipartForm(10 << 30); err != nil {
		log.Warn().Err(err).Msg("parse multipart form failed")
	}
	file, err := c.FormFile("file")
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "file required"})
	}

	src, err := file.Open()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to read file"})
	}
	defer src.Close()

	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext == "" {
		ext = ".mp4"
	}
	s3Key := fmt.Sprintf("movies/%s-%s%s", uuid.New().String(), sanitizeFilename(title), ext)

	ctx := context.Background()
	if services.GetS3Client() != nil {
		if err := services.UploadFile(ctx, s3Key, src, file.Header.Get("Content-Type")); err != nil {
			log.Error().Err(err).Str("key", s3Key).Msg("s3 upload failed")
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "upload failed"})
		}
	} else {
		log.Warn().Msg("S3 not configured, movie metadata saved without file upload")
	}

	user := authmw.GetUser(c)
	pool := db.Get()

	// If tmdbId provided, fetch metadata
	var overview, director *string
	var runtime *int
	var voteAvg *float64
	var releaseDate *time.Time
	var genresJSON, castJSON []byte

	if tmdbID != nil {
		if tmdbMovie, err := services.FetchTMDBMovieForWatchlist(ctx, *tmdbID); err == nil {
			if tmdbMovie.Overview != nil && *tmdbMovie.Overview != "" {
				overview = tmdbMovie.Overview
			}
			if tmdbMovie.Runtime != nil && *tmdbMovie.Runtime > 0 {
				runtime = tmdbMovie.Runtime
			}
			if tmdbMovie.VoteAverage != nil && *tmdbMovie.VoteAverage > 0 {
				voteAvg = tmdbMovie.VoteAverage
			}
			if tmdbMovie.ReleaseDate != nil {
				releaseDate = tmdbMovie.ReleaseDate
			}
			if tmdbMovie.Director != nil && *tmdbMovie.Director != "" {
				director = tmdbMovie.Director
			}
			if len(tmdbMovie.Genres) > 0 {
				genresJSON, _ = json.Marshal(tmdbMovie.Genres)
			}
			if len(tmdbMovie.Cast) > 0 {
				castJSON, _ = json.Marshal(tmdbMovie.Cast)
			}
			if posterUrl == "" && tmdbMovie.PosterPath != nil {
				posterUrl = *tmdbMovie.PosterPath
			}
			if backdropUrl == "" && tmdbMovie.BackdropPath != nil {
				backdropUrl = *tmdbMovie.BackdropPath
			}
			if trailerUrl == "" && tmdbMovie.TrailerURL != nil {
				trailerUrl = *tmdbMovie.TrailerURL
			}
		} else {
			log.Warn().Err(err).Int("tmdb_id", *tmdbID).Msg("failed to fetch tmdb metadata for upload")
		}
	}

	var poster, backdrop, trailer interface{}
	if posterUrl != "" { poster = posterUrl }
	if backdropUrl != "" { backdrop = backdropUrl }
	if trailerUrl != "" { trailer = trailerUrl }

	var m models.Movie
	if err := pool.QueryRow(ctx,
		`INSERT INTO movies (title, poster_path, backdrop_path, trailer_url, s3_key, added_by,
			tmdb_id, overview, release_date, runtime, vote_average, genres, cast, director, source_type)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'uploaded')
		RETURNING id, created_at`,
		title, poster, backdrop, trailer, s3Key, user.ID,
		tmdbID, overview, releaseDate, runtime, voteAvg, genresJSON, castJSON, director,
	).Scan(&m.ID, &m.CreatedAt); err != nil {
		log.Error().Err(err).Msg("create movie failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create movie"})
	}

	m.Title = title
	if posterUrl != "" { m.PosterPath = &posterUrl }
	if backdropUrl != "" { m.BackdropPath = &backdropUrl }
	if trailerUrl != "" { m.TrailerURL = &trailerUrl }
	m.FilePath = &s3Key
	m.UploadedBy = user.ID
	m.SourceType = "uploaded"
	m.TmdbID = tmdbID
	m.Overview = overview
	m.ReleaseDate = releaseDate
	m.Runtime = runtime
	m.VoteAverage = voteAvg
	m.Director = director
	if genresJSON != nil {
		_ = json.Unmarshal(genresJSON, &m.Genres)
	}
	if castJSON != nil {
		_ = json.Unmarshal(castJSON, &m.Cast)
	}

	return c.JSON(http.StatusCreated, m)
}

type UpdateMovieBody struct {
	Watched    *bool      `json:"watched,omitempty"`
	WatchedAt  *time.Time `json:"watchedAt,omitempty"`
	Rating     *int       `json:"rating,omitempty"`
	Overview   *string    `json:"overview,omitempty"`
	Runtime    *int       `json:"runtime,omitempty"`
	VoteAverage *float64  `json:"voteAverage,omitempty"`
	Genres     []models.Genre `json:"genres,omitempty"`
	Cast       []models.CastMember `json:"cast,omitempty"`
	Director   *string    `json:"director,omitempty"`
}

func UpdateMovie(c echo.Context) error {
	id := c.Param("id")
	var body UpdateMovieBody
	if err := c.Bind(&body); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}

	ctx := context.Background()
	pool := db.Get()

	// Build dynamic update
	updates := []string{}
	args := []interface{}{}
	argIdx := 1

	if body.Watched != nil {
		updates = append(updates, fmt.Sprintf("watched = $%d", argIdx))
		args = append(args, *body.Watched)
		argIdx++
		if *body.Watched {
			updates = append(updates, fmt.Sprintf("watched_at = $%d", argIdx))
			args = append(args, time.Now())
			argIdx++
		} else {
			updates = append(updates, fmt.Sprintf("watched_at = $%d", argIdx))
			args = append(args, nil)
			argIdx++
		}
	}
	if body.Rating != nil {
		updates = append(updates, fmt.Sprintf("rating = $%d", argIdx))
		args = append(args, *body.Rating)
		argIdx++
	}
	if body.Overview != nil {
		updates = append(updates, fmt.Sprintf("overview = $%d", argIdx))
		args = append(args, *body.Overview)
		argIdx++
	}
	if body.Runtime != nil {
		updates = append(updates, fmt.Sprintf("runtime = $%d", argIdx))
		args = append(args, *body.Runtime)
		argIdx++
	}
	if body.VoteAverage != nil {
		updates = append(updates, fmt.Sprintf("vote_average = $%d", argIdx))
		args = append(args, *body.VoteAverage)
		argIdx++
	}
	if body.Genres != nil {
		genresJSON, _ := json.Marshal(body.Genres)
		updates = append(updates, fmt.Sprintf("genres = $%d", argIdx))
		args = append(args, genresJSON)
		argIdx++
	}
	if body.Cast != nil {
		castJSON, _ := json.Marshal(body.Cast)
		updates = append(updates, fmt.Sprintf("cast = $%d", argIdx))
		args = append(args, castJSON)
		argIdx++
	}
	if body.Director != nil {
		updates = append(updates, fmt.Sprintf("director = $%d", argIdx))
		args = append(args, *body.Director)
		argIdx++
	}

	if len(updates) == 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "no fields to update"})
	}

	args = append(args, id)
	query := fmt.Sprintf("UPDATE movies SET %s WHERE id = $%d", strings.Join(updates, ", "), argIdx)
	if _, err := pool.Exec(ctx, query, args...); err != nil {
		log.Error().Err(err).Str("id", id).Msg("update movie failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update movie"})
	}

	return GetMovie(c)
}

type AddToWatchlistBody struct {
	TmdbID int `json:"tmdbId"`
}

func AddToWatchlist(c echo.Context) error {
	var body AddToWatchlistBody
	if err := c.Bind(&body); err != nil || body.TmdbID == 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "tmdbId required"})
	}

	ctx := context.Background()
	pool := db.Get()
	user := authmw.GetUser(c)

	// Check if already in watchlist
	var existingID string
	_ = pool.QueryRow(ctx, "SELECT id FROM movies WHERE tmdb_id = $1 AND source_type = 'watchlist'", body.TmdbID).Scan(&existingID)
	if existingID != "" {
		return c.JSON(http.StatusConflict, map[string]string{"error": "already in watchlist"})
	}

	movie, err := services.FetchTMDBMovieForWatchlist(ctx, body.TmdbID)
	if err != nil {
		log.Error().Err(err).Int("tmdb_id", body.TmdbID).Msg("fetch tmdb for watchlist failed")
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "tmdb unavailable"})
	}

	var genresJSON, castJSON []byte
	if len(movie.Genres) > 0 {
		genresJSON, _ = json.Marshal(movie.Genres)
	}
	if len(movie.Cast) > 0 {
		castJSON, _ = json.Marshal(movie.Cast)
	}

	var m models.Movie
	if err := pool.QueryRow(ctx,
		`INSERT INTO movies (title, poster_path, backdrop_path, trailer_url, added_by,
			tmdb_id, overview, release_date, runtime, vote_average, genres, cast, director, source_type, watched)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'watchlist', false)
		RETURNING id, created_at`,
		movie.Title, movie.PosterPath, movie.BackdropPath, movie.TrailerURL, user.ID,
		movie.TmdbID, movie.Overview, movie.ReleaseDate, movie.Runtime, movie.VoteAverage,
		genresJSON, castJSON, movie.Director,
	).Scan(&m.ID, &m.CreatedAt); err != nil {
		log.Error().Err(err).Int("tmdb_id", body.TmdbID).Msg("add to watchlist failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to add to watchlist"})
	}

	m = *movie
	m.ID = m.ID
	m.UploadedBy = user.ID
	m.CreatedAt = m.CreatedAt

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

	if s3Key == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "no file available for this movie"})
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

	if s3Key == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "no file available for this movie"})
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
