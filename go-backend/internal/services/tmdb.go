package services

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/rs/zerolog/log"
	"rina-backend/internal/config"
	"rina-backend/internal/models"
)

const (
	tmdbBaseURL     = "https://api.themoviedb.org/3"
	tmdbImageBase   = "https://image.tmdb.org/t/p"
	tmdbCacheTTL    = 1 * time.Hour
)

// ─── TMDB Response Types ───────────────────────────────────────────

type TMDBMovieResult struct {
	ID          int     `json:"id"`
	Title       string  `json:"title"`
	Overview    string  `json:"overview"`
	PosterPath  *string `json:"poster_path"`
	BackdropPath *string `json:"backdrop_path"`
	ReleaseDate string  `json:"release_date"`
	VoteAverage float64 `json:"vote_average"`
	GenreIDs    []int   `json:"genre_ids"`
}

type TMDBSearchResponse struct {
	Page         int               `json:"page"`
	Results      []TMDBMovieResult `json:"results"`
	TotalPages   int               `json:"total_pages"`
	TotalResults int               `json:"total_results"`
}

type TMDBDiscoverResponse struct {
	Page         int               `json:"page"`
	Results      []TMDBMovieResult `json:"results"`
	TotalPages   int               `json:"total_pages"`
	TotalResults int               `json:"total_results"`
}

type TMDBGenre struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type TMDBGenreList struct {
	Genres []TMDBGenre `json:"genres"`
}

type TMDBCast struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	Character   string  `json:"character"`
	ProfilePath *string `json:"profile_path"`
	Order       int     `json:"order"`
}

type TMDBCrew struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	Job         string  `json:"job"`
	ProfilePath *string `json:"profile_path"`
}

type TMDBCreditsResponse struct {
	Cast []TMDBCast `json:"cast"`
	Crew []TMDBCrew `json:"crew"`
}

type TMDBVideo struct {
	Key  string `json:"key"`
	Site string `json:"site"`
	Type string `json:"type"`
}

type TMDBVideos struct {
	Results []TMDBVideo `json:"results"`
}

type TMDBMovieDetail struct {
	ID            int          `json:"id"`
	Title         string       `json:"title"`
	Tagline       string       `json:"tagline"`
	Overview      string       `json:"overview"`
	PosterPath    *string      `json:"poster_path"`
	BackdropPath  *string      `json:"backdrop_path"`
	ReleaseDate   string       `json:"release_date"`
	Runtime       int          `json:"runtime"`
	VoteAverage   float64      `json:"vote_average"`
	Genres        []TMDBGenre  `json:"genres"`
	Credits       *TMDBCreditsResponse `json:"credits,omitempty"`
	Videos        *TMDBVideos  `json:"videos,omitempty"`
}

// ─── Public Helpers ────────────────────────────────────────────────

func TMDBImageURL(path string, size string) string {
	if path == "" {
		return ""
	}
	return fmt.Sprintf("%s/%s%s", tmdbImageBase, size, path)
}

func TMDBPosterURL(path string) string {
	return TMDBImageURL(path, "w500")
}

func TMDBBackdropURL(path string) string {
	return TMDBImageURL(path, "w1280")
}

func TMDBProfileURL(path string) string {
	return TMDBImageURL(path, "w185")
}

// ─── Service Methods ──────────────────────────────────────────────

func tmdbRequest(ctx context.Context, endpoint string, query url.Values) (*http.Response, error) {
	cfg := config.Get()
	if cfg.TMDBAPIKey == "" {
		return nil, fmt.Errorf("TMDB_API_KEY not configured")
	}

	if query == nil {
		query = url.Values{}
	}
	query.Set("api_key", cfg.TMDBAPIKey)

	u := fmt.Sprintf("%s%s?%s", tmdbBaseURL, endpoint, query.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	return client.Do(req)
}

func SearchMovies(ctx context.Context, query string, page int) (*TMDBSearchResponse, error) {
	cacheKey := fmt.Sprintf("tmdb:search:%s:%d", query, page)
	if cached, err := CacheGet[TMDBSearchResponse](ctx, cacheKey); err == nil {
		return &cached, nil
	}

	q := url.Values{}
	q.Set("query", query)
	q.Set("page", strconv.Itoa(page))

	resp, err := tmdbRequest(ctx, "/search/movie", q)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tmdb search returned %d", resp.StatusCode)
	}

	var result TMDBSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	_ = CacheSet(ctx, cacheKey, result, tmdbCacheTTL)
	return &result, nil
}

func DiscoverMovies(ctx context.Context, category string, page int) (*TMDBDiscoverResponse, error) {
	validCategories := map[string]bool{
		"popular":     true,
		"top_rated":   true,
		"upcoming":    true,
		"now_playing": true,
	}
	if !validCategories[category] {
		category = "popular"
	}

	cacheKey := fmt.Sprintf("tmdb:discover:%s:%d", category, page)
	if cached, err := CacheGet[TMDBDiscoverResponse](ctx, cacheKey); err == nil {
		return &cached, nil
	}

	q := url.Values{}
	q.Set("page", strconv.Itoa(page))

	resp, err := tmdbRequest(ctx, fmt.Sprintf("/movie/%s", category), q)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tmdb discover returned %d", resp.StatusCode)
	}

	var result TMDBDiscoverResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	_ = CacheSet(ctx, cacheKey, result, tmdbCacheTTL)
	return &result, nil
}

func GetTMDBMovieDetails(ctx context.Context, tmdbID int) (*TMDBMovieDetail, error) {
	cacheKey := fmt.Sprintf("tmdb:movie:%d", tmdbID)
	if cached, err := CacheGet[TMDBMovieDetail](ctx, cacheKey); err == nil {
		return &cached, nil
	}

	q := url.Values{}
	q.Set("append_to_response", "credits,videos")

	resp, err := tmdbRequest(ctx, fmt.Sprintf("/movie/%d", tmdbID), q)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tmdb movie details returned %d", resp.StatusCode)
	}

	var result TMDBMovieDetail
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	_ = CacheSet(ctx, cacheKey, result, tmdbCacheTTL)
	return &result, nil
}

func GetTMDBMovieCredits(ctx context.Context, tmdbID int) (*TMDBCreditsResponse, error) {
	cacheKey := fmt.Sprintf("tmdb:credits:%d", tmdbID)
	if cached, err := CacheGet[TMDBCreditsResponse](ctx, cacheKey); err == nil {
		return &cached, nil
	}

	resp, err := tmdbRequest(ctx, fmt.Sprintf("/movie/%d/credits", tmdbID), nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tmdb credits returned %d", resp.StatusCode)
	}

	var result TMDBCreditsResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	_ = CacheSet(ctx, cacheKey, result, tmdbCacheTTL)
	return &result, nil
}

func GetTMDBGenres(ctx context.Context) ([]models.Genre, error) {
	cacheKey := "tmdb:genres"
	if cached, err := CacheGet[[]models.Genre](ctx, cacheKey); err == nil {
		return cached, nil
	}

	resp, err := tmdbRequest(ctx, "/genre/movie/list", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tmdb genres returned %d", resp.StatusCode)
	}

	var result TMDBGenreList
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	genres := make([]models.Genre, len(result.Genres))
	for i, g := range result.Genres {
		genres[i] = models.Genre{ID: g.ID, Name: g.Name}
	}

	_ = CacheSet(ctx, cacheKey, genres, tmdbCacheTTL)
	return genres, nil
}

// FetchAndEnrich fetches TMDB details and enriches a movie model.
func FetchTMDBMovieForWatchlist(ctx context.Context, tmdbID int) (*models.Movie, error) {
	detail, err := GetTMDBMovieDetails(ctx, tmdbID)
	if err != nil {
		return nil, err
	}

	movie := &models.Movie{
		Title:      detail.Title,
		TmdbID:     &tmdbID,
		Overview:   &detail.Overview,
		Runtime:    &detail.Runtime,
		VoteAverage: &detail.VoteAverage,
		SourceType: "watchlist",
		Watched:    false,
	}

	if detail.PosterPath != nil && *detail.PosterPath != "" {
		url := TMDBPosterURL(*detail.PosterPath)
		movie.PosterPath = &url
	}
	if detail.BackdropPath != nil && *detail.BackdropPath != "" {
		url := TMDBBackdropURL(*detail.BackdropPath)
		movie.BackdropPath = &url
	}

	if detail.ReleaseDate != "" {
		if t, err := time.Parse("2006-01-02", detail.ReleaseDate); err == nil {
			movie.ReleaseDate = &t
		}
	}

	if len(detail.Genres) > 0 {
		genres := make([]models.Genre, len(detail.Genres))
		for i, g := range detail.Genres {
			genres[i] = models.Genre{ID: g.ID, Name: g.Name}
		}
		movie.Genres = genres
	}

	if detail.Credits != nil && len(detail.Credits.Cast) > 0 {
		cast := make([]models.CastMember, 0, 10)
		for i, c := range detail.Credits.Cast {
			if i >= 10 {
				break
			}
			cm := models.CastMember{
				ID:        c.ID,
				Name:      c.Name,
				Character: c.Character,
				Order:     c.Order,
			}
			if c.ProfilePath != nil && *c.ProfilePath != "" {
				url := TMDBProfileURL(*c.ProfilePath)
				cm.ProfilePath = &url
			}
			cast = append(cast, cm)
		}
		movie.Cast = cast
	}

	if detail.Credits != nil {
		for _, crew := range detail.Credits.Crew {
			if crew.Job == "Director" {
				movie.Director = &crew.Name
				break
			}
		}
	}

	// Find YouTube trailer
	if detail.Videos != nil {
		for _, v := range detail.Videos.Results {
			if v.Site == "YouTube" && (v.Type == "Trailer" || v.Type == "Teaser") {
				url := fmt.Sprintf("https://www.youtube.com/watch?v=%s", v.Key)
				movie.TrailerURL = &url
				break
			}
		}
	}

	log.Info().Int("tmdb_id", tmdbID).Str("title", detail.Title).Msg("fetched tmdb movie for watchlist")
	return movie, nil
}
