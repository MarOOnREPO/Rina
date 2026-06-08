package handlers

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"

	"rina-backend/internal/services"
)

func SearchTMDB(c echo.Context) error {
	query := c.QueryParam("q")
	if query == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "query parameter 'q' is required"})
	}

	page := 1
	if p := c.QueryParam("page"); p != "" {
		if n, err := strconv.Atoi(p); err == nil && n > 0 {
			page = n
		}
	}

	result, err := services.SearchMovies(c.Request().Context(), query, page)
	if err != nil {
		log.Warn().Err(err).Str("query", query).Msg("tmdb search failed")
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "tmdb unavailable"})
	}
	return c.JSON(http.StatusOK, result)
}

func DiscoverTMDB(c echo.Context) error {
	category := c.QueryParam("category")
	if category == "" {
		category = "popular"
	}

	page := 1
	if p := c.QueryParam("page"); p != "" {
		if n, err := strconv.Atoi(p); err == nil && n > 0 {
			page = n
		}
	}

	result, err := services.DiscoverMovies(c.Request().Context(), category, page)
	if err != nil {
		log.Warn().Err(err).Str("category", category).Msg("tmdb discover failed")
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "tmdb unavailable"})
	}
	return c.JSON(http.StatusOK, result)
}

func GetTMDBMovie(c echo.Context) error {
	idStr := c.Param("tmdbId")
	tmdbID, err := strconv.Atoi(idStr)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid tmdb id"})
	}

	result, err := services.GetTMDBMovieDetails(c.Request().Context(), tmdbID)
	if err != nil {
		log.Warn().Err(err).Int("tmdb_id", tmdbID).Msg("tmdb movie details failed")
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "tmdb unavailable"})
	}
	return c.JSON(http.StatusOK, result)
}

func GetTMDBCredits(c echo.Context) error {
	idStr := c.Param("tmdbId")
	tmdbID, err := strconv.Atoi(idStr)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid tmdb id"})
	}

	result, err := services.GetTMDBMovieCredits(c.Request().Context(), tmdbID)
	if err != nil {
		log.Warn().Err(err).Int("tmdb_id", tmdbID).Msg("tmdb credits failed")
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "tmdb unavailable"})
	}
	return c.JSON(http.StatusOK, result)
}

func GetTMDBGenres(c echo.Context) error {
	result, err := services.GetTMDBGenres(c.Request().Context())
	if err != nil {
		log.Warn().Err(err).Msg("tmdb genres failed")
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "tmdb unavailable"})
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"genres": result})
}
