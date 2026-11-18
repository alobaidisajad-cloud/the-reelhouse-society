-- ════════════════════════════════════════════════════════════════════════════
-- the_descriptions_are_found_by_their_pieces_rehearsal.sql — 20261119_06. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_descriptions_are_found_by_their_pieces_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction, so the train builds 20261119_06
-- alone, in its turn, and this checks it holds: the index is there and whole, and read through.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- ── H-D4's index rehearsal · the public stacks' descriptions are indexed by their pieces (review round 13) ──
-- Run inside its own rehearsal transaction, after rehearsal_kit.sql (an index built CONCURRENTLY is
-- built alone, by the train, before this). The index is there and whole, and it is the descriptions'
-- twin of lists_title_trigram: the same kind (trigram GIN) over the same public stacks, so the two
-- read a title-or-description search together. Which of them a plan reads is the house's size's to
-- decide: a house of a few hundred stacks is read whole faster than through any index (production
-- today), so the plan is proved on the load house instead (20,000 stacks: the count search_stacks
-- makes reads both indexes, a BitmapOr, measured in round 13's report and timed by probe.mjs).
SELECT pg_temp.rh_case('the index of the public stacks'' descriptions is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.lists_description_trigram')), 'missing')) AS done \gset rh_
SELECT pg_temp.rh_case('it is the titles'' index for the descriptions: the same kind over the same stacks',
  replace(replace(pg_get_indexdef('public.lists_title_trigram'::regclass), 'lists_title_trigram', 'X'), '(title ', '(description '),
  replace(pg_get_indexdef('public.lists_description_trigram'::regclass), 'lists_description_trigram', 'X')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
