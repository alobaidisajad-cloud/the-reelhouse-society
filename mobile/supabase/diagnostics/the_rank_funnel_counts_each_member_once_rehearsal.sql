-- ════════════════════════════════════════════════════════════════════════════
-- the_rank_funnel_counts_each_member_once_rehearsal.sql — 20261120_18. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_rank_funnel_counts_each_member_once_rehearsal.sql --with-train
--
-- The train applies 20261120_18 here (with_train), 20261120_00 to 20261120_17 already applied; a sealed copy already holds it.
-- Then the house and members in good standing, acting as themselves, find what it fixes holding (review round 14).
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

CREATE TEMP TABLE rehearsal_members ON COMMIT DROP AS
  SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS n
    FROM auth.users u JOIN public.profiles p ON p.id = u.id
   WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until <= now())
   ORDER BY u.created_at LIMIT 4;
SELECT pg_temp.rh_need('members in good standing', (SELECT count(*) FROM rehearsal_members), 4) AS done \gset rh_
GRANT SELECT ON rehearsal_members TO anon, authenticated;

-- The piece's own tables, made before the train, empty: the piece fills them as it runs.
CREATE TEMP TABLE ha7_got (k text PRIMARY KEY, v text) ON COMMIT DROP;
GRANT ALL ON ha7_got TO anon, authenticated, service_role;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261120_18_the_rank_funnel_counts_each_member_once.sql
\endif

-- ── H-A7 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.analytics_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.salon_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-A7 rehearsal · the funnel is counted once per member, never by a stranger, a purchase by the house (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest), with its rehearsal_members (n = 1..4). Each counter is read before and
-- after, by the house, on counters only this rehearsal names (features 'rh-a7-…') or by their change.
-- A member's first tap of a rope counts 1, their second the same day nothing, another member's 1; a
-- member naming a rank bought or ended adds nothing; a visitor is refused and counts nothing; a member
-- adds to 100 counters a day and no more; neither table holds a member's id, and members read neither;
-- a new day lets the earlier days' fingerprints go. A rank bought or ended is counted by the house's
-- entitlement writer, as the store's webhook calls it (the service role): a store's grant that rises
-- counts one purchase under its rank, the same grant again (a retried webhook) nothing, a rank given by
-- hand nothing, an upgrade one more, and a store's grant that ends one relinquishment.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.rank_grants WHERE user_id IN (SELECT id FROM rehearsal_members WHERE n IN (1, 2));
CREATE TEMP TABLE ha7_before ON COMMIT DROP AS
  SELECT coalesce(sum(count) FILTER (WHERE event = 'rank_purchased' AND rank = 'archivist'), 0) AS bought_archivist,
         coalesce(sum(count) FILTER (WHERE event = 'rank_purchased' AND rank = 'auteur'), 0) AS bought_auteur,
         coalesce(sum(count) FILTER (WHERE event = 'rank_relinquished'), 0) AS ended
    FROM public.gate_metrics WHERE day = current_date;
CREATE FUNCTION pg_temp.ha7_count(p_event text, p_feature text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(sum(count), 0)::text FROM public.gate_metrics
   WHERE day = current_date AND event = p_event AND feature_id = p_feature
$$;
-- What the funnel says of ranks bought and ended today, less what it said before.
CREATE FUNCTION pg_temp.ha7_ranks() RETURNS text LANGUAGE sql AS $$
  SELECT ((SELECT coalesce(sum(count), 0) FROM public.gate_metrics WHERE day = current_date AND event = 'rank_purchased' AND rank = 'archivist') - b.bought_archivist)
         || '|' || ((SELECT coalesce(sum(count), 0) FROM public.gate_metrics WHERE day = current_date AND event = 'rank_purchased' AND rank = 'auteur') - b.bought_auteur)
         || '|' || ((SELECT coalesce(sum(count), 0) FROM public.gate_metrics WHERE day = current_date AND event = 'rank_relinquished') - b.ended)
    FROM ha7_before b
$$;
GRANT EXECUTE ON FUNCTION pg_temp.ha7_count(text, text), pg_temp.ha7_ranks() TO authenticated, service_role;
GRANT SELECT ON rehearsal_members, ha7_before TO service_role;
GRANT SELECT ON ha7_before TO authenticated;

-- Member 1 taps one rope twice, and names a rank bought and ended from two doors; member 2 taps once.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT public.record_gate_event('gate_tapped', 'rh-a7-door', 'archivist', 'stranger');
SELECT public.record_gate_event('gate_tapped', 'rh-a7-door', 'archivist', 'stranger');
SELECT public.record_gate_event('rank_purchased', 'rh-a7-door', 'archivist', '');
SELECT public.record_gate_event('rank_purchased', 'rh-a7-other-door', 'auteur', '');
SELECT public.record_gate_event('rank_relinquished', '', '', '');
DO $$
BEGIN
  PERFORM 1 FROM public.gate_counted;
  INSERT INTO ha7_got VALUES ('member reads fingerprints', 'read');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO ha7_got VALUES ('member reads fingerprints', 'refused');
END $$;
DO $$
BEGIN
  PERFORM 1 FROM public.gate_day;
  INSERT INTO ha7_got VALUES ('member reads keys', 'read');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO ha7_got VALUES ('member reads keys', 'refused');
END $$;
DO $$
BEGIN
  PERFORM public.a_rank_is_counted('rank_purchased', 'auteur');
  INSERT INTO ha7_got VALUES ('member counts a purchase', 'counted');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO ha7_got VALUES ('member counts a purchase', 'refused');
END $$;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT public.record_gate_event('gate_tapped', 'rh-a7-door', 'archivist', 'stranger');
-- Member 3 meets 120 ropes in one day.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 3), 'role', 'authenticated')::text, true) AS done \gset rh_
DO $$
BEGIN
  FOR g IN 1..120 LOOP
    PERFORM public.record_gate_event('gate_tapped', 'rh-a7-many-' || g, '', '');
  END LOOP;
END $$;
RESET ROLE;
INSERT INTO ha7_got SELECT 'members named ranks', pg_temp.ha7_ranks();

-- A visitor, with the anon key alone.
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true) AS done \gset rh_
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM public.record_gate_event('gate_tapped', 'rh-a7-door', 'auteur', 'guest');
  INSERT INTO ha7_got VALUES ('visitor', 'counted');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO ha7_got VALUES ('visitor', 'refused');
END $$;
RESET ROLE;

-- The store, as its webhook writes a member's rank (the service role).
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true) AS done \gset rh_
SET LOCAL ROLE service_role;
SELECT count(*) FROM public.grant_entitlement((SELECT id FROM rehearsal_members WHERE n = 1), 'archivist', 'revenuecat');
INSERT INTO ha7_got SELECT 'bought', pg_temp.ha7_ranks();
SELECT count(*) FROM public.grant_entitlement((SELECT id FROM rehearsal_members WHERE n = 1), 'archivist', 'revenuecat');
INSERT INTO ha7_got SELECT 'retried', pg_temp.ha7_ranks();
SELECT count(*) FROM public.grant_entitlement((SELECT id FROM rehearsal_members WHERE n = 2), 'auteur', 'manual');
INSERT INTO ha7_got SELECT 'given by hand', pg_temp.ha7_ranks();
SELECT count(*) FROM public.grant_entitlement((SELECT id FROM rehearsal_members WHERE n = 1), 'auteur', 'revenuecat');
INSERT INTO ha7_got SELECT 'upgraded', pg_temp.ha7_ranks();
SELECT count(*) FROM public.grant_entitlement((SELECT id FROM rehearsal_members WHERE n = 1), 'cinephile', 'revenuecat');
INSERT INTO ha7_got SELECT 'ended', pg_temp.ha7_ranks();
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

SELECT pg_temp.rh_case('a member''s tap of a rope counts once a day, a second tap nothing, another member''s once', '2',
  pg_temp.ha7_count('gate_tapped', 'rh-a7-door')) AS done \gset rh_
SELECT pg_temp.rh_case('a member naming a rank bought or ended adds nothing', '0|0|0', (SELECT v FROM ha7_got WHERE k = 'members named ranks')) AS done \gset rh_
SELECT pg_temp.rh_case('nor may a member count a purchase the house''s way', 'refused', (SELECT v FROM ha7_got WHERE k = 'member counts a purchase')) AS done \gset rh_
SELECT pg_temp.rh_case('a visitor is refused', 'refused', (SELECT v FROM ha7_got WHERE k = 'visitor')) AS done \gset rh_
SELECT pg_temp.rh_case('a member adds to 100 counters a day, no more', '100',
  (SELECT coalesce(sum(count), 0)::text FROM public.gate_metrics WHERE day = current_date AND event = 'gate_tapped' AND feature_id LIKE 'rh-a7-many-%')) AS done \gset rh_
SELECT pg_temp.rh_case('a member reads no fingerprint', 'refused', (SELECT v FROM ha7_got WHERE k = 'member reads fingerprints')) AS done \gset rh_
SELECT pg_temp.rh_case('nor the day''s key', 'refused', (SELECT v FROM ha7_got WHERE k = 'member reads keys')) AS done \gset rh_
SELECT pg_temp.rh_case('a store''s grant counts one purchase under its rank', '1|0|0', (SELECT v FROM ha7_got WHERE k = 'bought')) AS done \gset rh_
SELECT pg_temp.rh_case('the same grant again, a retried webhook, counts nothing', '1|0|0', (SELECT v FROM ha7_got WHERE k = 'retried')) AS done \gset rh_
SELECT pg_temp.rh_case('a rank given by hand counts nothing', '1|0|0', (SELECT v FROM ha7_got WHERE k = 'given by hand')) AS done \gset rh_
SELECT pg_temp.rh_case('an upgrade to the Auteur counts one more, under the Auteur', '1|1|0', (SELECT v FROM ha7_got WHERE k = 'upgraded')) AS done \gset rh_
SELECT pg_temp.rh_case('a store''s grant that ends counts one relinquishment', '1|1|1', (SELECT v FROM ha7_got WHERE k = 'ended')) AS done \gset rh_
SELECT pg_temp.rh_case('the fingerprints hold no member''s id, nor its plain hash', '0',
  (SELECT count(*)::text FROM public.gate_counted c, rehearsal_members m
    WHERE position(convert_to(m.id::text, 'UTF8') IN c.who) > 0 OR c.who = sha256(convert_to(m.id::text, 'UTF8'))
       OR c.counter LIKE '%' || m.id::text || '%')) AS done \gset rh_
SELECT pg_temp.rh_case('the tables keep no column of a member', 'counter,day,who',
  (SELECT string_agg(column_name::text, ',' ORDER BY column_name) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gate_counted')) AS done \gset rh_

-- A new day: yesterday's key and fingerprints are let go at the day's first count.
INSERT INTO public.gate_day (day, salt) VALUES (current_date - 1, '\x00'::bytea) ON CONFLICT (day) DO NOTHING;
INSERT INTO public.gate_counted (day, who, counter) VALUES (current_date - 1, '\x00'::bytea, 'rh-a7-yesterday');
DELETE FROM public.gate_counted WHERE day = current_date;
DELETE FROM public.gate_day WHERE day = current_date;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 4), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT public.record_gate_event('gate_tapped', 'rh-a7-door', 'archivist', 'stranger');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT pg_temp.rh_case('a new day lets the earlier days'' keys and fingerprints go', '0',
  ((SELECT count(*) FROM public.gate_day WHERE day < current_date) + (SELECT count(*) FROM public.gate_counted WHERE day < current_date))::text) AS done \gset rh_
SELECT pg_temp.rh_case('and the new day''s first member counts', '3', pg_temp.ha7_count('gate_tapped', 'rh-a7-door')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
