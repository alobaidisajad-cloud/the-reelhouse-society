-- Undo of 20261028_01_the_house_floor.sql: production's schema as it was before it.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- The push trigger as it was, with no switch to read.
CREATE OR REPLACE FUNCTION public.tg_notify_push() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_secret   text;
  v_pref_key text;
BEGIN
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


DROP TABLE public.house_settings;
