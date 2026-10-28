-- ════════════════════════════════════════════════════════════════════════════
-- 20261028_02 — a member's row is dated by the house's clock.
-- ════════════════════════════════════════════════════════════════════════════
--   The phone's clock is the member's to set, and can be minutes, hours or a
--   day wrong. Three times the app writes were taken from it, and the house
--   compares each with its own: a salon's last read (a phone a day ahead read
--   every later message as read, and the unread count stayed 0), and when a
--   filing or a critique was changed. Each is now the house's now() whenever a
--   member's write changes it, whatever the phone sent, so the builds in
--   members' hands are dated truly too (WORKLIST P4.32).
-- Undo: mobile/supabase/migrations-down/20261028_02_a_row_is_dated_by_the_house.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── 1. A filing: changed when the house says ────────────────────────────────
-- As live, with its times set last.
-- add-only (3): it only fixes: a time the phone sent is the house's now(); build 41's and the app's edits replayed in the old clients' run (e2e-old-clients), each landing as before
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

  -- When a member changed it is the house's clock, never the phone's: a phone set a day ahead
  -- dated an edit tomorrow, and the newer of two copies read as the older.
  NEW.updated_at := now();
  IF NEW.edited_at IS DISTINCT FROM OLD.edited_at THEN
    NEW.edited_at := now();
  END IF;

  RETURN NEW;
END $$;

-- ── 2. A critique: edited when the house says ───────────────────────────────
-- add-only (3): it only fixes: a time the phone sent is the house's now(); build 41's and the app's edits replayed in the old clients' run (e2e-old-clients), each landing as before
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
  -- An edit is dated by the house's clock, never the phone's.
  IF NEW.edited_at IS DISTINCT FROM OLD.edited_at THEN
    NEW.edited_at := now();
  END IF;
  RETURN NEW;
END $$;

-- ── 3. A salon: read when the house says ────────────────────────────────────
CREATE FUNCTION public.lounge_members_read_by_the_house() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Whatever time the phone sent, the member read the salon now.
  IF NEW.last_read_at IS DISTINCT FROM OLD.last_read_at THEN
    NEW.last_read_at := now();
  END IF;
  RETURN NEW;
END $$;
-- add-only (1): no shipped client uses it: a trigger's function this migration makes, named by no client (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.lounge_members_read_by_the_house() FROM PUBLIC, anon, authenticated;

-- add-only (3): it only fixes: a time the phone sent is the house's now(); build 41's and the app's reads of a salon replayed in the old clients' run (e2e-old-clients), each landing as before
CREATE TRIGGER a_read_is_dated_by_the_house BEFORE UPDATE OF last_read_at ON public.lounge_members
    FOR EACH ROW EXECUTE FUNCTION public.lounge_members_read_by_the_house();
