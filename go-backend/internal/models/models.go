package models

import "time"

type EventType string

const (
	EventTypeWork   EventType = "WORK"
	EventTypeShared EventType = "SHARED"
)

type MessageType string

const (
	MessageTypeText  MessageType = "TEXT"
	MessageTypeImage MessageType = "IMAGE"
	MessageTypeAudio MessageType = "AUDIO"
	MessageTypeVideo MessageType = "VIDEO"
)

type PresenceStatus string

const (
	StatusOnline  PresenceStatus = "online"
	StatusAway    PresenceStatus = "away"
	StatusTyping  PresenceStatus = "typing"
	StatusOffline PresenceStatus = "offline"
)

type User struct {
	ID          string    `json:"id"`
	Username    string    `json:"username"`
	DisplayName string    `json:"displayName"`
	AvatarURL   *string   `json:"avatarUrl,omitempty"`
	Timezone    string    `json:"timezone"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type Partnership struct {
	ID        string    `json:"id"`
	UserAID   string    `json:"userAId"`
	UserBID   string    `json:"userBId"`
	CreatedAt time.Time `json:"createdAt"`
}

type Message struct {
	ID        string       `json:"id"`
	SenderID  string       `json:"senderId"`
	Content   string       `json:"content"`
	Type      MessageType  `json:"type"`
	MediaURL  *string      `json:"mediaUrl,omitempty"`
	ReplyToID *string      `json:"replyToId,omitempty"`
	EditedAt  *time.Time   `json:"editedAt,omitempty"`
	CreatedAt time.Time    `json:"createdAt"`
	Sender    *User        `json:"sender,omitempty"`
	ReplyTo   *Message     `json:"replyTo,omitempty"`
}

type CalendarEvent struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Description *string   `json:"description,omitempty"`
	StartTime   time.Time `json:"startTime"`
	EndTime     *time.Time `json:"endTime,omitempty"`
	Type        EventType `json:"type"`
	CreatorID   string    `json:"creatorId"`
	AllDay      bool      `json:"allDay"`
	Color       *string   `json:"color,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type CycleEntry struct {
	ID            string    `json:"id"`
	UserID        string    `json:"userId"`
	Date          time.Time `json:"date"`
	FlowIntensity *int16    `json:"flowIntensity,omitempty"`
	Symptoms      []string  `json:"symptoms,omitempty"`
	Temperature   *float32  `json:"temperature,omitempty"`
	Notes         *string   `json:"notes,omitempty"`
	CreatedAt     time.Time `json:"createdAt"`
}

type Genre struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type CastMember struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	Character   string  `json:"character"`
	ProfilePath *string `json:"profilePath,omitempty"`
	Order       int     `json:"order"`
}

type Movie struct {
	ID           string       `json:"id"`
	Title        string       `json:"title"`
	PosterPath   *string      `json:"posterPath,omitempty"`
	BackdropPath *string      `json:"backdropPath,omitempty"`
	TrailerURL   *string      `json:"trailerUrl,omitempty"`
	FilePath     *string      `json:"filePath,omitempty"`
	UploadedBy   string       `json:"uploadedBy"`
	CreatedAt    time.Time    `json:"createdAt"`
	// TMDB & watchlist fields
	TmdbID       *int         `json:"tmdbId,omitempty"`
	Overview     *string      `json:"overview,omitempty"`
	ReleaseDate  *time.Time   `json:"releaseDate,omitempty"`
	Runtime      *int         `json:"runtime,omitempty"`
	VoteAverage  *float64     `json:"voteAverage,omitempty"`
	Genres       []Genre      `json:"genres,omitempty"`
	Cast         []CastMember `json:"cast,omitempty"`
	Director     *string      `json:"director,omitempty"`
	SourceType   string       `json:"sourceType"`
	Watched      bool         `json:"watched"`
	WatchedAt    *time.Time   `json:"watchedAt,omitempty"`
	Rating       *int         `json:"rating,omitempty"`
}

type Notification struct {
	ID        string    `json:"id"`
	UserID    string    `json:"userId"`
	Type      string    `json:"type"`
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	Data      *map[string]interface{} `json:"data,omitempty"`
	Read      bool      `json:"read"`
	CreatedAt time.Time `json:"createdAt"`
}

type PushSubscription struct {
	ID        string    `json:"id"`
	UserID    string    `json:"userId"`
	Endpoint  string    `json:"endpoint"`
	P256DH    string    `json:"p256dh"`
	Auth      string    `json:"auth"`
	CreatedAt time.Time `json:"createdAt"`
}

type Config struct {
	ID        string    `json:"id"`
	Key       string    `json:"key"`
	Value     string    `json:"value"`
	UpdatedAt time.Time `json:"updatedAt"`
	UpdatedBy *string   `json:"updatedBy,omitempty"`
}

type JWTPayload struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Timezone    string `json:"timezone"`
}
