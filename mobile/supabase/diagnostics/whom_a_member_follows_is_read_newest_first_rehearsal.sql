-- ════════════════════════════════════════════════════════════════════════════
-- whom_a_member_follows_is_read_newest_first_rehearsal.sql — 20261120_05. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs whom_a_member_follows_is_read_newest_first_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction, so the train builds 20261120_05
-- alone, in its turn, and this checks it holds: the index is there and whole, and read through.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- ── H-A2's index rehearsal · whom a member follows is indexed newest first (review round 14) ──
-- Run inside its own rehearsal transaction, after rehearsal_kit.sql (an index built CONCURRENTLY is
-- built alone, by the train, before this). The index is there and whole, and it is the followers'
-- index turned round: the same kind over the same follows, by the member who follows. Which index a
-- plan reads is the house's size's to decide (a house of a few hundred follows is read whole faster);
-- on the load house a member of 2,025 follows had their page sorted from every follow (41 ms), and
-- with this index it is read in its order.
SELECT pg_temp.rh_case('the index of whom each member follows is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.interactions_following_newest')), 'missing')) AS done \gset rh_
SELECT pg_temp.rh_case('it is the followers'' index turned round: the same kind over the same follows',
  replace(replace(pg_get_indexdef('public.interactions_followers_newest'::regclass), 'interactions_followers_newest', 'X'), '(target_user_id, created_at DESC, user_id DESC)', '(user_id, created_at DESC, target_user_id DESC)'),
  replace(pg_get_indexdef('public.interactions_following_newest'::regclass), 'interactions_following_newest', 'X')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
