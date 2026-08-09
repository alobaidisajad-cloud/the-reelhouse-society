-- ============================================================================
-- BATCH 27 · follow-up — the remaining text columns
-- ============================================================================
--
-- 20260809_04 capped the 34 columns a member types into. This closes the rest.
--
-- State before this file, counted from the schema rather than guessed:
--   119 scalar text columns · 34 capped · 6 already carry an enum whitelist
--   (role, social_visibility, notifications.type, user_blocks.type,
--   mod_actions.action, user_reports.status) · 79 open · 3 are text[] ARRAYS.
--
-- ── WHY THESE ARE NOW SAFE TO CAP AT ALL ────────────────────────────────────
-- 20260809_04 deliberately left server-DERIVED columns alone, because a CHECK
-- that fires inside a trigger aborts the member's action with it.
--
-- That is no longer the risk it was, BECAUSE of what that file did.
-- `notifications.message` is assembled by a trigger, but every value it
-- interpolates is now bounded:
--     'added a critique to your log of ' (32) + logs.film_title      (300) = 332
--     'certified your dossier "'         (24) + dossier title        (200) = 226
--     '@u reacted :emoji: to your log of'(26) + film_title + username(400) = 436
-- The longest notification the server can build is ~436. A ceiling of 1000
-- cannot fire. Bounding the sources is what made the derived column safe.
--
-- ── WHERE A REJECTION WOULD STILL COST SOMETHING ────────────────────────────
-- `error_logs` is live (834 rows) and a refused insert there loses a bug
-- report — you go blind, quietly. Its ceilings are deliberately generous:
-- `component` measured EXACTLY 2000 against a writer that slices to 500, so a
-- path exists that this repo does not show. Generosity costs nothing here.
-- Moderator free text (ban_reason, resolution_notes, warnings.reason) is 2000
-- for the same reason: a rejection blocks a moderation action.
--
-- ── MEASURED, NOT ASSUMED ───────────────────────────────────────────────────
-- Every one of the 36 columns that currently holds data was measured live and
-- fits. The first draft would have FAILED: error_logs.component is 2000 and had
-- been assigned 1000.
--
-- Upper bound only, char_length (characters, not bytes), fails loudly on a
-- missing column or a view, refuses to wait for a lock, convergent on re-run.
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
      -- copy of profiles.username (ceiling 100)
      ('dispatch_dossiers','author_username',100),
      ('dossier_comments','username',100),
      ('log_comments','username',100),
      ('lounge_messages','reply_to_username',100),
      ('notifications','from_username',100),
      ('tips','from_username',100),
      ('video_reviews','username',100),
      -- RFC 5321 max address: 64 local + @ + 255 domain
      ('profiles','email',320),
      ('venues','email',320),
      ('waitlist','email',320),
      -- server-built; longest possible now 332 because the sources are capped
      ('notifications','message',1000),
      -- URL / asset — practical URL max
      ('list_items','poster_path',2048),
      ('logs','alt_poster',2048),
      ('logs','editorial_header',2048),
      ('logs','poster_path',2048),
      ('logs','video_url',2048),
      ('lounges','cover_image',2048),
      ('physical_archive','poster_path',2048),
      ('profiles','avatar_url',2048),
      ('vaults','poster_path',2048),
      ('venues','instagram',2048),
      ('venues','logo_url',2048),
      ('venues','website',2048),
      ('video_reviews','avatar',2048),
      ('video_reviews','film_poster',2048),
      ('video_reviews','thumbnail_url',2048),
      ('video_reviews','video_url',2048),
      ('watchlists','poster_path',2048),
      -- push endpoint URL
      ('push_subscriptions','endpoint',2048),
      -- encoded payload
      ('tickets','qr_code',2048),
      -- device tokens ~200 max
      ('push_subscriptions','auth',512),
      ('push_subscriptions','p256dh',512),
      ('push_tokens','token',512),
      -- error_logs — a rejected write loses diagnostics; generous by design
      ('error_logs','component',4000),
      ('error_logs','error_message',4000),
      ('error_logs','error_stack',20000),
      ('error_logs','url',4096),
      ('error_logs','user_agent',1000),
      -- moderator free text — generous so an action can never be blocked
      ('mod_actions','reason',2000),
      ('profiles','ban_reason',2000),
      ('profiles','suspension_reason',2000),
      ('reports','resolution_notes',2000),
      ('user_reports','reason',2000),
      ('warnings','reason',2000),
      -- server-written note
      ('tips','message',2000),
      -- short code
      ('interactions','type',100),
      ('logs','format',100),
      ('logs','physical_media',100),
      ('logs','status',100),
      ('lounge_messages','type',100),
      ('physical_archive','condition',100),
      ('profiles','tier',100),
      ('push_tokens','platform',100),
      ('reports','resolution',100),
      ('reports','resolution_action',100),
      ('reports','status',100),
      ('showtimes','screen_name',100),
      ('tickets','screen_name',100),
      ('tickets','seat',100),
      ('tickets','ticket_type',100),
      ('vaults','format',100),
      ('waitlist','tier',100),
      -- a uuid is 36
      ('cinema_reviews','cinema_id',100),
      ('tickets','slot_id',100),
      -- a year
      ('logs','year',20),
      -- 8 chars today
      ('lounges','invite_code',50),
      -- a phone number
      ('venues','phone',50),
      -- event key
      ('analytics_events','event_name',200),
      -- matches the film-title ceiling
      ('cinema_reviews','cinema_name',300),
      ('programmes','title',300),
      ('showtimes','film_title',300),
      ('venues','name',300),
      -- free text on secondary tables
      ('cinema_reviews','review',2000),
      ('programmes','description',2000),
      ('venues','address',2000),
      ('venues','bio',2000),
      ('venues','description',2000),
      ('venues','location',2000),
      -- component stack already sliced to 500
      ('error_logs','error_type',1000)
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
      -- copy of profiles.username (ceiling 100)
      ('dispatch_dossiers','author_username',100),
      ('dossier_comments','username',100),
      ('log_comments','username',100),
      ('lounge_messages','reply_to_username',100),
      ('notifications','from_username',100),
      ('tips','from_username',100),
      ('video_reviews','username',100),
      -- RFC 5321 max address: 64 local + @ + 255 domain
      ('profiles','email',320),
      ('venues','email',320),
      ('waitlist','email',320),
      -- server-built; longest possible now 332 because the sources are capped
      ('notifications','message',1000),
      -- URL / asset — practical URL max
      ('list_items','poster_path',2048),
      ('logs','alt_poster',2048),
      ('logs','editorial_header',2048),
      ('logs','poster_path',2048),
      ('logs','video_url',2048),
      ('lounges','cover_image',2048),
      ('physical_archive','poster_path',2048),
      ('profiles','avatar_url',2048),
      ('vaults','poster_path',2048),
      ('venues','instagram',2048),
      ('venues','logo_url',2048),
      ('venues','website',2048),
      ('video_reviews','avatar',2048),
      ('video_reviews','film_poster',2048),
      ('video_reviews','thumbnail_url',2048),
      ('video_reviews','video_url',2048),
      ('watchlists','poster_path',2048),
      -- push endpoint URL
      ('push_subscriptions','endpoint',2048),
      -- encoded payload
      ('tickets','qr_code',2048),
      -- device tokens ~200 max
      ('push_subscriptions','auth',512),
      ('push_subscriptions','p256dh',512),
      ('push_tokens','token',512),
      -- error_logs — a rejected write loses diagnostics; generous by design
      ('error_logs','component',4000),
      ('error_logs','error_message',4000),
      ('error_logs','error_stack',20000),
      ('error_logs','url',4096),
      ('error_logs','user_agent',1000),
      -- moderator free text — generous so an action can never be blocked
      ('mod_actions','reason',2000),
      ('profiles','ban_reason',2000),
      ('profiles','suspension_reason',2000),
      ('reports','resolution_notes',2000),
      ('user_reports','reason',2000),
      ('warnings','reason',2000),
      -- server-written note
      ('tips','message',2000),
      -- short code
      ('interactions','type',100),
      ('logs','format',100),
      ('logs','physical_media',100),
      ('logs','status',100),
      ('lounge_messages','type',100),
      ('physical_archive','condition',100),
      ('profiles','tier',100),
      ('push_tokens','platform',100),
      ('reports','resolution',100),
      ('reports','resolution_action',100),
      ('reports','status',100),
      ('showtimes','screen_name',100),
      ('tickets','screen_name',100),
      ('tickets','seat',100),
      ('tickets','ticket_type',100),
      ('vaults','format',100),
      ('waitlist','tier',100),
      -- a uuid is 36
      ('cinema_reviews','cinema_id',100),
      ('tickets','slot_id',100),
      -- a year
      ('logs','year',20),
      -- 8 chars today
      ('lounges','invite_code',50),
      -- a phone number
      ('venues','phone',50),
      -- event key
      ('analytics_events','event_name',200),
      -- matches the film-title ceiling
      ('cinema_reviews','cinema_name',300),
      ('programmes','title',300),
      ('showtimes','film_title',300),
      ('venues','name',300),
      -- free text on secondary tables
      ('cinema_reviews','review',2000),
      ('programmes','description',2000),
      ('venues','address',2000),
      ('venues','bio',2000),
      ('venues','description',2000),
      ('venues','location',2000),
      -- component stack already sliced to 500
      ('error_logs','error_type',1000)
    ) AS t(tbl, col, cap)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint pc
               JOIN pg_class pcl ON pcl.oid = pc.conrelid
               JOIN pg_namespace pn ON pn.oid = pcl.relnamespace
               WHERE pn.nspname='public' AND pcl.relname=c.tbl
                 AND pc.conname = c.tbl||'_'||c.col||'_len') THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', c.tbl, c.tbl||'_'||c.col||'_len');
    END IF;
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (char_length(%I) <= %s)',
                   c.tbl, c.tbl||'_'||c.col||'_len', c.col, c.cap);
    applied := applied + 1;
  END LOOP;

  -- ── the three text[] columns ──────────────────────────────────────────────
  -- char_length() does not exist for an array; including these above would have
  -- made the whole migration ERROR. An array needs both bounds: how many items,
  -- and how long each item may be.
  --
  -- profiles.following / followers are legacy: neither app nor any server
  -- function writes them (following_count and a separate follows table replaced
  -- them). But the profiles UPDATE policy is USING (auth.uid() = id) with no
  -- column restriction, so a member CAN stuff their own row with megabytes.
  -- Bounds are absurdly generous on purpose — this is an abuse fence on a dead
  -- column, not a feature limit.
  -- PostgreSQL FORBIDS a subquery inside a CHECK — "cannot use subquery in check
  -- constraint" — so the obvious per-element form
  --     (SELECT MAX(char_length(e)) FROM unnest(formats) e) <= 100
  -- is rejected outright. Caught only by running this against the real schema.
  --
  -- `array_to_string` is immutable and needs no subquery, and bounding the JOINED
  -- content is the better guard anyway: it caps the total no matter how the abuse
  -- is split between "many items" and "one enormous item".
  FOR c IN
    SELECT * FROM (VALUES
      ('physical_archive', 'formats',     50,   5000),
      ('profiles',         'following', 5000, 500000),
      ('profiles',         'followers', 5000, 500000)
    ) AS t(tbl, col, max_items, max_chars)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint pc
               JOIN pg_class pcl ON pcl.oid = pc.conrelid
               JOIN pg_namespace pn ON pn.oid = pcl.relnamespace
               WHERE pn.nspname='public' AND pcl.relname=c.tbl
                 AND pc.conname = c.tbl||'_'||c.col||'_len') THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', c.tbl, c.tbl||'_'||c.col||'_len');
    END IF;
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK '
      || '(COALESCE(array_length(%I,1),0) <= %s AND char_length(array_to_string(%I, '','')) <= %s)',
      c.tbl, c.tbl||'_'||c.col||'_len', c.col, c.max_items, c.col, c.max_chars);
    applied := applied + 1;
  END LOOP;

  RAISE NOTICE 'OK — % ceilings applied and validated.', applied;
END $$;
