-- ═══════════════════════════════════════════════════════════════════════════
-- INTEGRITY — an author could rewrite their own ballot after the house voted.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `dispatch_posts_pin_columns` is the BEFORE UPDATE trigger that decides which
-- columns a member may move on their own filing. It pins the counters, the
-- filing date, the kind, and the three the house owns — withheld, ended, and
-- by whom. It did not pin the three that make a BALLOT what it is.
--
-- Every one of them is UPDATEable by `authenticated` at the column level and
-- reachable through `posts_update_own`, which allows a member to update their
-- own filing while it stands. So the author of a ballot could:
--
--   FROZEN_TOTALS — write a result. Any result. On a ballot still open, before
--     the count ever ran. `notify_ballot_closed` fires AFTER UPDATE OF
--     frozen_totals, so the house would then be TOLD the fabricated answer.
--
--   OPTIONS — change the films after the votes are in. `dispatch_votes` records
--     an option INDEX, so swapping the array re-points every vote already cast
--     at a film nobody chose.
--
--   CLOSES_AT — move the deadline, including backwards past a vote, or forwards
--     to reopen a ballot the house has finished with.
--
-- The app never sends any of the three: `FilingUpdate` is
-- `Partial<Omit<FilingDraft, 'kind' | 'options' | 'closesAt'>>` and frozen
-- totals are not in a draft at all. The client was disciplined and the database
-- was not, which is the only kind of rule that matters.
--
-- ── THE FREEZE STILL WORKS ─────────────────────────────────────────────────
-- `freeze_closed_ballots()` is SECURITY DEFINER owned by postgres, and the cron
-- job that calls it every five minutes runs as postgres — so it lands in the
-- exemption this trigger already has at the top, the same one the certify and
-- critique counters have always depended on. If that exemption were broken, the
-- counts on every filing would have stopped moving long ago.

BEGIN;

CREATE OR REPLACE FUNCTION public.dispatch_posts_pin_columns() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- The house's own machinery — the counters, `end_filing`, the Tribunal, the
  -- ballot freeze — all run as the table owner. Everything else is a member.
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Counts belong to the members who made them, not to the author.
  NEW.certify_count := OLD.certify_count;
  NEW.comment_count := OLD.comment_count;
  -- When it was filed is what orders the paper.
  NEW.created_at    := OLD.created_at;
  -- The kind is gated at INSERT by tier; changing it afterwards walks around
  -- that gate, so a take cannot quietly become a dossier.
  NEW.kind          := OLD.kind;
  -- Under review, or struck. Only the house moves these.
  NEW.withheld_at   := OLD.withheld_at;
  NEW.ended_at      := OLD.ended_at;
  NEW.ended_by      := OLD.ended_by;

  -- ── A BALLOT IS THE HOUSE'S, NOT THE AUTHOR'S ───────────────────────────
  -- The question is theirs to ask. The answer is not theirs to write, the
  -- films are not theirs to swap once anybody has voted on an index, and the
  -- deadline is not theirs to move after the fact.
  NEW.frozen_totals := OLD.frozen_totals;
  NEW.options       := OLD.options;
  NEW.closes_at     := OLD.closes_at;

  RETURN NEW;
END $$;

COMMIT;

-- ── PROVE IT ───────────────────────────────────────────────────────────────
-- As the ballot's own author, each of these must leave the column untouched
-- rather than raise — a BEFORE trigger restores the value silently, which is
-- the point: an amend to the body still succeeds.
--
--   BEGIN;
--   SET LOCAL request.jwt.claims = '{"sub":"<the ballot author>","role":"authenticated"}';
--   SET LOCAL ROLE authenticated;
--   UPDATE public.dispatch_posts
--      SET frozen_totals = '{"total":999,"counts":{"0":999}}'::jsonb,
--          closes_at     = now() + interval '30 days'
--    WHERE id = '<their ballot>';
--   SELECT frozen_totals, closes_at FROM public.dispatch_posts WHERE id = '<their ballot>';
--   -- expect: both unchanged
--   ROLLBACK;
--
-- And the freeze must still be able to write one:
--   SELECT public.freeze_closed_ballots();   -- as postgres; returns rows frozen
