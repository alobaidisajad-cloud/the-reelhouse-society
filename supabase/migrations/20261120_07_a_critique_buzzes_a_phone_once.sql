-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_07 — a member's critiques are paced as a person writes, and a critique buzzes a phone once.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A script could critique another member's record, stack or filing in a loop, each critique a
--      notice and a push: check_critique_pace keeps a room of 30, one more every 20 seconds, 500 a day,
--      and 20 an hour on one piece, and says how long to wait (RH429) (review round 14).
--   2. A second critique on the same piece within the hour is written under the bell, unpushed
--      (tg_notify_push) (review round 14).
--   Functions only, so no table is locked; the room is 20261120_06's, and the triggers that ask the
--   pace are the car 20261120_08, alone.
-- Undo: mobile/supabase/migrations-down/20261120_07_a_critique_buzzes_a_phone_once.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A3 · a member's critiques are paced as a person writes, and a critique buzzes a phone once (review round 14) ──
--   A script signed in as any member could critique one of another member's records, stacks or
--   filings in a loop (or critique, delete and critique again): nothing but the annotate rule and the
--   ban gate stood in the way, and neither paces. Each critique wrote a notice (notify_on_log_comment,
--   notify_on_list_comment, dispatch_notify_critique) and each notice was pushed: the member's phone
--   rang once a critique, the bell climbed into the thousands, and the notices table and pg_net's
--   queue grew at the script's speed.
--   Now, as round 13 paced follows and certifications (check_interaction_rate_limit, RH429):
--     · check_critique_pace, before a critique is filed on a record, a stack or a filing, keeps per
--       member, in one row of critique_budget read and written in one statement, a room to critique of
--       30, one more every 20 seconds (180 an hour, sustained), and 500 in a day (the house's UTC day);
--       and per member and piece, in interaction_churn ('critique:log:<id>', 'critique:list:<id>',
--       'critique:post:<id>'), 20 within an hour. Deleting a critique leaves the count as it was: they
--       are counted as they are filed.
--       A refusal says what it is and how long to wait, as the marks' does: SQLSTATE RH429, message
--       RATE_LIMITED, DETAIL 'member' (the member's own pace), 'day' (the day's 500, to the house's
--       midnight) or 'target' (that one piece), HINT the seconds to wait; it costs nothing (the
--       counters are written by the statement it rolls back).
--       A critique sent again whose first send landed (its answer lost, the phone's upsert by its own
--       id) is no new critique and is not counted; the house's own writes are not paced. The rule runs
--       after every other check of the insert, so a refusal for the member's standing, a block or a
--       piece gone is said as itself first.
--     · tg_notify_push sends a member's critiques to another member as one push an hour
--       ('critique_to:<recipient>' in certifications_pushed, renewed once the hour is out): a second
--       critique within the hour, on that piece or any other of theirs, is written under the bell,
--       unpushed. Keyed on the piece, a script critiquing thirty records at once still rang thirty
--       times, and 180 an hour at the pace. Every other push is as round 12 left it.
--   Salon messages write no notice and push nothing; their day's ceiling is H-A8's. The rule's
--   triggers are H-A3.locks'; its table is H-A3.table's.

-- add-only (1): no shipped client uses it: a trigger's function this piece makes, dropped first so it is made new (no grant it did not ask for), called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.check_critique_pace();
CREATE FUNCTION public.check_critique_pace() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_now      timestamptz := now();
  v_day      date := (now() AT TIME ZONE 'UTC')::date;
  v_target   text;
  v_again    boolean;
  v_tokens   real;
  v_count    integer;
  v_swept    timestamptz;
  v_n        integer;
  v_since    timestamptz;
  v_midnight integer := ceil(extract(epoch FROM ((v_day + 1)::timestamp AT TIME ZONE 'UTC') - v_now))::integer;
BEGIN
  -- The house's own writes are not paced: a member's request always carries the member.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- The piece critiqued, and whether this critique is already filed (sent again, its answer lost).
  IF TG_TABLE_NAME = 'log_comments' THEN
    v_target := 'critique:log:' || NEW.log_id::text;
    v_again := EXISTS (SELECT 1 FROM public.log_comments WHERE id = NEW.id);
  ELSIF TG_TABLE_NAME = 'list_comments' THEN
    v_target := 'critique:list:' || NEW.list_id::text;
    v_again := EXISTS (SELECT 1 FROM public.list_comments WHERE id = NEW.id);
  ELSIF TG_TABLE_NAME = 'dispatch_comments' THEN
    v_target := 'critique:post:' || NEW.post_id::text;
    v_again := EXISTS (SELECT 1 FROM public.dispatch_comments WHERE id = NEW.id);
  ELSE
    RETURN NEW;
  END IF;
  IF v_again THEN
    RETURN NEW;
  END IF;

  -- The member's room to critique, refilled for the time since, less this critique; and the day's
  -- count. One row, one statement: a member's critiques at the same moment wait on each other here.
  INSERT INTO public.critique_budget AS b (user_id, tokens, refilled_at, day, n, swept_at)
  VALUES (NEW.user_id, 29, v_now, v_day, 1, v_now)
  ON CONFLICT (user_id) DO UPDATE SET
    tokens      = LEAST(30, b.tokens + GREATEST(0, extract(epoch FROM v_now - b.refilled_at))::real / 20) - 1,
    refilled_at = GREATEST(b.refilled_at, v_now),
    day         = v_day,
    n           = (CASE WHEN b.day = v_day THEN b.n ELSE 0 END) + 1,
    swept_at    = CASE WHEN b.swept_at <= v_now - interval '1 hour' THEN v_now ELSE b.swept_at END
  RETURNING tokens, n, swept_at INTO v_tokens, v_count, v_swept;

  IF v_tokens < 0 THEN
    -- Twenty seconds for each critique short of one.
    RAISE EXCEPTION 'RATE_LIMITED' USING ERRCODE = 'RH429', DETAIL = 'member',
      HINT = GREATEST(1, ceil(-v_tokens * 20))::integer::text;
  END IF;
  IF v_count > 500 THEN
    -- The day's own word, so a ceiling met a minute before midnight is never told as a pace.
    RAISE EXCEPTION 'RATE_LIMITED' USING ERRCODE = 'RH429', DETAIL = 'day',
      HINT = GREATEST(1, v_midnight)::text;
  END IF;

  -- Once an hour, by their next critique, the member's critiques of pieces over an hour ago are let go.
  IF v_swept = v_now THEN
    DELETE FROM public.interaction_churn
     WHERE user_id = NEW.user_id AND target LIKE 'critique:%' AND since <= v_now - interval '1 hour';
  END IF;
  INSERT INTO public.interaction_churn AS c (user_id, target, since, n)
  VALUES (NEW.user_id, v_target, v_now, 1)
  ON CONFLICT (user_id, target) DO UPDATE SET
    since = CASE WHEN c.since <= v_now - interval '1 hour' THEN v_now ELSE c.since END,
    n     = CASE WHEN c.since <= v_now - interval '1 hour' THEN 1 ELSE c.n + 1 END
  RETURNING n, since INTO v_n, v_since;
  IF v_n > 20 THEN
    RAISE EXCEPTION 'RATE_LIMITED' USING ERRCODE = 'RH429', DETAIL = 'target',
      HINT = GREATEST(1, ceil(extract(epoch FROM v_since + interval '1 hour' - v_now)))::integer::text;
  END IF;

  RETURN NEW;
END $$;
-- add-only (1): no shipped client uses it: a trigger's function this piece makes, called by no client (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.check_critique_pace() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.certifications_pushed IS 'The house''s memory of the pushes sent for the acts one member may repeat at another at will: a certification (its notice''s group key, a critique''s by the critique), a follow or follow request (follow:<recipient>, renewed after 30 days), a request to enter a salon (salon_request:<salon>), a critique taken as the answer (answer:<critique>), a member''s critiques to another (critique_to:<recipient>, renewed after an hour). Written by tg_notify_push alone; no client reads or writes it.';

-- As round 12 left it, with a member's critiques to another pushed once within the hour.
-- add-only (3): it only fixes: every other notice is pushed as before, and a member's critiques to another member within an hour push that member's phone once, each still written under the bell; replayed as the members themselves (H-A3 rehearsal: two critiques on one record, one on another, another critic, an hour on)
CREATE OR REPLACE FUNCTION public.tg_notify_push() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_secret   text;
  v_pref_key text;
  v_thing    text;
BEGIN
  -- Switched off by the owner: every notice stays under the bell, unpushed.
  IF NOT coalesce((SELECT pushes_sent FROM public.house_settings WHERE id), true) THEN
    RETURN NEW;
  END IF;

  -- The Lobby's edition turns at 00:00 UTC, while much of the house sleeps:
  -- its notice waits under the bell and is never pushed.
  IF NEW.type = 'featured' THEN
    RETURN NEW;
  END IF;

  IF NEW.from_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = NEW.user_id      AND blocked_id = NEW.from_user_id)
       OR (blocker_id = NEW.from_user_id AND blocked_id = NEW.user_id AND type = 'block')
  ) THEN
    RETURN NEW;
  END IF;

  v_pref_key := CASE NEW.type
                  WHEN 'follow'         THEN 'notif_follows'
                  WHEN 'follow_request' THEN 'notif_follows'
                  WHEN 'follow_accept'  THEN 'notif_follows'
                  WHEN 'endorse'        THEN 'notif_endorsements'
                  WHEN 'endorse_log'    THEN 'notif_endorsements'
                  WHEN 'comment'        THEN 'notif_comments'
                  WHEN 'annotate'       THEN 'notif_comments'
                  WHEN 'ballot'         THEN 'notif_comments'
                  WHEN 'salon'          THEN 'notif_salons'
                  WHEN 'system'         THEN 'notif_system'
                  ELSE NULL
                END;

  IF v_pref_key IS NOT NULL THEN
    IF (SELECT preferences ->> v_pref_key
          FROM public.profiles
         WHERE id = NEW.user_id) = 'false'
    THEN
      RETURN NEW;
    END IF;
  END IF;

  -- An act one member may repeat at another at will buzzes the phone once: given again after it
  -- was taken back, its notice is written, and its push is not sent. Each is named as its notice
  -- names it: a certification of a critique by the critique (its group key is the filing's), every
  -- other certification by its group key; a follow or a follow request by the one followed; a
  -- request to enter a salon by the salon (an admission, sent by the host, is no request); a
  -- critique taken as the answer by the critique; any other critique by the member it is to, once
  -- within the hour, whatever piece it is on.
  IF NEW.from_user_id IS NOT NULL THEN
    v_thing := CASE
      WHEN NEW.type = 'endorse' THEN
        CASE WHEN NEW.metadata ? 'comment_id' THEN 'endorse:comment:' || (NEW.metadata ->> 'comment_id')
             ELSE NEW.group_key END
      WHEN NEW.type IN ('follow', 'follow_request') THEN 'follow:' || NEW.user_id
      WHEN NEW.type IN ('salon', 'system') AND NEW.related_lounge_id IS NOT NULL
           AND NEW.from_user_id IS DISTINCT FROM (SELECT l.creator_id FROM public.lounges l WHERE l.id = NEW.related_lounge_id)
        THEN 'salon_request:' || NEW.related_lounge_id
      WHEN NEW.type = 'comment' AND NEW.metadata ? 'answer' AND NEW.metadata ? 'comment_id'
        THEN 'answer:' || (NEW.metadata ->> 'comment_id')
      WHEN NEW.type = 'comment'
        THEN 'critique_to:' || NEW.user_id
      ELSE NULL
    END;
    IF v_thing IS NOT NULL AND char_length(v_thing) <= 200 THEN
      IF NEW.type IN ('follow', 'follow_request') THEN
        -- A follow is told again once a month has passed since it was last pushed.
        INSERT INTO public.certifications_pushed (from_user_id, user_id, thing)
        VALUES (NEW.from_user_id, NEW.user_id, v_thing)
        ON CONFLICT (from_user_id, thing) DO UPDATE SET pushed_at = now()
          WHERE public.certifications_pushed.pushed_at < now() - interval '30 days';
      ELSIF v_thing LIKE 'critique_to:%' THEN
        -- A member's critiques to another are told again once an hour has passed since one was last pushed.
        INSERT INTO public.certifications_pushed (from_user_id, user_id, thing)
        VALUES (NEW.from_user_id, NEW.user_id, v_thing)
        ON CONFLICT (from_user_id, thing) DO UPDATE SET pushed_at = now()
          WHERE public.certifications_pushed.pushed_at < now() - interval '1 hour';
      ELSE
        INSERT INTO public.certifications_pushed (from_user_id, user_id, thing)
        VALUES (NEW.from_user_id, NEW.user_id, v_thing)
        ON CONFLICT (from_user_id, thing) DO NOTHING;
      END IF;
      IF NOT FOUND THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'notify_push_secret' LIMIT 1;

  PERFORM net.http_post(
    url     := 'https://wihyqkpoymwcvbprslyz.supabase.co/functions/v1/notify-push',
    headers := jsonb_build_object('Content-Type','application/json','x-function-secret', v_secret),
    body    := jsonb_build_object('type','INSERT','table','notifications','record', to_jsonb(NEW))
  );
  RETURN NEW;
END;
$$;
