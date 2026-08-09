-- ============================================================================
-- BATCH 27 · #93 — no server-side length limit on ANY text a member writes
-- ============================================================================
--
-- Every text column in this database is bare `text`. Out of 122 of them exactly
-- one carries a length CHECK. The clients ask politely; the database accepts a
-- megabyte. Anyone with the anon key and an HTTP client can bypass both apps.
--
-- What it costs, verified not assumed:
--   • comments render in a plain Text/<div> with NO line limit, so an oversized
--     one is laid out in full on every reader's device;
--   • it ships in the payload of every fetch of that log, list or dossier,
--     forever, on everyone's data;
--   • `reports.details` is the field the Tribunal is GUARANTEED to render
--     hostile input from;
--   • `dispatch_dossiers.full_content` is worse than large — two markdown rules
--     are quadratic, so a long enough essay freezes the reading device.
--
-- ── THE RULE THAT SHAPES THIS FILE ──────────────────────────────────────────
-- LIMIT WHAT A PERSON TYPES. NEVER LIMIT WHAT THE SERVER BUILDS FROM IT.
--
-- `notifications.message` is assembled by a TRIGGER:
--     'added a critique to your log of ' || COALESCE(target_film_title,'a film')
-- A CHECK there would abort the trigger, and with it the member's comment. So
-- server-derived columns are deliberately left alone and the SOURCE is bounded
-- instead — bounding `logs.film_title` shortens that message automatically.
-- Same reasoning excludes error_logs, mod_actions, warnings, tips,
-- profiles.ban_reason and reports.resolution_notes: a rejection there blocks a
-- moderation action or an error report, which is worse than the oversize.
--
-- ── EVERY NUMBER IS THE MORE GENEROUS OF THE TWO CLIENTS ────────────────────
-- Both apps write these tables. A limit set to one client's number rejects the
-- other's legitimate writes. Four actually disagreed, and the mismatch is the
-- whole reason this file exists in the shape it does:
--     lounges.name           mobile  50   web 60   -> 60   (web would have broken)
--     logs.review            mobile 5000  web 2000 -> 5000
--     profiles.display_name  mobile  50   web 30   -> 50
--     lounges.description    mobile 1000  web 300  -> 1000
--
-- ── SAFE ON EXISTING DATA — MEASURED, NOT HOPED ─────────────────────────────
-- Longest value live per column at the time of writing, e.g.
--     logs.review 1709/5000 · dispatch_dossiers.full_content 2770/25000
--     lounge_messages.content 271/2000 · lists.description 241/1000
--     profiles.bio 32/160 · watchlists.film_title 65/300
-- Every value is far inside its ceiling, so these validate on creation. Had one
-- exceeded, ADD CONSTRAINT would fail partway and leave the schema half-changed.
--
-- ── UPPER BOUND ONLY ────────────────────────────────────────────────────────
-- `length(x) BETWEEN 1 AND N` — the shape this schema already uses on
-- private_notes — would break the app twice over: `lounge_messages.content`
-- DEFAULTs to '' for a shared film that carries no text, AND withdrawing a
-- message sets it to '' (`UPDATE lounge_messages SET content = ''`).
--
-- Convergent and safe to re-run: each constraint is dropped and recreated, so
-- changing a number here and re-running actually applies it rather than
-- silently keeping the old one.
-- ============================================================================

DO $$
DECLARE
  c        record;
  missing  text[] := '{}';
  notTable text[] := '{}';
  applied  int := 0;
BEGIN
  -- ── RUNNING THIS AGAINST A LIVE DATABASE ─────────────────────────────────
  -- ADD CONSTRAINT takes an ACCESS EXCLUSIVE lock. The tables here are small
  -- (largest 854 rows) so the validation scan is instant — the risk is not the
  -- work, it is the WAIT. If any query is mid-flight on one of these tables the
  -- ALTER queues behind it, and every read and write that arrives afterwards
  -- queues behind the ALTER. On a live app that is a stall, from a statement
  -- that only needed a few milliseconds.
  --
  -- So: refuse to wait. If a lock cannot be taken in 3 seconds the whole block
  -- aborts and NOTHING is applied — a clean retry beats a queue of blocked
  -- members. All 34 run in one transaction, so it is all-or-nothing either way.
  SET LOCAL lock_timeout = '3s';
  SET LOCAL statement_timeout = '60s';
  -- ── PASS 1: verify every target exists BEFORE changing anything ───────────
  -- The previous draft of this migration skipped a missing column with a
  -- NOTICE that read the same as "already done". A migration whose whole job is
  -- to close a hole must fail loudly when it cannot. This matters here: the web
  -- repo's own migration declares `log_comments.content` while the live table
  -- uses `body` — repo and production genuinely disagree about these names.
  FOR c IN
    SELECT * FROM (VALUES
      -- ── member prose: limits agreed with BOTH clients ────────────────────
      ('log_comments',      'body',              2000),
      ('list_comments',     'content',           2000),
      ('dossier_comments',  'body',              2000),
      ('lounge_messages',   'content',           2000),
      -- the quoted copy of the message being replied to. Member-supplied on
      -- insert, unsanitised, and sitting in the SAME ROW as `content` — capping
      -- one and not the other leaves the hole open through its neighbour.
      ('lounge_messages',   'reply_to_content',  2000),
      ('reports',           'details',            500),
      ('logs',              'review',            5000),
      ('lists',             'title',              100),
      ('lists',             'description',       1000),
      ('lounges',           'name',                60),
      ('lounges',           'description',       1000),
      ('profiles',          'bio',                160),
      ('profiles',          'display_name',        50),
      ('profiles',          'persona',             50),
      ('dispatch_dossiers', 'title',              200),
      ('dispatch_dossiers', 'excerpt',            500),
      ('dispatch_dossiers', 'full_content',     25000),
      -- ── member text with no client limit: generous ceilings ──────────────
      -- No client contract to match, so these are set far above any real value
      -- (longest live shown in the header) purely to bound abuse.
      ('logs',              'pull_quote',         500),   -- UI 120, live 111
      ('logs',              'watched_with',       200),   -- UI  60
      ('logs',              'private_notes',     1000),   -- web UI 1000
      ('logs',              'abandoned_reason',   500),
      ('logs',              'film_title',         300),   -- live 46
      ('list_items',        'film_title',         300),   -- live 49
      ('list_items',        'notes',             2000),
      ('watchlists',        'film_title',         300),   -- live 65
      ('vaults',            'film_title',         300),
      ('physical_archive',  'film_title',         300),
      ('physical_archive',  'notes',             2000),
      ('video_reviews',     'film_title',         300),
      ('video_reviews',     'title',              300),
      -- 100, NOT the 30 both clients validate to. `handle_new_user` derives a
      -- username on signup when metadata carries none:
      --     COALESCE(meta->>'username', split_part(NEW.email, '@', 1))
      -- An email local-part is up to 64 characters (RFC 5321), so a ceiling of
      -- 50 would abort the trigger and FAIL THE SIGNUP. Both apps send a
      -- username today and there is no social login yet — but the signup
      -- endpoint is public, and adding Sign in with Apple/Google makes that
      -- fallback the normal path. The ceiling must clear what the SERVER can
      -- generate, not just what the clients send.
      ('profiles',          'username',           100),
      ('reports',           'reason',             100),   -- enum, longest 16
      ('reports',           'content_type',        50),   -- enum, longest 15
      ('reports',           'content_id',         100)    -- a uuid, 36
    ) AS t(tbl, col, cap)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = c.tbl AND column_name = c.col
    ) THEN
      missing := missing || format('%s.%s', c.tbl, c.col);
    -- A CHECK cannot live on a view, and ALTER TABLE against one fails with a
    -- message about the wrong thing. Every target was an ordinary table when
    -- this was written; that is a fact about a schema snapshot, not a promise
    -- about the database you are running against.
    ELSIF NOT EXISTS (
      SELECT 1 FROM pg_class pcl
      JOIN pg_namespace pn ON pn.oid = pcl.relnamespace
      WHERE pn.nspname = 'public' AND pcl.relname = c.tbl AND pcl.relkind = 'r'
    ) THEN
      notTable := notTable || c.tbl;
    END IF;
  END LOOP;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION
      'ABORTED — % target column(s) do not exist on this database: %. Nothing was changed. Reconcile the names against the LIVE schema before re-running.',
      array_length(missing, 1), array_to_string(missing, ', ');
  END IF;

  IF array_length(notTable, 1) > 0 THEN
    RAISE EXCEPTION
      'ABORTED — these targets are not ordinary tables (a CHECK cannot be added to a view): %. Nothing was changed.',
      array_to_string(notTable, ', ');
  END IF;

  -- ── PASS 2: apply. Every target verified, so this cannot half-finish ──────
  FOR c IN
    SELECT * FROM (VALUES
      ('log_comments','body',2000),('list_comments','content',2000),
      ('dossier_comments','body',2000),('lounge_messages','content',2000),
      ('lounge_messages','reply_to_content',2000),('reports','details',500),
      ('logs','review',5000),('lists','title',100),('lists','description',1000),
      ('lounges','name',60),('lounges','description',1000),
      ('profiles','bio',160),('profiles','display_name',50),('profiles','persona',50),
      ('dispatch_dossiers','title',200),('dispatch_dossiers','excerpt',500),
      ('dispatch_dossiers','full_content',25000),
      ('logs','pull_quote',500),('logs','watched_with',200),
      ('logs','private_notes',1000),('logs','abandoned_reason',500),
      ('logs','film_title',300),('list_items','film_title',300),
      ('list_items','notes',2000),('watchlists','film_title',300),
      ('vaults','film_title',300),('physical_archive','film_title',300),
      ('physical_archive','notes',2000),('video_reviews','film_title',300),
      ('video_reviews','title',300),('profiles','username',100),
      ('reports','reason',100),('reports','content_type',50),
      ('reports','content_id',100)
    ) AS t(tbl, col, cap)
  LOOP
    -- NULL passes deliberately: an absent value is not an oversized one, and
    -- NOT NULL is a separate decision already made per column.
    -- `char_length` counts CHARACTERS. `octet_length` would cap a comment of
    -- emoji at a quarter of its allowance and disagree with every client.
    -- Drop only when it is actually there. `DROP ... IF EXISTS` would emit a
    -- NOTICE for all 34 on a first run and bury the summary line below it —
    -- and the summary is the only thing that tells you this worked.
    IF EXISTS (
      SELECT 1 FROM pg_constraint pc
      JOIN pg_class pcl ON pcl.oid = pc.conrelid
      JOIN pg_namespace pn ON pn.oid = pcl.relnamespace
      WHERE pn.nspname = 'public' AND pcl.relname = c.tbl
        AND pc.conname = c.tbl || '_' || c.col || '_len'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I',
                     c.tbl, c.tbl || '_' || c.col || '_len');
    END IF;
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (char_length(%I) <= %s)',
                   c.tbl, c.tbl || '_' || c.col || '_len', c.col, c.cap);
    applied := applied + 1;
  END LOOP;

  RAISE NOTICE 'OK — % length ceilings applied and validated.', applied;
END $$;

-- ============================================================================
-- VERIFY (read-only) — expect 34 rows, every one validated = t
-- ============================================================================
--   SELECT pcl.relname AS table_name, pc.conname AS constraint_name,
--          pc.convalidated AS validated, pg_get_constraintdef(pc.oid) AS definition
--     FROM pg_constraint pc
--     JOIN pg_class pcl ON pcl.oid = pc.conrelid
--     JOIN pg_namespace pn ON pn.oid = pcl.relnamespace
--    WHERE pn.nspname = 'public' AND pc.conname LIKE '%\_len'
--    ORDER BY 1, 2;
--
-- Behaviour worth confirming by hand:
--   • oversized is refused        -> expect 23514 check_violation
--     INSERT INTO public.log_comments (log_id, user_id, username, body)
--     VALUES (gen_random_uuid(), gen_random_uuid(), 'x', repeat('a', 2001));
--   • an EMPTY lounge message still inserts (film shares carry no text, and
--     withdrawing a message blanks it) -> expect success
--     INSERT INTO public.lounge_messages (lounge_id, user_id, content)
--     VALUES (gen_random_uuid(), gen_random_uuid(), '');
-- ============================================================================
