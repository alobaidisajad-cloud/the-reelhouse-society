-- ═══════════════════════════════════════════════════════════════════════════
-- THE BALLOT NEVER COUNTED, AND IT WAS NEVER SECRET
--
-- Two findings, both verified against production on 2026-09-05 inside rolled-
-- back transactions. Neither is a code defect: the app is right, the database
-- is missing one job and carrying one policy that is too wide.
--
-- ── ONE: NO BALLOT HAS EVER BEEN COUNTED ───────────────────────────────────
-- A ballot's numbers come from `dispatch_posts.frozen_totals`. That column is
-- written by exactly one thing, `freeze_closed_ballots()`, which is REVOKEd
-- from anon and authenticated — so the app cannot call it, and nothing tries.
-- Its own comment says a cron runs it.
--
--     SELECT count(*) FROM cron.job;   ->   0
--
-- There is no cron. There never was. So the column stays NULL for ever, every
-- option reads 0, and a closed ballot told members NO BALLOTS WERE CAST
-- however many of them had voted.
--
-- Proved with real rows in a rolled-back transaction: a ballot closed an hour
-- earlier with a vote on it had `frozen_totals = NULL`; calling the function by
-- hand produced {"total": 1, "counts": {"0": 1}} at once. The function is
-- correct and always was. Nothing was calling it.
--
-- ── TWO: EVERY MEMBER COULD READ EVERY VOTE ────────────────────────────────
-- `votes_read` is SELECT to authenticated USING (true). The ballot's stated
-- engine is that you cannot see the result until you have marked it — enforced
-- only in the client. Proved with a control: as the owner, one row; as a
-- DIFFERENT signed-in member, the same row including who voted for what.
--
-- Safe to narrow, checked four ways:
--   · the mobile app reads this table in ONE place and only for itself —
--     .from('dispatch_votes').select('post_id, option_index').eq('user_id', me)
--   · the WEB app does not reference dispatch_votes at all (src, api,
--     supabase/functions, scripts — nothing)
--   · tallies come from `frozen_totals`, never from counting rows client-side
--   · the two SECURITY DEFINER functions that read every vote are owned by
--     `postgres`, which has rolbypassrls, so RLS does not apply to them
--
-- ⚠️ ALTER, never DROP + CREATE. A dropped policy leaves the table open for the
-- moment between the two statements.
--
-- ── SAFE TO RUN, AND SAFE TO RUN TWICE ─────────────────────────────────────
-- Dry-run against production twice in one rolled-back transaction: no error,
-- no duplicate job (cron.schedule upserts on the name), and the policy lands
-- identically. The catch-up currently touches 0 rows, because there are no
-- ballots yet.
--
-- The whole thing is one transaction with its own post-conditions. If any
-- check fails it RAISES and the entire migration rolls back, so this cannot
-- half-apply and cannot silently succeed while doing nothing.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── PRE-FLIGHT ─────────────────────────────────────────────────────────────
-- Fail with a sentence somebody can act on, rather than a missing-schema error
-- forty lines down.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'pg_cron is not installed — enable it in the Supabase dashboard first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'freeze_closed_ballots'
  ) THEN
    RAISE EXCEPTION 'public.freeze_closed_ballots() is missing — run the dispatch step-one migration first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'dispatch_votes' AND policyname = 'votes_read'
  ) THEN
    RAISE EXCEPTION 'policy votes_read on dispatch_votes is missing — nothing to alter';
  END IF;
END $$;

-- ── ONE: COUNT THE BALLOTS ─────────────────────────────────────────────────
-- Every five minutes. The function is idempotent by its own WHERE clause
-- (`frozen_totals IS NULL`), so a double fire or a catch-up run cannot rewrite
-- a result that is already fixed.
--
-- Five minutes is the window in which a closed ballot has no result yet. The
-- app now prints THE COUNT IS BEING SEALED during it rather than claiming
-- nobody voted, so the window is honest rather than merely short.
--
-- `cron.schedule(job_name, ...)` replaces a job of the same name, which is what
-- makes re-running this file safe.
SELECT cron.schedule(
  'freeze-closed-ballots',
  '*/5 * * * *',
  $$SELECT public.freeze_closed_ballots();$$
);

-- Catch up on anything that closed before the job existed.
SELECT public.freeze_closed_ballots();

-- ── TWO: MAKE THE BALLOT SECRET ────────────────────────────────────────────
ALTER POLICY votes_read ON public.dispatch_votes
  TO authenticated
  USING (user_id = auth.uid());

-- ── POST-CONDITIONS ────────────────────────────────────────────────────────
-- Checked HERE, inside the transaction, so a failure rolls the whole thing
-- back. A migration that reports success without having changed anything is
-- the one nobody ever re-runs.
DO $$
DECLARE v_using text; v_roles text; v_left integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job
     WHERE jobname = 'freeze-closed-ballots'
       AND active
       AND database = current_database()
  ) THEN
    RAISE EXCEPTION 'the freeze job is not scheduled, active and in this database';
  END IF;

  SELECT qual, roles::text INTO v_using, v_roles
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'dispatch_votes' AND policyname = 'votes_read';

  IF v_using IS DISTINCT FROM '(user_id = auth.uid())' THEN
    RAISE EXCEPTION 'votes_read did not narrow — it reads: %', coalesce(v_using, '(null)');
  END IF;
  IF v_roles <> '{authenticated}' THEN
    RAISE EXCEPTION 'votes_read applies to % — it must be authenticated only', v_roles;
  END IF;

  SELECT count(*) INTO v_left
    FROM public.dispatch_posts
   WHERE kind = 'ballot' AND closes_at <= now() AND frozen_totals IS NULL;
  IF v_left > 0 THEN
    RAISE EXCEPTION '% closed ballot(s) are still uncounted after the catch-up', v_left;
  END IF;

  RAISE NOTICE 'ballot count scheduled, votes_read narrowed, no ballot left uncounted';
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROOF, to run after committing. Expected results beside each.
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. SELECT jobname, schedule, database, active FROM cron.job;
--      -> freeze-closed-ballots | */5 * * * * | postgres | t
--
-- 2. SELECT count(*) FROM dispatch_posts
--     WHERE kind = 'ballot' AND closes_at <= now() AND frozen_totals IS NULL;
--      -> 0
--
-- 3. A member cannot read another member's vote:
--      BEGIN;
--      SET LOCAL ROLE authenticated;
--      SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
--      SELECT count(*) FROM dispatch_votes;
--      ROLLBACK;
--      -> 0
