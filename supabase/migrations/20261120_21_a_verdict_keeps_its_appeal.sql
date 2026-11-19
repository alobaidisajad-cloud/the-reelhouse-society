-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_21 — a verdict keeps its one appeal and its lifting.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A verdict had nowhere to keep an appeal or a lifting: mod_actions keeps the member's one appeal,
--      its hearing and a lifting (review round 14).
--   2. The copy of a removed piece is widened to what a removal takes, so a long essay's removal is no
--      longer refused (review round 14).
--   A car of its own, before the functions that write these columns (20261120_24, 20261120_27): each
--   column is empty and each rule NOT VALID (proved by 20261120_27), so mod_actions is held only for the
--   instant the catalogue changes; no member writes mod_actions.
-- Undo: mobile/supabase/migrations-down/20261120_21_a_verdict_keeps_its_appeal.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-B6's columns · a verdict keeps its one appeal and its lifting (review round 14) ──
--   A car of its own, BEFORE H-B2's and H-B6's functions (they write these columns). Every statement
--   here is brief: mod_actions is held only while the catalogue changes; no row is read or rewritten
--   (each new column is empty, each new rule NOT VALID, proved over the rows by H-B6.up.sql).
--   The owner's decision (2026-11-19): a member the house has judged may appeal each verdict once,
--   from inside the app; a moderator other than the one who ruled hears it; the member is told the
--   outcome. And an admin may lift a ban or a suspension, as the BAN sheet promises. A verdict is one
--   row of mod_actions, so its one appeal and its lifting are kept on it:
--     appeal, appeal_filed_at: the member's words and when (file_appeal; one per verdict);
--     appeal_status: pending, upheld or overturned; appeal_judged_by, appeal_judged_at, appeal_note:
--       who heard it (never the one who ruled), when, and the house's words to the member (judge_appeal);
--     lifted_at, lifted_by, lift_reason: a ban or a suspension lifted by an admin (lift_sanction), or
--       any verdict overturned on appeal: it no longer holds the member's standing.
--   A member already reads their own verdicts (users_select_own_mod_actions); these columns are theirs
--   to read with them. No member writes them: mod_actions has no rule for an update.
--   The copy of a removed piece is widened to the words a removal can take (an essay is 25,000
--   characters, its copy kept whole with the fields that put it back); its rule held 30,000 and refused
--   the removal of a long essay outright.

-- add-only (3): it only widens: columns no shipped client names, empty for every verdict until a member appeals or an admin lifts one; TestFlight build 41 and the website read mod_actions by the history function and by named columns, replayed as the members themselves (H-B6.locks rehearsal)
ALTER TABLE public.mod_actions
  ADD COLUMN IF NOT EXISTS appeal text,
  ADD COLUMN IF NOT EXISTS appeal_filed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS appeal_status text,
  ADD COLUMN IF NOT EXISTS appeal_judged_by uuid,
  ADD COLUMN IF NOT EXISTS appeal_judged_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS appeal_note text,
  ADD COLUMN IF NOT EXISTS lifted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS lifted_by uuid,
  ADD COLUMN IF NOT EXISTS lift_reason text;

-- add-only (1): no shipped client uses it: a rule this piece makes, dropped first only so the piece runs again (TestFlight build 41 and the website checked)
ALTER TABLE public.mod_actions DROP CONSTRAINT IF EXISTS mod_actions_appeal_len;
-- add-only (3): it only fixes: a rule on a column this piece adds, empty for every verdict, NOT VALID until H-B6 proves it; TestFlight build 41 and the website never write mod_actions, replayed as the members themselves (H-B6.locks rehearsal)
ALTER TABLE public.mod_actions ADD CONSTRAINT mod_actions_appeal_len CHECK ((char_length(appeal) <= 1000)) NOT VALID;
-- add-only (1): no shipped client uses it: a rule this piece makes, dropped first only so the piece runs again (TestFlight build 41 and the website checked)
ALTER TABLE public.mod_actions DROP CONSTRAINT IF EXISTS mod_actions_appeal_note_len;
-- add-only (3): it only fixes: a rule on a column this piece adds, empty for every verdict, NOT VALID until H-B6 proves it; TestFlight build 41 and the website never write mod_actions, replayed as the members themselves (H-B6.locks rehearsal)
ALTER TABLE public.mod_actions ADD CONSTRAINT mod_actions_appeal_note_len CHECK ((char_length(appeal_note) <= 2000)) NOT VALID;
-- add-only (1): no shipped client uses it: a rule this piece makes, dropped first only so the piece runs again (TestFlight build 41 and the website checked)
ALTER TABLE public.mod_actions DROP CONSTRAINT IF EXISTS mod_actions_lift_reason_len;
-- add-only (3): it only fixes: a rule on a column this piece adds, empty for every verdict, NOT VALID until H-B6 proves it; TestFlight build 41 and the website never write mod_actions, replayed as the members themselves (H-B6.locks rehearsal)
ALTER TABLE public.mod_actions ADD CONSTRAINT mod_actions_lift_reason_len CHECK ((char_length(lift_reason) <= 2000)) NOT VALID;
-- add-only (1): no shipped client uses it: a rule this piece makes, dropped first only so the piece runs again (TestFlight build 41 and the website checked)
ALTER TABLE public.mod_actions DROP CONSTRAINT IF EXISTS mod_actions_appeal_status_check;
-- add-only (3): it only fixes: a rule on a column this piece adds, empty for every verdict, NOT VALID until H-B6 proves it; TestFlight build 41 and the website never write mod_actions, replayed as the members themselves (H-B6.locks rehearsal)
ALTER TABLE public.mod_actions ADD CONSTRAINT mod_actions_appeal_status_check
  CHECK ((appeal_status IS NULL OR appeal_status = ANY (ARRAY['pending'::text, 'upheld'::text, 'overturned'::text]))) NOT VALID;
-- add-only (1): no shipped client uses it: a rule this piece makes, dropped first only so the piece runs again (TestFlight build 41 and the website checked)
ALTER TABLE public.mod_actions DROP CONSTRAINT IF EXISTS mod_actions_appeal_whole;
-- add-only (3): it only fixes: a rule on a column this piece adds, empty for every verdict, NOT VALID until H-B6 proves it; TestFlight build 41 and the website never write mod_actions, replayed as the members themselves (H-B6.locks rehearsal)
ALTER TABLE public.mod_actions ADD CONSTRAINT mod_actions_appeal_whole
  CHECK ((((appeal IS NULL) = (appeal_filed_at IS NULL)) AND ((appeal IS NULL) = (appeal_status IS NULL)))) NOT VALID;

-- The copy of a removed piece, widened: written by the house alone, from pieces held to their own rules.
-- add-only (3): it only widens: every copy the rule allowed it allows, and the copy of a long essay too; TestFlight build 41 and the website never write mod_actions, replayed as the moderator (H-B6.locks rehearsal)
ALTER TABLE public.mod_actions DROP CONSTRAINT IF EXISTS mod_actions_content_snapshot_len;
-- add-only (3): it only widens: every copy the old rule allowed this one allows, NOT VALID until H-B6 proves it; TestFlight build 41 and the website never write mod_actions, replayed as the moderator (H-B6.locks rehearsal)
ALTER TABLE public.mod_actions ADD CONSTRAINT mod_actions_content_snapshot_len CHECK ((char_length((content_snapshot)::text) <= 200000)) NOT VALID;

COMMENT ON COLUMN public.mod_actions.appeal IS 'The member''s one appeal of this verdict, in their words (file_appeal). appeal_status: pending, upheld or overturned (judge_appeal, by a moderator other than admin_id).';
COMMENT ON COLUMN public.mod_actions.lifted_at IS 'When this verdict stopped holding the member''s standing: a ban or suspension lifted by an admin (lift_sanction), or any verdict overturned on appeal.';
