-- ════════════════════════════════════════════════════════════════════════════
-- BATCH 32 — remove duplicated policies, restore three lost indexes
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Part 1: five duplicated RLS policies ───────────────────────────────────
-- Five tables carry two policies that grant the same thing. Permissive policies
-- are OR'd, so behaviour is identical either way — but every row check evaluates
-- both, and a reader has to work out whether the pair differs. One is even
-- misnamed: "Users insert their own error logs." is a SELECT policy.
--
-- ⚠️ WHICH ONE IS DROPPED MATTERS, and only for the first pair.
-- `dossier_comments` has "Dossier comments viewable by everyone" granted to
-- PUBLIC and "public_read_dossier_comments" granted only to `authenticated`.
-- They are NOT interchangeable: authenticated is a subset of PUBLIC, so dropping
-- the narrower one changes nothing, while dropping the PUBLIC one would remove
-- anonymous read access to every dossier comment. Verified against pg_policy
-- roles rather than assumed from the names.
--
-- The other four pairs are PUBLIC on both sides with identical qual and check,
-- so either could go; the clearer name is kept in each case.
--
-- ── Part 2: three indexes lost to renaming ─────────────────────────────────
-- Old migrations created these under one name; later migrations recreated
-- neighbouring indexes under a new convention and these were never carried over.
-- Confirmed absent by comparing every index name any migration claims to create
-- against pg_indexes, then checking whether the column still had coverage from
-- any other index. These three had none, and all three are queried:
--
--     logs.watched_date          7 order() calls plus gte/lte range filters
--     physical_archive.film_id   30 eq() filters — the physical media feature
--     notifications.is_read      2 eq() filters
--
-- Small tables today, so no measurable gain right now. Batch 30 proved this
-- class matters at scale, and an index is far cheaper to add now than to
-- diagnose later.
--
-- Every statement is guarded and the whole file is convergent: dropping an
-- already-dropped policy and creating an already-created index are both no-ops,
-- so a second run reports the same result.
-- ════════════════════════════════════════════════════════════════════════════

DO $b32$
DECLARE
  p            record;
  n_dropped    int := 0;
  n_created    int := 0;
  before_anon  text;
  after_anon   text;
  before_auth  text;
  after_auth   text;
BEGIN
  SET LOCAL lock_timeout = '5s';
  SET LOCAL statement_timeout = '120s';

  -- Baseline: the SET of (table, command) pairs each client role can reach.
  --
  -- Not a count of policies. A count is a proxy, and it was wrong: the first
  -- version asserted after = before - 5, which aborted with 83 -> 79 because
  -- one of the five (public_read_dossier_comments) is granted to `authenticated`
  -- only and was never in the anon set at all. The count was miscalculated; the
  -- drop was safe. Comparing the reachable SET tests the property that actually
  -- matters — nobody gains or loses access — and cannot be thrown off by which
  -- role a redundant policy happened to name.
  SELECT string_agg(DISTINCT c2.relname || ':' || p2.polcmd::text, ',' ORDER BY c2.relname || ':' || p2.polcmd::text)
    INTO before_anon
  FROM pg_policy p2
  JOIN pg_class c2 ON c2.oid = p2.polrelid
  JOIN pg_namespace n2 ON n2.oid = c2.relnamespace AND n2.nspname = 'public'
  WHERE p2.polpermissive AND (p2.polroles = '{0}'::oid[] OR 'anon'::regrole = ANY (p2.polroles));

  SELECT string_agg(DISTINCT c2.relname || ':' || p2.polcmd::text, ',' ORDER BY c2.relname || ':' || p2.polcmd::text)
    INTO before_auth
  FROM pg_policy p2
  JOIN pg_class c2 ON c2.oid = p2.polrelid
  JOIN pg_namespace n2 ON n2.oid = c2.relnamespace AND n2.nspname = 'public'
  WHERE p2.polpermissive AND (p2.polroles = '{0}'::oid[] OR 'authenticated'::regrole = ANY (p2.polroles));

  -- ── Part 1 ───────────────────────────────────────────────────────────────
  FOR p IN
    SELECT * FROM (VALUES
      ('dossier_comments', 'public_read_dossier_comments'),          -- narrower of the pair
      ('error_logs',       'Users insert their own error logs.'),    -- misnamed; a SELECT twin
      ('log_comments',     'Authenticated users can insert'),        -- twin of "Users can insert log comments."
      ('notifications',    'Users can view their notifications'),    -- twin of "...view own..."
      ('notifications',    'Users can update their notifications (mark read)')
    ) AS t(tbl, pol)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policy pp
      JOIN pg_class cc ON cc.oid = pp.polrelid
      JOIN pg_namespace nn ON nn.oid = cc.relnamespace AND nn.nspname = 'public'
      WHERE cc.relname = p.tbl AND pp.polname = p.pol
    ) THEN
      EXECUTE format('DROP POLICY %I ON public.%I', p.pol, p.tbl);
      n_dropped := n_dropped + 1;
    END IF;
  END LOOP;

  -- ── Part 2 ───────────────────────────────────────────────────────────────
  IF to_regclass('public.idx_logs_watched_date') IS NULL THEN
    CREATE INDEX idx_logs_watched_date ON public.logs USING btree (watched_date DESC);
    n_created := n_created + 1;
  END IF;

  IF to_regclass('public.idx_physical_archive_film_id') IS NULL THEN
    CREATE INDEX idx_physical_archive_film_id ON public.physical_archive USING btree (film_id);
    n_created := n_created + 1;
  END IF;

  IF to_regclass('public.idx_notifications_is_read') IS NULL THEN
    -- Partial: the app only ever asks for unread. Indexing the read ones would
    -- be dead weight that grows forever.
    CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (user_id)
      WHERE is_read = false;
    n_created := n_created + 1;
  END IF;

  -- ── Guards ───────────────────────────────────────────────────────────────
  SELECT string_agg(DISTINCT c2.relname || ':' || p2.polcmd::text, ',' ORDER BY c2.relname || ':' || p2.polcmd::text)
    INTO after_anon
  FROM pg_policy p2
  JOIN pg_class c2 ON c2.oid = p2.polrelid
  JOIN pg_namespace n2 ON n2.oid = c2.relnamespace AND n2.nspname = 'public'
  WHERE p2.polpermissive AND (p2.polroles = '{0}'::oid[] OR 'anon'::regrole = ANY (p2.polroles));

  SELECT string_agg(DISTINCT c2.relname || ':' || p2.polcmd::text, ',' ORDER BY c2.relname || ':' || p2.polcmd::text)
    INTO after_auth
  FROM pg_policy p2
  JOIN pg_class c2 ON c2.oid = p2.polrelid
  JOIN pg_namespace n2 ON n2.oid = c2.relnamespace AND n2.nspname = 'public'
  WHERE p2.polpermissive AND (p2.polroles = '{0}'::oid[] OR 'authenticated'::regrole = ANY (p2.polroles));

  IF after_anon IS DISTINCT FROM before_anon THEN
    RAISE EXCEPTION
      'ABORTED — the set of table/command pairs anon can reach changed. Nothing was applied.';
  END IF;
  IF after_auth IS DISTINCT FROM before_auth THEN
    RAISE EXCEPTION
      'ABORTED — the set of table/command pairs authenticated members can reach changed. Nothing was applied.';
  END IF;

  -- Every table that had a duplicate must still have a surviving policy for that
  -- command. Dropping the last one would silently deny everybody.
  IF NOT EXISTS (SELECT 1 FROM pg_policy pp JOIN pg_class cc ON cc.oid=pp.polrelid
                 WHERE cc.relname='dossier_comments' AND pp.polcmd='r' AND pp.polpermissive) THEN
    RAISE EXCEPTION 'ABORTED — dossier_comments has no permissive SELECT policy left. Nothing was applied.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy pp JOIN pg_class cc ON cc.oid=pp.polrelid
                 WHERE cc.relname='notifications' AND pp.polcmd='r' AND pp.polpermissive) THEN
    RAISE EXCEPTION 'ABORTED — notifications has no permissive SELECT policy left. Nothing was applied.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy pp JOIN pg_class cc ON cc.oid=pp.polrelid
                 WHERE cc.relname='log_comments' AND pp.polcmd='a' AND pp.polpermissive) THEN
    RAISE EXCEPTION 'ABORTED — log_comments has no permissive INSERT policy left. Nothing was applied.';
  END IF;

  RAISE NOTICE
    'OK — % duplicate policy(ies) dropped, % index(es) created. Reachable table/command pairs unchanged for both anon and authenticated.',
    n_dropped, n_created;
END
$b32$;

NOTIFY pgrst, 'reload schema';
