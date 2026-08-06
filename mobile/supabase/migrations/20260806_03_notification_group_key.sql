-- ════════════════════════════════════════════════════════════════════════════════
-- #73 · Notification grouping has never once worked
-- ════════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
--
-- ── WHAT IS WRONG ─────────────────────────────────────────────────────────────
-- The client collapses repeated endorsements into one row. It identified a group two
-- ways and BOTH are dead:
--
--   1. by `film_id` — this trigger has never written that column
--   2. by reading the message with /your review of (.+)$/ — while this trigger writes
--      'certified your log of Metropolis.'
--
-- `20260714_01_notification_voice` rewrote the copy because "the user literally could
-- not understand a push", and disabled grouping in passing: nothing connected the
-- wording to the parser. Every endorsement has rendered as its own row ever since.
--
-- ── WHY A KEY, AND NOT JUST film_id ───────────────────────────────────────────
-- THREE actions write an `endorse` notification: certifying a log, a stack, or a
-- dossier. Only logs have a film. Populating `film_id` alone would have fixed one third
-- and left stacks and dossiers permanently ungrouped — the same complaint, moved.
--
-- `group_key` carries the KIND and the TARGET's id, which is enough for the client to
-- group them, label them, and route a tap to the right screen. Identity is DECLARED by
-- the writer, so a future copy edit can never silently disable grouping again — which
-- is exactly how it was disabled the first time.
--
-- Shape:  endorse:log:<log uuid>  ·  endorse:list:<list uuid>  ·  endorse:dossier:<uuid>
--
-- ── WHAT ELSE IS POPULATED, AND WHY IT IS SEPARATE ────────────────────────────
--   `title`       — the certified thing's name, for the group's label. The client used
--                   to parse this out of the message; that is the bug. Nothing in the
--                   app reads this column today (verified), and the push function
--                   composes its banner from a per-type table plus `message`, never
--                   from `title` — so writing it cannot change what members receive.
--   `film_id`,
--   `poster_path` — presentation only: the group's thumbnail and its tap target. Log
--                   endorsements only; the other two kinds have no film.
--
-- Identity and presentation are deliberately different columns. Using a display field
-- as an identity is the same category error as parsing prose.
--
-- ── NO BACKFILL IS POSSIBLE, AND THAT IS DELIBERATE ───────────────────────────
-- An existing notification row does not record which log, stack or dossier it was
-- about. The only way to recover it would be to match the film name out of the message
-- text — the precise mechanism that broke this feature. Rows created from now on will
-- group; rows already present stay individual until they are dismissed.
--
-- ── EVERY OTHER BRANCH IS BYTE-FOR-BYTE UNCHANGED ─────────────────────────────
-- follow, follow_request and all three comment/critique triggers are reproduced exactly
-- as `20260714_01` left them. Only the three `endorse` producers gain columns.
-- ════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1 · the column ────────────────────────────────────────────────────────────
-- Nullable and additive. The client's Zod schema strips unknown keys rather than
-- rejecting them, so the build already on TestFlight ignores this safely.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS group_key text;

COMMENT ON COLUMN public.notifications.group_key IS
  'Stable grouping identity declared by the writing trigger, e.g. endorse:log:<uuid>. '
  'The client groups on this and never infers identity from the message text (#73).';

-- ── 2 · interactions: log and stack endorsements ──────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_interaction()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    target_user UUID;
    sender_user TEXT;
    v_title TEXT;
    v_film_id BIGINT;
    v_poster TEXT;
BEGIN
    SELECT username INTO sender_user FROM public.profiles WHERE id = NEW.user_id;

    IF NEW.type = 'follow' THEN
        target_user := NEW.target_user_id;
        IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
            INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
            VALUES (target_user, 'follow', sender_user, NEW.user_id, 'is following you.');
        END IF;

    ELSIF NEW.type = 'follow_request' THEN
        target_user := NEW.target_user_id;
        IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
            INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
            VALUES (target_user, 'follow_request', sender_user, NEW.user_id, 'is at your door — asking to follow you.');
        END IF;

    ELSIF NEW.type = 'endorse_log' THEN
        -- Widened to carry the film. The row was already being read; these three columns
        -- come from the same SELECT, so there is no extra query on this path.
        SELECT user_id, film_title, film_id, poster_path
          INTO target_user, v_title, v_film_id, v_poster
          FROM public.logs WHERE id = NEW.target_log_id;
        IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
            INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message,
                                              group_key, title, film_id, poster_path)
            VALUES (target_user, 'endorse', sender_user, NEW.user_id,
                    'certified your log of ' || COALESCE(v_title, 'a film') || '.',
                    'endorse:log:' || NEW.target_log_id, v_title, v_film_id, v_poster);
        END IF;

    ELSIF NEW.type = 'endorse_list' THEN
        SELECT user_id, title INTO target_user, v_title FROM public.lists WHERE id = NEW.target_list_id;
        IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
            INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message,
                                              group_key, title)
            VALUES (target_user, 'endorse', sender_user, NEW.user_id,
                    'certified your stack “' || COALESCE(v_title, 'Untitled') || '”.',
                    'endorse:list:' || NEW.target_list_id, v_title);
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- ── 3 · dossier certifications ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_dossier_certify()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    target_user UUID;
    sender_user TEXT;
    v_title TEXT;
BEGIN
    SELECT username INTO sender_user FROM public.profiles WHERE id = NEW.user_id;
    SELECT user_id, title INTO target_user, v_title FROM public.dispatch_dossiers WHERE id = NEW.dossier_id;

    IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
        INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message,
                                          group_key, title)
        VALUES (target_user, 'endorse', sender_user, NEW.user_id,
                'certified your dossier “' || COALESCE(v_title, 'Untitled') || '”.',
                'endorse:dossier:' || NEW.dossier_id, v_title);
    END IF;

    RETURN NEW;
END;
$$;

-- ── 4 · refuse to commit a half-applied change ────────────────────────────────
-- A migration that reports success while having changed nothing is how #73 survived a
-- full audit in the first place.
DO $$
DECLARE missing text := '';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'group_key'
  ) THEN
    missing := missing || ' notifications.group_key';
  END IF;

  -- Each endorse producer must now write the key. Checked against the function source
  -- so a partially-applied edit cannot pass.
  IF (SELECT prosrc FROM pg_proc WHERE proname = 'notify_on_interaction'
       AND pronamespace = 'public'::regnamespace) NOT LIKE '%endorse:log:%'
  THEN missing := missing || ' notify_on_interaction(log)'; END IF;

  IF (SELECT prosrc FROM pg_proc WHERE proname = 'notify_on_interaction'
       AND pronamespace = 'public'::regnamespace) NOT LIKE '%endorse:list:%'
  THEN missing := missing || ' notify_on_interaction(list)'; END IF;

  IF (SELECT prosrc FROM pg_proc WHERE proname = 'notify_on_dossier_certify'
       AND pronamespace = 'public'::regnamespace) NOT LIKE '%endorse:dossier:%'
  THEN missing := missing || ' notify_on_dossier_certify'; END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION 'Not fully applied —%. NOTHING has been changed; the whole script rolled back.', missing;
  END IF;

  RAISE NOTICE 'OK — all three endorsement kinds now declare a grouping key.';
END $$;

COMMIT;
