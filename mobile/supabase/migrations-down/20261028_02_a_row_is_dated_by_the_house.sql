-- Undo of 20261028_02_a_row_is_dated_by_the_house.sql: production's schema as it was before it.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DROP TRIGGER a_read_is_dated_by_the_house ON public.lounge_members;
DROP FUNCTION public.lounge_members_read_by_the_house();

-- The two pin functions as they were.
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

CREATE OR REPLACE FUNCTION public.dispatch_comments_pin_columns() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  NEW.certify_count := OLD.certify_count;
  NEW.created_at    := OLD.created_at;
  -- A critique belongs to the filing it was written under. Moving it puts a
  -- member's words beneath somebody else's writing.
  NEW.post_id       := OLD.post_id;
  RETURN NEW;
END $$;
