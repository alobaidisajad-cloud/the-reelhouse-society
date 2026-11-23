-- Undo of 20261122_63: a closed ballot's voters told in the freeze's own transaction, as production held it.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: as production held it
CREATE OR REPLACE FUNCTION public.dispatch_notify_ballot_closed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v record; msg text;
BEGIN
  IF NEW.frozen_totals IS NULL OR OLD.frozen_totals IS NOT NULL THEN RETURN NEW; END IF;
  -- A ballot no voter can open (ended, withheld by the house, or unpublished) is told to no one.
  IF NEW.ended_at IS NOT NULL OR NEW.withheld_at IS NOT NULL OR NOT coalesce(NEW.is_published, false) THEN
    RETURN NEW;
  END IF;
  msg := CASE WHEN btrim(coalesce(NEW.title,'')) = ''
              THEN 'A ballot you voted in has closed.'
              ELSE 'The ballot “' || btrim(NEW.title) || '” you voted in has closed.' END;
  -- Each voter, but one who blocked or muted the author, or whom the author blocked: the same test
  -- dispatch_notify makes of every other Dispatch notice.
  FOR v IN SELECT DISTINCT dv.user_id FROM public.dispatch_votes dv
            WHERE dv.post_id = NEW.id
              AND NOT EXISTS (SELECT 1 FROM public.user_blocks b
                               WHERE (b.blocker_id = dv.user_id AND b.blocked_id = NEW.user_id)
                                  OR (b.blocker_id = NEW.user_id AND b.blocked_id = dv.user_id AND b.type = 'block'))
  LOOP
    INSERT INTO public.notifications (user_id, type, from_user_id, message, metadata, group_key)
    SELECT v.user_id, 'ballot', NEW.user_id, msg,
           jsonb_build_object('dispatch_post_id', NEW.id, 'kind', 'ballot',
                              'title', NEW.title),
           'endorse:post:' || NEW.id
     WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = v.user_id);
  END LOOP;
  RETURN NEW;
END $$;

-- The voters still waiting are told now, every one, before the list goes (from here a closing ballot
-- tells its voters itself, so nothing more is put on it).
SELECT private.closed_ballots_told(2147483647) AS told;

-- The job this car scheduled, where the house keeps its jobs (it leaves the schedule itself once nothing waits).
DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    PERFORM cron.unschedule(j.jobid) FROM cron.job j WHERE j.jobname = 'the-closed-ballots-are-told';
  END IF;
END $$;
-- add-only (1): no shipped client uses it: the function this car made, in private
DROP FUNCTION IF EXISTS private.closed_ballots_told(integer);
-- add-only (1): no shipped client uses it: the list this car made, in private
DROP TABLE IF EXISTS private.ballot_notices_waiting;
