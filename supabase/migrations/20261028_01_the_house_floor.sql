-- ════════════════════════════════════════════════════════════════════════════
-- 20261028_01 — the house's floor, and its two off-switches.
-- ════════════════════════════════════════════════════════════════════════════
--   1. house_settings, one row: the lowest native build each platform may run
--      (iOS buildNumber, Android versionCode; never `version`, 1.0.0 for every
--      build). A build under it shows "please update" and nothing else. 0, the
--      start, turns no build away. Anyone may read the two floors, signed in or
--      not, since the screen comes before any sign-in; no one may write them but
--      the house (the dashboard, as the owner).
--   2. two named off-switches, for the two things that can do harm at scale and
--      cannot wait for a build: pushes_sent (every notice's push, which the
--      notifications trigger hands to notify-push) and films_synced (sync-films,
--      the catalogue's pull from TMDB, which any member's visit can start). Both
--      on; switched off by the owner in the dashboard, read by the house alone.
--      No general flag system (WORKLIST P3.9, OWNER-2026-10-15).
-- Undo: mobile/supabase/migrations-down/20261028_01_the_house_floor.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── 1. The floor ────────────────────────────────────────────────────────────
CREATE TABLE public.house_settings (
    id boolean DEFAULT true NOT NULL,
    min_build_ios integer DEFAULT 0 NOT NULL,
    min_build_android integer DEFAULT 0 NOT NULL,
    pushes_sent boolean DEFAULT true NOT NULL,
    films_synced boolean DEFAULT true NOT NULL,
    CONSTRAINT house_settings_pkey PRIMARY KEY (id),
    -- One row: the house has one floor.
    CONSTRAINT house_settings_one_row CHECK (id),
    CONSTRAINT house_settings_min_build_ios_whole CHECK (min_build_ios >= 0),
    CONSTRAINT house_settings_min_build_android_whole CHECK (min_build_android >= 0)
);
INSERT INTO public.house_settings DEFAULT VALUES;

ALTER TABLE public.house_settings ENABLE ROW LEVEL SECURITY;
-- add-only (1): no shipped client uses it: a table this migration makes, named by no client before it (TestFlight build 41 and the website checked)
REVOKE ALL ON public.house_settings FROM anon, authenticated;
-- The floors and the row's key, to everyone: the switches are the house's to read.
GRANT SELECT (id, min_build_ios, min_build_android) ON public.house_settings TO anon, authenticated;
CREATE POLICY "the floor is read by everyone" ON public.house_settings
    FOR SELECT TO anon, authenticated USING (true);

-- ── 2. pushes_sent: every notice's push, stopped at its door ────────────────
-- As live, with one step first: the switch off, the notice waits under the bell
-- and is never pushed (as a featured notice already is).
-- add-only (2): an equal rewrite while the switch is on, its default; the attack matrix the same before and after
CREATE OR REPLACE FUNCTION public.tg_notify_push() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_secret   text;
  v_pref_key text;
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
