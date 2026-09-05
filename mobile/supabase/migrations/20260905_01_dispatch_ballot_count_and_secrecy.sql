-- ═══════════════════════════════════════════════════════════════════════════
-- THE BALLOT NEVER COUNTED, AND IT WAS NEVER SECRET
--
-- Two findings, both verified against production on 2026-09-05 with rolled-back
-- transactions. Neither is a code change: the app is correct, the database is
-- missing one job and carrying one policy that is too wide.
--
-- ── ONE: NO BALLOT HAS EVER BEEN COUNTED ───────────────────────────────────
-- A ballot's numbers come from `dispatch_posts.frozen_totals`. That column is
-- written by exactly one thing, `freeze_closed_ballots()`, which is REVOKEd
-- from anon and authenticated — so the app cannot call it, and nothing in the
-- app tries. Its own comment says a cron runs it.
--
--     SELECT count(*) FROM cron.job;   ->   0
--
-- There is no cron. There never was. So `frozen_totals` stays NULL for ever,
-- every option reads 0, and a closed ballot told members NO BALLOTS WERE CAST
-- however many of them had voted.
--
-- Proved with real rows inside a rolled-back transaction: a ballot closed an
-- hour earlier with a vote on it had `frozen_totals = NULL`; calling the
-- function by hand immediately produced
--
--     {"total": 1, "counts": {"0": 1}, "frozen_at": "..."}
--
-- The function is correct and always was. Nothing was calling it.
--
-- ── TWO: EVERY MEMBER COULD READ EVERY VOTE ────────────────────────────────
-- `votes_read` is SELECT to authenticated USING (true). The ballot's stated
-- engine is that you cannot see the result until you have marked it — enforced
-- only in the client. One query with a session returns who voted for what.
--
-- Proved the same way, with a control: as the owner, 1 row; as a different
-- signed-in member, 1 row, including `user_id -> option_index`.
--
-- The app reads this table in ONE place and only for itself:
--     .from('dispatch_votes').select('post_id, option_index').eq('user_id', me)
-- and the tallies come from `frozen_totals`, so narrowing it breaks nothing.
-- Rehearsed: after the change a stranger reads 0 and the owner still reads 1.
--
-- ⚠️ ALTER, never DROP + CREATE. A dropped policy leaves the table open for the
-- moment between the two statements.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── ONE ────────────────────────────────────────────────────────────────────
-- Every five minutes. The function is idempotent by its own WHERE clause
-- (`frozen_totals IS NULL`), so a double fire or a catch-up run cannot rewrite
-- a result that is already fixed.
--
-- Five minutes is the window in which a closed ballot has no result yet. The
-- app now says THE COUNT IS BEING SEALED during it rather than claiming nobody
-- voted, so the window is honest rather than merely short.
SELECT cron.schedule(
  'freeze-closed-ballots',
  '*/5 * * * *',
  $$SELECT public.freeze_closed_ballots();$$
);

-- Catch up on anything that closed before this job existed.
SELECT public.freeze_closed_ballots();

-- ── TWO ────────────────────────────────────────────────────────────────────
ALTER POLICY votes_read ON public.dispatch_votes
  TO authenticated
  USING (user_id = auth.uid());

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROOF, to run after committing. Expected results are written beside each.
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The job exists and is active:
--      SELECT jobname, schedule, active FROM cron.job;
--      -> freeze-closed-ballots | */5 * * * * | t
--
-- 2. No closed ballot is left uncounted:
--      SELECT count(*) FROM dispatch_posts
--       WHERE kind = 'ballot' AND closes_at <= now() AND frozen_totals IS NULL;
--      -> 0
--
-- 3. A member cannot read another member's vote. Run as a real session, or:
--      BEGIN;
--      SET LOCAL ROLE authenticated;
--      SET LOCAL request.jwt.claims = '{"sub":"<some other member>","role":"authenticated"}';
--      SELECT count(*) FROM dispatch_votes WHERE user_id <> auth.uid();
--      ROLLBACK;
--      -> 0
