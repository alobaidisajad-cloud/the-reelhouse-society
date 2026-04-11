-- Viewing Chronicle: Single-log-with-history architecture
-- Adds viewing_history JSONB and view_count to logs table
-- This replaces the multi-row approach with an in-row history array

ALTER TABLE logs ADD COLUMN IF NOT EXISTS viewing_history JSONB DEFAULT '[]';
ALTER TABLE logs ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 1;

-- Drop the old composite index if it exists (no longer needed for multi-log lookups)
DROP INDEX IF EXISTS logs_user_film_idx;

-- Create a unique constraint to enforce one log per user per film
-- (handles existing duplicates by keeping the newest one)
CREATE UNIQUE INDEX IF NOT EXISTS logs_user_film_unique ON logs (user_id, film_id);
