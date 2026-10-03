-- ════════════════════════════════════════════════════════════════════════════
-- a_refunded_seat_returns_rehearsal.sql — 20261003_09. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -v with_fix=1 -f mobile/supabase/diagnostics/a_refunded_seat_returns_rehearsal.sql
--
-- Four members, made plain inside the transaction, are seated the way the house
-- seats them (claim_founding_seat, then grant_entitlement, as storeRecord.ts
-- does). Without with_fix a refunded seat is never given back.
-- Read each NOTICE as  case|expected|got ; the last line counts the misses.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;

CREATE TEMP TABLE rs_m ON COMMIT DROP AS
SELECT id, row_number() OVER (ORDER BY created_at) AS n FROM public.profiles
 WHERE role IS DISTINCT FROM 'admin' AND NOT coalesce(is_founding, false)
 ORDER BY created_at LIMIT 4;
CREATE TEMP TABLE rs_misses (label text) ON COMMIT DROP;
GRANT ALL ON rs_misses TO authenticated;
GRANT SELECT ON rs_m TO authenticated;

\if :{?with_fix}
\ir ../../../supabase/migrations/20261003_09_a_refunded_seat_returns_to_the_hundred.sql
\endif

CREATE FUNCTION pg_temp.m(k int) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM rs_m WHERE n = k $$;
CREATE FUNCTION pg_temp.rs(label text, expected text, got text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '%|%|%', label, expected, got;
  IF got IS DISTINCT FROM expected THEN INSERT INTO rs_misses VALUES (label); END IF;
END $$;
CREATE FUNCTION pg_temp.seat(u uuid) RETURNS text LANGUAGE sql AS $$
  SELECT tier || '/' || CASE WHEN is_founding THEN 'seated' ELSE 'no seat' END FROM public.profiles WHERE id = u $$;
CREATE FUNCTION pg_temp.seats() RETURNS int LANGUAGE sql AS $$ SELECT seats_claimed FROM public.founding_seat_counter WHERE id = 1 $$;
GRANT EXECUTE ON FUNCTION pg_temp.m(int), pg_temp.rs(text, text, text), pg_temp.seat(uuid) TO authenticated;

UPDATE public.profiles SET tier = 'cinephile', role = 'cinephile', entitlement_source = NULL, is_founding = false
 WHERE id IN (SELECT id FROM rs_m);
DELETE FROM public.rank_grants WHERE user_id IN (SELECT id FROM rs_m);
UPDATE public.founding_seat_counter SET seats_claimed = 10 WHERE id = 1;

-- ── 1 · bought in the store, then refunded ──────────────────────────────────
DO $$ BEGIN
  PERFORM public.claim_founding_seat(pg_temp.m(1));
  PERFORM public.grant_entitlement(pg_temp.m(1), 'founding', 'revenuecat');
  PERFORM pg_temp.rs('a seat bought in the store is held', 'auteur/seated', pg_temp.seat(pg_temp.m(1)));
  PERFORM pg_temp.rs('and counted', '11', pg_temp.seats()::text);
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', pg_temp.m(1), 'role', 'authenticated')::text, true) IS NULL AS f;
DO $$ DECLARE got text; BEGIN
  SELECT out_applied::text INTO got FROM public.relinquish_rank();
  PERFORM pg_temp.rs('the app saying "the store holds nothing" never ends a seat', 'false', got);
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) IS NULL AS f;
DO $$ BEGIN
  PERFORM pg_temp.rs('so the seat is still held', 'auteur/seated', pg_temp.seat(pg_temp.m(1)));
  PERFORM public.grant_entitlement(pg_temp.m(1), 'cinephile', 'revenuecat');
  PERFORM pg_temp.rs('the store''s record refunded: the seat is given back', 'cinephile/no seat', pg_temp.seat(pg_temp.m(1)));
  PERFORM pg_temp.rs('and the hundred has it again', '10', pg_temp.seats()::text);
END $$;

-- ── 2 · a seat given by hand is the house's ─────────────────────────────────
DO $$ BEGIN
  PERFORM public.claim_founding_seat(pg_temp.m(2));
  PERFORM public.grant_entitlement(pg_temp.m(2), 'founding', 'manual');
  PERFORM public.grant_entitlement(pg_temp.m(2), 'auteur', 'revenuecat');
  PERFORM public.grant_entitlement(pg_temp.m(2), 'cinephile', 'revenuecat');
  PERFORM pg_temp.rs('a store subscription ending never takes a seat given by hand', 'auteur/seated', pg_temp.seat(pg_temp.m(2)));
END $$;

-- ── 3 · bought when the hundred were full ───────────────────────────────────
DO $$ DECLARE before int; BEGIN
  UPDATE public.founding_seat_counter SET seats_claimed = 100 WHERE id = 1;
  PERFORM public.claim_founding_seat(pg_temp.m(3));
  PERFORM public.grant_entitlement(pg_temp.m(3), 'founding', 'revenuecat');
  PERFORM pg_temp.rs('a purchase with the hundred full holds the Auteur, without a seat', 'auteur/no seat', pg_temp.seat(pg_temp.m(3)));
  before := pg_temp.seats();
  PERFORM public.grant_entitlement(pg_temp.m(3), 'cinephile', 'revenuecat');
  PERFORM pg_temp.rs('refunded, it gives back no seat it never had', before::text, pg_temp.seats()::text);
  UPDATE public.founding_seat_counter SET seats_claimed = 10 WHERE id = 1;
END $$;

-- ── 4 · a seat two sources bought ───────────────────────────────────────────
DO $$ BEGIN
  PERFORM public.claim_founding_seat(pg_temp.m(4));
  PERFORM public.grant_entitlement(pg_temp.m(4), 'founding', 'revenuecat');
  PERFORM public.grant_entitlement(pg_temp.m(4), 'founding', 'paytabs');
  PERFORM public.grant_entitlement(pg_temp.m(4), 'cinephile', 'revenuecat');
  PERFORM pg_temp.rs('one refund of two keeps the seat', 'auteur/seated', pg_temp.seat(pg_temp.m(4)));
  PERFORM public.grant_entitlement(pg_temp.m(4), 'cinephile', 'paytabs');
  PERFORM pg_temp.rs('the second gives it back', 'cinephile/no seat', pg_temp.seat(pg_temp.m(4)));
END $$;

-- ── 5 · the counter is the house's ──────────────────────────────────────────
DO $$ BEGIN
  PERFORM pg_temp.rs('visitors and members hold nothing on the seat counter', '0',
    (SELECT count(*)::text FROM information_schema.table_privileges
      WHERE table_schema = 'public' AND table_name = 'founding_seat_counter' AND grantee IN ('anon', 'authenticated')));
END $$;

DO $$ BEGIN RAISE NOTICE 'FAILED: %', (SELECT count(*) FROM rs_misses); END $$;
ROLLBACK;
