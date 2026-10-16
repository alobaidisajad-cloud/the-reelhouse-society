-- films_retired_check.sql — how many films the sync has stopped reading, and when.
--
-- sync-films used to count TMDB refusing its OWN key (401, 403) as a strike
-- against each film, and three strikes retire a film for good. This counts the
-- films retired (sync_failed >= 3, never read), and the films with one or two
-- strikes, by the day each was last claimed, so a run of key trouble shows as a
-- cluster. Read-only: counts only, no titles, no ids.
--
--   node mobile/supabase/diagnostics/read-only.cjs films_retired_check.sql

SELECT 'films' AS what, count(*) FROM public.films
UNION ALL SELECT 'read', count(*) FROM public.films WHERE synced_at IS NOT NULL
UNION ALL SELECT 'waiting', count(*) FROM public.films WHERE synced_at IS NULL AND sync_failed < 3
UNION ALL SELECT 'one or two strikes', count(*) FROM public.films WHERE synced_at IS NULL AND sync_failed BETWEEN 1 AND 2
UNION ALL SELECT 'retired (three strikes)', count(*) FROM public.films WHERE synced_at IS NULL AND sync_failed >= 3;

SELECT coalesce(to_char(date_trunc('day', sync_claimed_at), 'YYYY-MM-DD'), 'never claimed') AS last_claimed, sync_failed, count(*)
FROM public.films
WHERE synced_at IS NULL AND sync_failed >= 1
GROUP BY 1, 2
ORDER BY 1, 2;
