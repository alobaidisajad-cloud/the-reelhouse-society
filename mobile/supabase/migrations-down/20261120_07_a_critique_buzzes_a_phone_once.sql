-- Undo of 20261120_07: a member's critiques are paced as a person writes, and a critique buzzes a phone once, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A3 undone · critiques unpaced, each pushed (run after H-A3.locks.down, which drops the triggers) ──
-- add-only (1): no shipped client uses it: a trigger's function round 14 made, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.check_critique_pace();
DELETE FROM public.certifications_pushed WHERE thing LIKE 'critique_to:%';
DELETE FROM public.interaction_churn WHERE target LIKE 'critique:%';
COMMENT ON TABLE public.certifications_pushed IS 'The house''s memory of the pushes sent for the acts one member may repeat at another at will: a certification (its notice''s group key, a critique''s by the critique), a follow or follow request (follow:<recipient>, renewed after 30 days), a request to enter a salon (salon_request:<salon>), a critique taken as the answer (answer:<critique>). Written by tg_notify_push alone; no client reads or writes it.';

-- tg_notify_push as 20261118_01 left it: every critique pushed.
-- add-only (3): it only fixes: the undo puts back round 12's definition whole (H-A3 undone)
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
  -- critique taken as the answer by the critique.
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
      ELSE NULL
    END;
    IF v_thing IS NOT NULL AND char_length(v_thing) <= 200 THEN
      IF NEW.type IN ('follow', 'follow_request') THEN
        -- A follow is told again once a month has passed since it was last pushed.
        INSERT INTO public.certifications_pushed (from_user_id, user_id, thing)
        VALUES (NEW.from_user_id, NEW.user_id, v_thing)
        ON CONFLICT (from_user_id, thing) DO UPDATE SET pushed_at = now()
          WHERE public.certifications_pushed.pushed_at < now() - interval '30 days';
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
