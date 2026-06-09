-- Add tmdbData JSON column to Movie table
ALTER TABLE "Movie" ADD COLUMN "tmdbData" JSONB;
