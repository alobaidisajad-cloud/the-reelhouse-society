-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_63 — a closed ballot's voters are told at a pace.
-- ════════════════════════════════════════════════════════════════════════════
--   When freeze_closed_ballots closed a ballot, its trigger wrote every voter's notice (and queued each
--   one's push) in the freeze's own transaction, one voter at a time: a ballot voted in by one member in
--   five held that transaction about 13 seconds at 100,000 members and about a minute at 500,000, and
--   any statement needing a lock it held waited or was cancelled meanwhile (an index built CONCURRENTLY
--   waits for every older transaction).
--   Now closing a ballot is one small write: its totals frozen, as before, and the ballot put on a list
--   of ballots whose voters are to be told (private.ballot_notices_waiting), with its question as it
--   stood when it closed. A job (private.closed_ballots_told, every second while anything waits, where
--   the house keeps its jobs) tells the voters 500 at a time, each time its own short transaction, in
--   the order of their ids, resuming after the last voter it told: every voter is told once (the notices
--   and how far the job went are written together), within minutes, with the same words, the same
--   metadata and the same push as before. A voter who blocked or muted the author, or whom the author
--   blocked, and a voter whose account is gone, are told nothing, as before; a ballot the house withheld
--   or ended, or its author took down, before its voters were all told is told to no one more.
--   The job leaves the schedule once nothing waits, and closing a ballot puts it back.
-- Undo: mobile/supabase/migrations-down/20261122_63_a_closed_ballots_voters_are_told_at_a_pace.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── the ballots whose voters are to be told ──
--   In private, which the API never serves; read only by the job. No key to the filing: a ballot gone
--   is found gone by the job, which takes it off the list.
CREATE TABLE IF NOT EXISTS private.ballot_notices_waiting (
  post_id   uuid PRIMARY KEY,
  author    uuid NOT NULL,
  -- The question as it stood when the ballot closed: every voter is told the same words.
  title     text,
  -- The last voter told, in the order of their ids (NULL: none yet).
  after     uuid,
  queued_at timestamptz NOT NULL DEFAULT now()
);
-- add-only (1): no shipped client uses it: a table this car makes in private, which the API never serves (TestFlight build 41 and the website checked)
REVOKE ALL ON private.ballot_notices_waiting FROM PUBLIC, anon, authenticated;

-- ── the voters told, 500 at a time ──
--   One run: the ballots waiting, the oldest first, their next voters after the last told, until it has
--   told p_voters or nothing waits. A run gives way at once to another run, or to a ballot being put on
--   the list (the lock both take), and to anyone holding what it writes (its lock wait is 100 ms): it is
--   simply run again a second later.
CREATE OR REPLACE FUNCTION private.closed_ballots_told(p_voters integer DEFAULT 500) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    SET lock_timeout TO '100ms'
    AS $$
DECLARE
  v_left  integer := GREATEST(COALESCE(p_voters, 500), 1);
  v_told  integer := 0;
  v_n     integer;
  v_wrote integer;
  v_ids   uuid[];
  v_open  boolean;
  v_msg   text;
  q       record;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('private.closed_ballots_told')) THEN
    RETURN 'waited';
  END IF;
  FOR q IN SELECT w.post_id, w.author, w.title, w.after FROM private.ballot_notices_waiting w ORDER BY w.queued_at, w.post_id LOOP
    EXIT WHEN v_left = 0;
    -- A ballot no voter can open now (ended, withheld by the house, unpublished, or gone) is told to no one more.
    SELECT p.ended_at IS NULL AND p.withheld_at IS NULL AND COALESCE(p.is_published, false) INTO v_open
      FROM public.dispatch_posts p WHERE p.id = q.post_id;
    IF NOT COALESCE(v_open, false) THEN
      DELETE FROM private.ballot_notices_waiting WHERE post_id = q.post_id;
      CONTINUE;
    END IF;
    -- Its next voters, by its key (post_id, user_id): one range from the last told, that one left out.
    SELECT array_agg(v.user_id ORDER BY v.user_id) INTO v_ids
      FROM (SELECT dv.user_id FROM public.dispatch_votes dv
             WHERE dv.post_id = q.post_id
               AND dv.user_id >= COALESCE(q.after, '00000000-0000-0000-0000-000000000000'::uuid)
               AND dv.user_id IS DISTINCT FROM q.after
             ORDER BY dv.user_id LIMIT v_left) v;
    v_n := COALESCE(cardinality(v_ids), 0);
    IF v_n > 0 THEN
      v_msg := CASE WHEN btrim(COALESCE(q.title, '')) = ''
                    THEN 'A ballot you voted in has closed.'
                    ELSE 'The ballot “' || btrim(q.title) || '” you voted in has closed.' END;
      -- Each voter, but one who blocked or muted the author, or whom the author blocked: the same test
      -- dispatch_notify makes of every other Dispatch notice; and a voter whose account is gone, never.
      INSERT INTO public.notifications (user_id, type, from_user_id, message, metadata, group_key)
      SELECT t.id, 'ballot', q.author, v_msg,
             jsonb_build_object('dispatch_post_id', q.post_id, 'kind', 'ballot', 'title', q.title),
             'endorse:post:' || q.post_id
        FROM unnest(v_ids) t(id)
       WHERE NOT EXISTS (SELECT 1 FROM public.user_blocks b
                          WHERE (b.blocker_id = t.id AND b.blocked_id = q.author)
                             OR (b.blocker_id = q.author AND b.blocked_id = t.id AND b.type = 'block'))
         AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = t.id)
       ORDER BY t.id;
      GET DIAGNOSTICS v_wrote = ROW_COUNT;
      v_told := v_told + v_wrote;
    END IF;
    IF v_n < v_left THEN
      -- Every voter reached: the ballot leaves the list.
      DELETE FROM private.ballot_notices_waiting WHERE post_id = q.post_id;
    ELSE
      UPDATE private.ballot_notices_waiting SET after = v_ids[v_n] WHERE post_id = q.post_id;
    END IF;
    v_left := v_left - v_n;
  END LOOP;
  -- Nothing waits: the job leaves the schedule (a ballot put on the list puts it back).
  IF NOT EXISTS (SELECT 1 FROM private.ballot_notices_waiting) THEN
    IF to_regclass('cron.job') IS NOT NULL THEN
      PERFORM cron.unschedule(j.jobid) FROM cron.job j WHERE j.jobname = 'the-closed-ballots-are-told';
    END IF;
    RETURN 'told ' || v_told || ', none waits';
  END IF;
  RETURN 'told ' || v_told;
END $$;
-- add-only (1): no shipped client uses it: a function this car makes in private, run by the job alone (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION private.closed_ballots_told(integer) FROM PUBLIC, anon, authenticated;

-- ── a closed ballot put on the list ──
--   As production holds it, but the voters are left to the job: the ballot closing writes one row, and
--   puts the job on the schedule if it is not there. The lock the job takes is taken first, so a run
--   that finds nothing waiting and leaves the schedule is never passed by a ballot it did not see.
-- add-only (3): it only fixes: every voter of a closing ballot is told as before, with the same words and push, by the job within minutes (the rehearsal closes a ballot and replays the job's runs); TestFlight build 41 and the website read the notices as before
CREATE OR REPLACE FUNCTION public.dispatch_notify_ballot_closed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.frozen_totals IS NULL OR OLD.frozen_totals IS NOT NULL THEN RETURN NEW; END IF;
  -- A ballot no voter can open (ended, withheld by the house, or unpublished) is told to no one.
  IF NEW.ended_at IS NOT NULL OR NEW.withheld_at IS NOT NULL OR NOT coalesce(NEW.is_published, false) THEN
    RETURN NEW;
  END IF;
  -- A ballot no one voted in has no one to tell.
  IF NOT EXISTS (SELECT 1 FROM public.dispatch_votes dv WHERE dv.post_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('private.closed_ballots_told'));
  INSERT INTO private.ballot_notices_waiting (post_id, author, title)
  VALUES (NEW.id, NEW.user_id, NEW.title)
  ON CONFLICT (post_id) DO NOTHING;
  IF to_regclass('cron.job') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = 'the-closed-ballots-are-told') THEN
      PERFORM cron.schedule('the-closed-ballots-are-told', '1 seconds', 'SELECT private.closed_ballots_told();');
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- The list, known to the planner (empty as the car leaves it).
-- add-only (1): no shipped client uses it: statistics, read by the planner alone
ANALYZE private.ballot_notices_waiting;
