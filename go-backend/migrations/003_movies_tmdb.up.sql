-- 003_movies_tmdb.up.sql
-- Extend movies table with TMDB metadata and watchlist support

-- Rename file_path -> s3_key if still using old name (idempotent)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'movies' AND column_name = 'file_path'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'movies' AND column_name = 's3_key'
    ) THEN
        ALTER TABLE movies RENAME COLUMN file_path TO s3_key;
    END IF;
END $$;

-- Make s3_key nullable (watchlist items have no file)
ALTER TABLE movies ALTER COLUMN s3_key DROP NOT NULL;

-- TMDB metadata fields
ALTER TABLE movies ADD COLUMN IF NOT EXISTS tmdb_id INT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS overview TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS release_date DATE;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS runtime INT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS vote_average DECIMAL(3,1);
ALTER TABLE movies ADD COLUMN IF NOT EXISTS genres JSONB;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS cast JSONB;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS director TEXT;

-- Source type: uploaded (has S3 file) or watchlist (TMDB reference only)
ALTER TABLE movies ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'uploaded';

-- Watchlist tracking
ALTER TABLE movies ADD COLUMN IF NOT EXISTS watched BOOLEAN DEFAULT FALSE;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS watched_at TIMESTAMPTZ;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS rating SMALLINT CHECK (rating BETWEEN 1 AND 10);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_movies_tmdb_id ON movies(tmdb_id) WHERE tmdb_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movies_source_type ON movies(source_type);
CREATE INDEX IF NOT EXISTS idx_movies_watched ON movies(watched);
