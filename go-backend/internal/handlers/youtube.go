package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/labstack/echo/v4"

	"rina-backend/internal/config"
)

type youtubeSearchResult struct {
	Items []struct {
		ID struct {
			VideoID string `json:"videoId"`
		} `json:"id"`
		Snippet struct {
			Title       string `json:"title"`
			Description string `json:"description"`
			Thumbnails  struct {
				Default struct {
					URL string `json:"url"`
				} `json:"default"`
			} `json:"thumbnails"`
		} `json:"snippet"`
		ContentDetails struct {
			Duration string `json:"duration"`
		} `json:"contentDetails"`
	} `json:"items"`
}

func SearchYouTube(c echo.Context) error {
	query := c.QueryParam("q")
	if query == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "query required"})
	}

	cfg := config.Get()
	if cfg.YoutubeAPIKey == "" {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "YouTube API not configured"})
	}

	u := fmt.Sprintf("https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=%s&key=%s",
		url.QueryEscape(query), url.QueryEscape(cfg.YoutubeAPIKey))

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return c.JSON(http.StatusBadGateway, map[string]string{"error": "youtube request failed"})
	}
	defer resp.Body.Close()

	var result youtubeSearchResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to parse response"})
	}

	var results []map[string]interface{}
	for _, item := range result.Items {
		results = append(results, map[string]interface{}{
			"videoId":     item.ID.VideoID,
			"title":       item.Snippet.Title,
			"description": item.Snippet.Description,
			"thumbnail":   item.Snippet.Thumbnails.Default.URL,
		})
	}

	return c.JSON(http.StatusOK, results)
}
