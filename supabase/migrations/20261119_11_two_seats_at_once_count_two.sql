-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_11 — a salon's member count is taken after the salon is held, so two seats at once count two.
-- ════════════════════════════════════════════════════════════════════════════
--   1. Two members taking a seat at the same moment left a salon's count one short: the salon's row is held
--      first, then its seats are counted; the counts already short are set right once (review round 13).
--   Only the trigger's function changes, so no lock is taken on lounge_members; the one-time repair locks
--   only the rows of salons whose count is wrong.
-- Undo: mobile/supabase/migrations-down/20261119_11_two_seats_at_once_count_two.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A4 · a salon's member count is taken after the salon is held, so two seats at once count two (review round 13) ──
--   Two members taking a seat in one salon at the same moment left its count one short until the next
--   seat changed: recount_lounge_members set member_count from a count(*) of the seats inside its
--   UPDATE, and the second seat's count was taken on that statement's snapshot, before it waited on
--   the first seat's lock on the salon's row, so it never saw the first seat (READ COMMITTED re-reads
--   the salon's row after the wait, not the count). The corridor card said "N MEMBERS" and the door
--   "N members behind the door", one short. Now the salon's row is held first, in its own statement,
--   and the seats are counted in the next one: a statement in READ COMMITTED reads what was committed
--   when it starts, so the count is taken after the other seat committed, and each seat change waits
--   on the one before it. Seats committing in any order add up.
--   Counted, not moved by one: a member may make a salon's row by hand with any count (the table's
--   insert grant and rule allow it), and only a count from the seats sets that right at the next
--   seat; a count moved by +1/-1 would keep a forged or drifted number for good. The count reads the
--   faces index (lounge_id, approved seats only), so it is an index-only count of one salon's seats.
--   The trigger is the same (tr_recount_lounge_members); only its function changes, so no lock is
--   taken on lounge_members. The counts already left short are set right once, from the seats.

-- add-only (3): it only fixes: each seat taken, admitted, muted, banned or left counts its salon's approved seats after the salon is held, as the H-A4 rehearsal replays as the members themselves, and two seats taken at once count two (proved with two sessions on the local PostgreSQL); TestFlight build 41 and the website read member_count as before
CREATE OR REPLACE FUNCTION public.recount_lounge_members() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_lounge uuid := COALESCE(NEW.lounge_id, OLD.lounge_id);
  v_count  integer;
BEGIN
  -- Held first, in a statement of its own: a seat changed in this salon by another member at the same
  -- moment commits before this goes on. FOR NO KEY UPDATE, the lock an UPDATE of the row takes: it
  -- does not wait on the FOR KEY SHARE every foreign-key check on the salon takes (the seat's own, a
  -- message's, a reaction's), so two seats at once never deadlock and no word waits on a seat.
  PERFORM 1 FROM public.lounges WHERE id = v_lounge FOR NO KEY UPDATE;
  -- Counted in the next statement, which reads what was committed when it starts: the other seat too.
  SELECT count(*) INTO v_count FROM public.lounge_members
   WHERE lounge_id = v_lounge AND status = 'approved';
  UPDATE public.lounges SET member_count = v_count
   WHERE id = v_lounge AND member_count IS DISTINCT FROM v_count;
  RETURN COALESCE(NEW, OLD);
END $$;

-- The counts already left short by two seats at once, set right once from the seats themselves, as
-- the function counts them: each salon whose count looks wrong is held first (FOR NO KEY UPDATE) and
-- counted in a statement of its own, so a seat taken while this runs is counted, never left out (a
-- count taken in the UPDATE's own snapshot would be the defect itself). Only a wrong count is written.
-- add-only (3): it only fixes: a salon's member_count set to its approved seats where it is wrong, every other column and row as it was; TestFlight build 41 and the website read the count as before, replayed as the members themselves (H-A4 rehearsal)
DO $$
DECLARE
  v_lounge uuid;
  v_count  integer;
BEGIN
  FOR v_lounge IN
    SELECT l.id FROM public.lounges l
     WHERE l.member_count IS DISTINCT FROM
           (SELECT count(*) FROM public.lounge_members m WHERE m.lounge_id = l.id AND m.status = 'approved')
     ORDER BY l.id
  LOOP
    PERFORM 1 FROM public.lounges WHERE id = v_lounge FOR NO KEY UPDATE;
    SELECT count(*) INTO v_count FROM public.lounge_members WHERE lounge_id = v_lounge AND status = 'approved';
    UPDATE public.lounges SET member_count = v_count WHERE id = v_lounge AND member_count IS DISTINCT FROM v_count;
  END LOOP;
END $$;
