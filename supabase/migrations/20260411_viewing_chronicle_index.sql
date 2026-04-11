-- ══════════════════════════════════════════════════════════════
-- Viewing Chronicle — multi-log per film support
-- Adds a composite index for fast lookup of all logs per user+film
-- ══════════════════════════════════════════════════════════════

-- Index: fast retrieval of all logs for a given user + film combo (newest-first)
CREATE INDEX IF NOT EXISTS logs_user_film_idx ON public.logs(user_id, film_id, created_at DESC);

-- Note: No schema changes needed — the logs table already supports
-- multiple rows per (user_id, film_id) pair. Each log has its own UUID.
-- The 'status' column already allows 'rewatched' as a valid value.
