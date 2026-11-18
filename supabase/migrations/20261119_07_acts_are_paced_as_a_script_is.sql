-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_07 — a member's follows and certifications are paced as a script is, never as a person is.
-- ════════════════════════════════════════════════════════════════════════════
--   1. Two certifications or follows a moment apart: the second was refused, and an offline queue halted
--      behind it. check_interaction_rate_limit keeps a room to act of 120, one more every 2 seconds, a
--      day's caps, and an hour's cap per thing, and says how long to wait (RH429) (review round 13).
--   Only the trigger's function changes, so no lock is taken on interactions; its tables are 20261119_00's.
-- Undo: mobile/supabase/migrations-down/20261119_07_acts_are_paced_as_a_script_is.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A2 · a member's follows and certifications are paced as a script is, never as a person is (review round 13) ──
--   Two certifications or follows less than a second apart: the second was refused ("PGRST301: Too
--   many requests"), the heart sprang back with "Failed to certify entry." and a report went to the
--   defect log; and a queue of marks made offline sent one per send and halted every write behind it,
--   its words given back unsent a day later. check_interaction_rate_limit refused any second
--   interaction within a second of the member's last one: a floor that stops people, and lets a
--   script make 86,400 a day. And it walked every row the member ever made to find the last one.
--   Now, per member, read and written in one statement on one row of interaction_budget:
--     · a room to act of 120 (more than the 100 a full offline queue can hold, so it sends in one
--       pass), one more every 2 seconds (30 a minute, sustained, for as long as a script runs);
--     · in a day (the house's UTC day), 400 follows or follow requests and 3,000 certifications;
--   and per member and thing, in interaction_churn: a member followed more than 3 times, or a record
--   or stack certified more than 5 times, within an hour is refused (an unfollow or a withdrawal leaves
--   no row to count, so the acts are counted as they are made).
--   A refusal says what it is and how long to wait: SQLSTATE RH429, message RATE_LIMITED, DETAIL
--   'member' (the member's own pace) or 'target' (that one thing), HINT the seconds to wait. The phone
--   waits that long and goes on; a refusal costs nothing (the counters are written by the statement
--   it rolls back). The house's own writes (no member signed in) are not paced. A member's churn rows
--   older than an hour are let go once an hour, by their next act.
--   Only the trigger's function changes (the trigger enforce_interaction_rate_limit stays), so no lock
--   is taken on interactions. Its tables are H-A2.table's.

-- add-only (3): it only fixes: a member's follows and certifications a moment apart both land, a script is held to 30 a minute and its day's ceilings, and one member or thing churned past its hour's count is refused with RH429 and the wait, as the H-A2 rehearsal replays as the members themselves; TestFlight build 41 meets the refusal only as a script would (its online failure as before), and the website as before
CREATE OR REPLACE FUNCTION public.check_interaction_rate_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_now      timestamptz := now();
  v_day      date := (now() AT TIME ZONE 'UTC')::date;
  v_follow   boolean := NEW.type IN ('follow', 'follow_request');
  v_cert     boolean := NEW.type IN ('endorse_log', 'endorse_list');
  v_target   text := CASE
                       WHEN NEW.type IN ('follow', 'follow_request') THEN 'member:' || NEW.target_user_id::text
                       WHEN NEW.type = 'endorse_log' THEN 'log:' || NEW.target_log_id::text
                       WHEN NEW.type = 'endorse_list' THEN 'list:' || NEW.target_list_id::text
                     END;
  v_tokens   real;
  v_follows  integer;
  v_certs    integer;
  v_swept    timestamptz;
  v_n        integer;
  v_since    timestamptz;
  v_midnight integer := ceil(extract(epoch FROM ((v_day + 1)::timestamp AT TIME ZONE 'UTC') - v_now))::integer;
BEGIN
  -- The house's own writes are not paced: a member's request always carries the member.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- The member's room to act, refilled for the time since, less this act; and the day's counts.
  -- One row, one statement: a member's acts at the same moment wait on each other here.
  INSERT INTO public.interaction_budget AS b (user_id, tokens, refilled_at, day, follows, certs, swept_at)
  VALUES (NEW.user_id, 119, v_now, v_day, v_follow::integer, v_cert::integer, v_now)
  ON CONFLICT (user_id) DO UPDATE SET
    tokens      = LEAST(120, b.tokens + GREATEST(0, extract(epoch FROM v_now - b.refilled_at))::real / 2) - 1,
    refilled_at = GREATEST(b.refilled_at, v_now),
    day         = v_day,
    follows     = (CASE WHEN b.day = v_day THEN b.follows ELSE 0 END) + v_follow::integer,
    certs       = (CASE WHEN b.day = v_day THEN b.certs ELSE 0 END) + v_cert::integer,
    swept_at    = CASE WHEN b.swept_at <= v_now - interval '1 hour' THEN v_now ELSE b.swept_at END
  RETURNING tokens, follows, certs, swept_at INTO v_tokens, v_follows, v_certs, v_swept;

  IF v_tokens < 0 THEN
    -- Two seconds for each act short of one.
    RAISE EXCEPTION 'RATE_LIMITED' USING ERRCODE = 'RH429', DETAIL = 'member',
      HINT = GREATEST(1, ceil(-v_tokens * 2))::integer::text;
  END IF;
  IF v_follows > 400 OR v_certs > 3000 THEN
    RAISE EXCEPTION 'RATE_LIMITED' USING ERRCODE = 'RH429', DETAIL = 'member',
      HINT = GREATEST(1, v_midnight)::text;
  END IF;

  IF v_target IS NOT NULL THEN
    -- Once an hour, by their next act, the member's acts at things over an hour ago are let go.
    IF v_swept = v_now THEN
      DELETE FROM public.interaction_churn
       WHERE user_id = NEW.user_id AND since <= v_now - interval '1 hour';
    END IF;
    INSERT INTO public.interaction_churn AS c (user_id, target, since, n)
    VALUES (NEW.user_id, v_target, v_now, 1)
    ON CONFLICT (user_id, target) DO UPDATE SET
      since = CASE WHEN c.since <= v_now - interval '1 hour' THEN v_now ELSE c.since END,
      n     = CASE WHEN c.since <= v_now - interval '1 hour' THEN 1 ELSE c.n + 1 END
    RETURNING n, since INTO v_n, v_since;
    IF v_n > (CASE WHEN v_follow THEN 3 ELSE 5 END) THEN
      RAISE EXCEPTION 'RATE_LIMITED' USING ERRCODE = 'RH429', DETAIL = 'target',
        HINT = GREATEST(1, ceil(extract(epoch FROM v_since + interval '1 hour' - v_now)))::integer::text;
    END IF;
  END IF;

  RETURN NEW;
END $$;
