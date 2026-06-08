CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Enums ───────────────────────────────────────────────────────
CREATE TYPE event_type AS ENUM ('WORK', 'SHARED');
CREATE TYPE message_type AS ENUM ('TEXT', 'IMAGE', 'AUDIO', 'VIDEO');

-- ─── Users ───────────────────────────────────────────────────────
CREATE TABLE users (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    username    VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    avatar_url  TEXT,
    timezone    VARCHAR(50) DEFAULT 'UTC',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Partnerships ────────────────────────────────────────────────
CREATE TABLE partnerships (
    id        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_a_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_a_id, user_b_id)
);

CREATE INDEX idx_partnerships_user_a ON partnerships(user_a_id);
CREATE INDEX idx_partnerships_user_b ON partnerships(user_b_id);

-- ─── Messages ────────────────────────────────────────────────────
CREATE TABLE messages (
    id        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content   VARCHAR(4000) NOT NULL,
    type      message_type DEFAULT 'TEXT',
    media_url TEXT,
    reply_to_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
    edited_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_messages_sender ON messages(sender_id);

-- ─── Calendar Events ─────────────────────────────────────────────
CREATE TABLE calendar_events (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    title       VARCHAR(200) NOT NULL,
    description VARCHAR(2000),
    start_time  TIMESTAMPTZ NOT NULL,
    end_time    TIMESTAMPTZ,
    type        event_type DEFAULT 'SHARED',
    creator_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    all_day     BOOLEAN DEFAULT FALSE,
    color       VARCHAR(7),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calendar_start_time ON calendar_events(start_time);
CREATE INDEX idx_calendar_type ON calendar_events(type);
CREATE INDEX idx_calendar_creator ON calendar_events(creator_id);

-- ─── Cycle Entries ───────────────────────────────────────────────
CREATE TABLE cycle_entries (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date          DATE NOT NULL,
    flow_intensity SMALLINT CHECK (flow_intensity BETWEEN 0 AND 4),
    symptoms      TEXT[],
    temperature   REAL,
    notes         TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, date)
);

CREATE INDEX idx_cycle_date ON cycle_entries(date);

-- ─── Movies ──────────────────────────────────────────────────────
CREATE TABLE movies (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    title       VARCHAR(300) NOT NULL,
    poster_path TEXT,
    backdrop_path TEXT,
    trailer_url TEXT,
    file_path   TEXT NOT NULL,
    uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_movies_uploaded_by ON movies(uploaded_by);

-- ─── Notifications ───────────────────────────────────────────────
CREATE TABLE notifications (
    id        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type      VARCHAR(50) NOT NULL,
    title     VARCHAR(200) NOT NULL,
    body      VARCHAR(500) NOT NULL,
    data      JSONB,
    read      BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_read ON notifications(user_id, read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- ─── Push Subscriptions ──────────────────────────────────────────
CREATE TABLE push_subscriptions (
    id        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint  TEXT UNIQUE NOT NULL,
    p256dh    TEXT NOT NULL,
    auth      TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_push_subs_user ON push_subscriptions(user_id);

-- ─── Config ──────────────────────────────────────────────────────
CREATE TABLE config (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    key        VARCHAR(100) UNIQUE NOT NULL,
    value      VARCHAR(2000) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by VARCHAR(50)
);

CREATE INDEX idx_config_key ON config(key);
