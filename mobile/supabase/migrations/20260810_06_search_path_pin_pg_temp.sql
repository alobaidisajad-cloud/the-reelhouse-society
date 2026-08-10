-- ════════════════════════════════════════════════════════════════════════════
-- BATCH 29 · PART 2 — make the search_path pin actually work
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT WAS WRONG: 77 functions carried `SET search_path = public`. That pin is
-- VACUOUS. PostgreSQL searches pg_temp FIRST — before pg_catalog — for relation
-- names whenever pg_temp is not named explicitly in search_path. Listing it last
-- is the only way to demote it.
--
-- PROVEN ON PRODUCTION 2026-08-10, rolled back:
--   CREATE FUNCTION f() ... SECURITY DEFINER SET search_path = public
--     AS $$ SELECT v FROM probe LIMIT 1 $$;     -- means public.probe
--   CREATE TEMP TABLE probe(v text);            -- the decoy
--   search_path = public          -> "*** HIJACKED by temp table ***"
--   search_path = public, pg_temp -> "REAL public table"
-- And both anon and authenticated hold TEMP privilege on this database.
--
-- HONEST SEVERITY: not remotely exploitable today. Planting the decoy needs a
-- raw SQL connection, and PostgREST issues no arbitrary SQL. This is
-- defence-in-depth. It matters because of WHAT carries the vacuous pin: all nine
-- functions RLS itself calls — can_view_user_data (privacy), is_user_not_banned
-- (bans), is_hidden_by (blocks), has_tier_at_least (paid tiers) and
-- rate_limit_check (spam) — plus resolve_moderation_report_v2, which reads
-- twelve tables by short name. rate_limit_check is the sharpest case: it builds
-- its query as text (`EXECUTE format(... FROM %I ...)`), so a decoy named after
-- the counted table makes it count zero and the rate limit disappears.
--
-- 22 of these functions read a public table by short name and are therefore
-- genuinely hijackable; the rest touch no table and are hardened for hygiene, so
-- that no exceptions list exists for a future reader to misjudge.
--
-- ── WHY THIS CANNOT CHANGE APP BEHAVIOUR (each swept across all 107, live) ──
--  1. No function creates or reads a TEMP table → demoting pg_temp changes
--     nothing legitimate.
--  2. No function calls an `extensions` function by short name (crypt, digest,
--     uuid_generate_v4 …). This is the classic way this fix breaks a database:
--     the cluster default search_path is `"$user", public, extensions`, so
--     pinning to `public` alone would break such a call. None exist.
--  3. Every non-public reference is already schema-qualified — auth.uid(),
--     auth.users, net.http_post (push).
--  4. Built-ins (jsonb_agg, GREATEST, unnest …) live in pg_catalog, which is
--     searched regardless of search_path.
--  5. No SQL-standard (BEGIN ATOMIC) bodies, so the sweeps read every body.
--  6. No function resolves a sequence or type by short name.
--  7. All 107 are owned by `postgres`; none belongs to an extension (pg_net
--     lives in its own `net` schema despite reporting `public`).
--  8. The `ensure_rls` event trigger fires only on CREATE TABLE, so ALTER
--     FUNCTION passes through it untouched — verified by running one.
--  9. Push proven end to end: tg_notify_push altered, then FIRED — the trigger
--     ran and queued an http request (net.http_request_queue 0 → 1), no error.
-- 10. Revoking EXECUTE does not stop a trigger firing (privilege is checked when
--     the trigger is created) — verified; unrelated to this file but it is why
--     part 1's REVOKE is safe.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r          record;
  n_public   int := 0;
  n_catalog  int := 0;
  n_left     int;
BEGIN
  SET LOCAL lock_timeout = '5s';
  SET LOCAL statement_timeout = '120s';

  FOR r IN
    SELECT p.oid::regprocedure AS sig,
           (SELECT cfg FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search_path=%') AS sp
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
  LOOP
    -- COALESCE is not decoration. proconfig is NULL for an unpinned function, and
    -- `NULL NOT LIKE '%pg_temp%'` is NULL, which a WHERE clause silently drops.
    -- That exact mistake made an audit query of mine discard all 25 unpinned
    -- functions and report 13 hijackable instead of 22.
    CONTINUE WHEN COALESCE(r.sp LIKE '%pg_temp%', false);

    IF COALESCE(r.sp LIKE 'search_path=pg_catalog%', false) THEN
      -- The ensure_rls event-trigger function. It is deliberately based on
      -- pg_catalog, not public; keep that base and only append the demotion.
      EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, pg_temp', r.sig);
      n_catalog := n_catalog + 1;
    ELSE
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
      n_public := n_public + 1;
    END IF;
  END LOOP;

  -- Fail loud rather than report a number nobody checked.
  SELECT count(*) INTO n_left
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND NOT COALESCE(
          (SELECT cfg FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search_path=%') LIKE '%pg_temp%',
          false);

  IF n_left > 0 THEN
    RAISE EXCEPTION 'ABORTED — % function(s) in public still have no pg_temp demotion.', n_left;
  END IF;

  RAISE NOTICE 'OK — % pinned to (public, pg_temp), % to (pg_catalog, pg_temp). Every function in public is now protected.',
    n_public, n_catalog;
END $$;
