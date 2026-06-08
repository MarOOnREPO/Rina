-- Safe migration: add trailer_url to existing movies table if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'movies' AND column_name = 'trailer_url'
    ) THEN
        ALTER TABLE movies ADD COLUMN trailer_url TEXT;
    END IF;
END $$;
