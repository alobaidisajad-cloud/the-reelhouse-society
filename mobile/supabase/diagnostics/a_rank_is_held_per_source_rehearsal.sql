-- ════════════════════════════════════════════════════════════════════════════
-- a_rank_is_held_per_source_rehearsal.sql — 20261003_08. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -v with_fix=1 -f mobile/supabase/diagnostics/a_rank_is_held_per_source_rehearsal.sql
--
-- Four members, made plain inside the transaction (no rank, no seat, no
-- source), each given ranks the way the store, the web and the house give them
-- (grant_entitlement, as the functions call it). Without with_fix the house is
-- as it is: a store subscription that ends takes a hand-given rank with it.
-- Read each NOTICE as  case|expected|got ; the last line counts the misses.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;

CREATE TEMP TABLE rk_m ON COMMIT DROP AS
SELECT id, row_number() OVER (ORDER BY created_at) AS n FROM public.profiles
 WHERE role IS DISTINCT FROM 'admin' AND NOT coalesce(is_founding, false)
 ORDER BY created_at LIMIT 4;
CREATE TEMP TABLE rk_before ON COMMIT DROP AS
SELECT count(*) AS ranked FROM public.profiles
 WHERE GREATEST(public.tier_weight(tier), public.tier_weight(role)) >= 1 AND id NOT IN (SELECT id FROM rk_m);
CREATE TEMP TABLE rk_misses (label text) ON COMMIT DROP;
GRANT ALL ON rk_misses TO authenticated;

\if :{?with_fix}
\ir ../../../supabase/migrations/20261003_08_a_rank_is_held_per_source.sql
\endif
CREATE FUNCTION pg_temp.m(k int) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM rk_m WHERE n = k $$;
UPDATE public.profiles SET tier = 'cinephile', role = 'cinephile', entitlement_source = NULL, is_founding = false
 WHERE id IN (SELECT id FROM rk_m);
DO $$ BEGIN
  DELETE FROM public.rank_grants WHERE user_id IN (SELECT id FROM rk_m);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

CREATE FUNCTION pg_temp.rk(label text, expected text, got text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '%|%|%', label, expected, got;
  IF got IS DISTINCT FROM expected THEN INSERT INTO rk_misses VALUES (label); END IF;
END $$;
CREATE FUNCTION pg_temp.held(u uuid) RETURNS text LANGUAGE sql AS $$
  SELECT tier || '/' || role || '/' || coalesce(entitlement_source, '-') FROM public.profiles WHERE id = u $$;
CREATE FUNCTION pg_temp.give(u uuid, t text, s text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r record; BEGIN
  SELECT * INTO r FROM public.grant_entitlement(u, t, s);
  RETURN r.out_applied::text;
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.rk(text, text, text), pg_temp.m(int) TO authenticated, anon;
GRANT SELECT ON rk_m TO authenticated, anon;
GRANT ALL ON rk_misses TO anon;

-- ── 1 · a rank given by hand outlives a store subscription ──────────────────
DO $$ BEGIN
  PERFORM pg_temp.give(pg_temp.m(1), 'archivist', 'manual');
  PERFORM pg_temp.rk('given the Archivist by hand', 'archivist/archivist/manual', pg_temp.held(pg_temp.m(1)));
  PERFORM pg_temp.give(pg_temp.m(1), 'auteur', 'revenuecat');
  PERFORM pg_temp.rk('then buys the Auteur in the store', 'auteur/auteur/revenuecat', pg_temp.held(pg_temp.m(1)));
  PERFORM pg_temp.give(pg_temp.m(1), 'cinephile', 'revenuecat');
  PERFORM pg_temp.rk('the subscription ends: the hand-given rank stands', 'archivist/archivist/manual', pg_temp.held(pg_temp.m(1)));
  PERFORM pg_temp.give(pg_temp.m(1), 'cinephile', 'manual');
  PERFORM pg_temp.rk('the house takes its own rank back', 'cinephile/cinephile/manual', pg_temp.held(pg_temp.m(1)));
END $$;

-- ── 2 · the web and the store, each its own ─────────────────────────────────
DO $$ BEGIN
  PERFORM pg_temp.give(pg_temp.m(2), 'archivist', 'paytabs');
  PERFORM pg_temp.give(pg_temp.m(2), 'auteur', 'revenuecat');
  PERFORM pg_temp.give(pg_temp.m(2), 'cinephile', 'revenuecat');
  PERFORM pg_temp.rk('a web Archivist whose store Auteur ends is an Archivist', 'archivist/archivist/paytabs', pg_temp.held(pg_temp.m(2)));
  PERFORM pg_temp.rk('a source lowering what it never gave changes nothing', 'false', pg_temp.give(pg_temp.m(2), 'cinephile', 'revenuecat'));
END $$;

-- ── 3 · a lapse is remembered; relinquishing nothing is nothing ─────────────
DO $$ BEGIN
  PERFORM pg_temp.give(pg_temp.m(3), 'archivist', 'revenuecat');
  PERFORM pg_temp.give(pg_temp.m(3), 'cinephile', 'revenuecat');
  PERFORM pg_temp.rk('a store rank that ends leaves a lapsed member', 'cinephile/cinephile/revenuecat', pg_temp.held(pg_temp.m(3)));
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', pg_temp.m(4), 'role', 'authenticated')::text, true) IS NULL AS f;
DO $$ DECLARE got text; BEGIN
  BEGIN SELECT out_applied::text INTO got FROM public.relinquish_rank();
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  PERFORM pg_temp.rk('a member the store never ranked relinquishes nothing', 'false', got);
  BEGIN PERFORM count(*) FROM public.rank_grants; got := 'read';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  PERFORM pg_temp.rk('a member cannot read the grants', '42501', got);
END $$;
RESET ROLE;
-- member 3 lapsed (above): they are told so, and only about themselves.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', pg_temp.m(3), 'role', 'authenticated')::text, true) IS NULL AS f;
DO $$ DECLARE got text; BEGIN
  BEGIN SELECT public.my_entitlement_source() INTO got;
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  PERFORM pg_temp.rk('a lapsed member is told who last ranked them', 'revenuecat', got);
  BEGIN SELECT entitlement_source INTO got FROM public.profiles WHERE id = pg_temp.m(3); got := 'read';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  PERFORM pg_temp.rk('nobody reads the column itself', '42501', got);
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true) IS NULL AS f;
DO $$ DECLARE got text; BEGIN
  BEGIN PERFORM public.my_entitlement_source(); got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  PERFORM pg_temp.rk('a visitor is not asked', '42501', got);
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) IS NULL AS f;

-- ── 4 · a founding seat holds the Auteur; an admin stays an admin ───────────
DO $$ BEGIN
  PERFORM public.claim_founding_seat(pg_temp.m(4));
  PERFORM pg_temp.give(pg_temp.m(4), 'founding', 'revenuecat');
  PERFORM pg_temp.give(pg_temp.m(4), 'cinephile', 'revenuecat');
  PERFORM pg_temp.rk('a founder whose store record empties keeps the Auteur', 'auteur/auteur/revenuecat', pg_temp.held(pg_temp.m(4)));
  UPDATE public.profiles SET role = 'admin' WHERE id = pg_temp.m(3);
  PERFORM pg_temp.give(pg_temp.m(3), 'auteur', 'manual');
  PERFORM pg_temp.rk('an admin given a rank is still an admin', 'auteur/admin/manual', pg_temp.held(pg_temp.m(3)));
END $$;

-- ── 5 · the old door is shut ────────────────────────────────────────────────
DO $$ BEGIN
  PERFORM pg_temp.rk('the legacy source is refused', '22023', pg_temp.give(pg_temp.m(1), 'archivist', 'legacy'));
  PERFORM pg_temp.rk('apply_entitlement is gone', 'false',
    EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'apply_entitlement' AND pronamespace = 'public'::regnamespace)::text);
END $$;

-- ── 6 · every rank held before is recorded under its source ─────────────────
DO $$ BEGIN
  PERFORM pg_temp.rk('every rank held before the fix has a grant',
    (SELECT ranked::text FROM rk_before),
    (SELECT count(DISTINCT user_id)::text FROM public.rank_grants WHERE user_id NOT IN (SELECT id FROM rk_m))
      || '' );
EXCEPTION WHEN undefined_table THEN
  PERFORM pg_temp.rk('every rank held before the fix has a grant', (SELECT ranked::text FROM rk_before), 'no table');
END $$;

DO $$ BEGIN RAISE NOTICE 'FAILED: %', (SELECT count(*) FROM rk_misses); END $$;
ROLLBACK;
