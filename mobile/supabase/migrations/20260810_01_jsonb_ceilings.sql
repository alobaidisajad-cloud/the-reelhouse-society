-- ============================================================================
-- BATCH 27 · follow-up 2 — the jsonb columns
-- ============================================================================
--
-- 20260809_04 and _05 bounded all 122 text and array columns. They missed an
-- entire type. There are 14 jsonb columns and not one of them was bounded.
--
-- This was found by VERIFYING two things I had flagged as problems. Both turned
-- out to be false positives from a stale schema snapshot — but proving them
-- false required asking the live database exactly which columns a member may
-- write, and the answer named `social_links`, which is jsonb.
--
--   authenticated may UPDATE: avatar_url, bio, display_name, is_social_private,
--                             persona, social_links, username
--
-- So a member can PATCH megabytes of JSON into their own `social_links` today,
-- through the same door I spent two migrations closing for text. Also reachable:
-- `logs.autopsy` and `logs.viewing_history` (own logs), `lounge_messages.metadata`
-- (every message sent), `analytics_events.properties` (any client).
-- No client bounds any of them.
--
-- ── THE TOOL ────────────────────────────────────────────────────────────────
-- `char_length(col::text)` — the cast uses jsonb_out, which is immutable, so it
-- is legal in a CHECK. Verified, along with the fact that it leaves the '{}'
-- default and NULL alone. (`pg_column_size` measures COMPRESSED storage, which
-- is not a stable thing to promise a member.)
--
-- ── MEASURED LIVE, NOT ASSUMED ──────────────────────────────────────────────
--   logs.viewing_history     3331   profiles.preferences  588
--   lounge_messages.metadata  309   logs.autopsy           89
--   profiles.badges            77   analytics_events.properties 56
--   everything else <= 2
--
-- ── WHY viewing_history IS THE ODD ONE ──────────────────────────────────────
-- It is the only column here that GROWS with ordinary use: every rewatch appends
-- an entry. A ceiling that is comfortable today becomes a wall later, and the
-- failure is a member unable to log a rewatch. 3331 is roughly 25 rewatches, so
-- 50000 is about 375 — beyond any human, while still turning "unbounded" into
-- 50KB. It is also NOT returned by any feed function (it appears exactly once in
-- the schema, on the table itself), so an oversized one costs its owner and
-- nobody else. That is what allows it to be this generous.
--
-- Upper bound only. Fails loudly on a missing column or a view. Refuses to wait
-- for a lock. Convergent on re-run.
-- ============================================================================

DO $$
DECLARE
  c        record;
  missing  text[] := '{}';
  notTable text[] := '{}';
  applied  int := 0;
BEGIN
  SET LOCAL lock_timeout = '3s';
  SET LOCAL statement_timeout = '120s';

  FOR c IN
    SELECT * FROM (VALUES
      -- member-writable, and the one that started this
      ('profiles',         'social_links',    4000),
      -- member-writable through their own logs / messages / analytics
      ('logs',             'viewing_history', 50000),
      ('logs',             'autopsy',         20000),
      ('lounge_messages',  'metadata',         8000),
      ('analytics_events', 'properties',       4000),
      -- written for the member by the server, bounded so nothing can grow wild
      ('profiles',         'preferences',      8000),
      ('profiles',         'badges',           8000),
      ('profiles',         'favorite_films',   8000),
      ('profiles',         'taste_seeds',      8000),
      -- secondary tables, empty today; generous fences
      ('programmes',       'films',           50000),
      ('showtimes',        'slots',           50000),
      ('venues',           'screens',         50000),
      ('venues',           'seat_layout',     50000),
      ('venues',           'vibes',            8000)
    ) AS t(tbl, col, cap)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=c.tbl AND column_name=c.col) THEN
      missing := missing || format('%s.%s', c.tbl, c.col);
    ELSIF NOT EXISTS (SELECT 1 FROM pg_class pcl
                      JOIN pg_namespace pn ON pn.oid = pcl.relnamespace
                      WHERE pn.nspname='public' AND pcl.relname=c.tbl AND pcl.relkind='r') THEN
      notTable := notTable || c.tbl;
    END IF;
  END LOOP;

  IF array_length(missing,1) > 0 THEN
    RAISE EXCEPTION 'ABORTED — % target column(s) do not exist: %. Nothing was changed.',
      array_length(missing,1), array_to_string(missing, ', ');
  END IF;
  IF array_length(notTable,1) > 0 THEN
    RAISE EXCEPTION 'ABORTED — not ordinary tables (a CHECK cannot go on a view): %. Nothing was changed.',
      array_to_string(notTable, ', ');
  END IF;

  FOR c IN
    SELECT * FROM (VALUES
      ('profiles',         'social_links',    4000),
      ('logs',             'viewing_history', 50000),
      ('logs',             'autopsy',         20000),
      ('lounge_messages',  'metadata',         8000),
      ('analytics_events', 'properties',       4000),
      ('profiles',         'preferences',      8000),
      ('profiles',         'badges',           8000),
      ('profiles',         'favorite_films',   8000),
      ('profiles',         'taste_seeds',      8000),
      ('programmes',       'films',           50000),
      ('showtimes',        'slots',           50000),
      ('venues',           'screens',         50000),
      ('venues',           'seat_layout',     50000),
      ('venues',           'vibes',            8000)
    ) AS t(tbl, col, cap)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint pc
               JOIN pg_class pcl ON pcl.oid = pc.conrelid
               JOIN pg_namespace pn ON pn.oid = pcl.relnamespace
               WHERE pn.nspname='public' AND pcl.relname=c.tbl
                 AND pc.conname = c.tbl||'_'||c.col||'_len') THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', c.tbl, c.tbl||'_'||c.col||'_len');
    END IF;
    -- NULL passes: an absent object is not an oversized one.
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (char_length(%I::text) <= %s)',
                   c.tbl, c.tbl||'_'||c.col||'_len', c.col, c.cap);
    applied := applied + 1;
  END LOOP;

  RAISE NOTICE 'OK — % jsonb ceilings applied and validated.', applied;
END $$;

-- ============================================================================
-- VERIFY (read-only) — expect 130 ceilings in total, 0 unvalidated
-- ============================================================================
--   SELECT count(*) FILTER (WHERE conname LIKE '%\_len') AS ceilings,
--          count(*) FILTER (WHERE conname LIKE '%\_len' AND NOT convalidated) AS unvalidated
--     FROM pg_constraint WHERE contype = 'c';
-- ============================================================================
