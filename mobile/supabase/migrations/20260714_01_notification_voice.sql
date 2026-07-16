-- ─────────────────────────────────────────────────────────────────────────────
-- 20260714_01_notification_voice
--
-- The notification system, made understandable and complete. Rewritten from
-- LIVE function definitions (fetched 2026-07-14), not the stale baseline.
--
-- FIXES (wording — the user literally could not understand a push):
--   • follow: "started following your frequency." (radio-drama drift) → "is following you."
--   • follow_request: → "is at your door — asking to follow you." (matches the
--     app's own At-the-Door feature language)
--   • endorse_log: "certified your dossier 🏆" (emoji banned by design law; a
--     LOG is not a dossier; no film named) → "certified your log of {film}."
--   • list comment: "penned a critique on your curated list ¶" (stray ¶; the
--     app calls them STACKS; no title) → 'left a critique on your stack "{title}".'
--   • log comment: polished + consistent verb.
--
-- GAPS CLOSED (actions that notified NOBODY):
--   • endorse_list — the app's MOST-USED endorsement (15 call sites) was
--     silent. Now: 'certified your stack "{title}".'
--   • dossier certifications — new trigger on dossier_certifications.
--   • dossier critiques — new trigger on dossier_comments.
--
-- BUG FIXED: moderation notices were written to title/body only, but the
--   client renders ONLY the message column → tribunal outcomes were invisible
--   in-app. Now message (and body) carry humane house-voice sentences.
--   Live-only actions delete_content / mute_user preserved.
--
-- DELIBERATE: declines stay silent (kindness); lounge chat stays badge-only
--   (a digest/mute push is a post-launch feature). Un-endorse does not retract
--   the notice (consistent with existing behavior).
--
-- All SECURITY DEFINER + pinned search_path (notify_on_interaction previously
-- lacked the pin — hardened here). Client needs ZERO changes: new rows reuse
-- the 'endorse'/'comment' types it already renders.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1 · Interactions: follow / follow_request / endorse_log / endorse_list
CREATE OR REPLACE FUNCTION public.notify_on_interaction()
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
        SELECT user_id, film_title INTO target_user, v_title FROM public.logs WHERE id = NEW.target_log_id;
        IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
            INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
            VALUES (target_user, 'endorse', sender_user, NEW.user_id,
                    'certified your log of ' || COALESCE(v_title, 'a film') || '.');
        END IF;

    ELSIF NEW.type = 'endorse_list' THEN
        SELECT user_id, title INTO target_user, v_title FROM public.lists WHERE id = NEW.target_list_id;
        IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
            INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
            VALUES (target_user, 'endorse', sender_user, NEW.user_id,
                    'certified your stack “' || COALESCE(v_title, 'Untitled') || '”.');
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- 2 · Log critiques
CREATE OR REPLACE FUNCTION public.notify_on_log_comment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    target_user UUID;
    sender_user TEXT;
    target_film_title TEXT;
BEGIN
    SELECT username INTO sender_user FROM public.profiles WHERE id = NEW.user_id;
    SELECT user_id, film_title INTO target_user, target_film_title FROM public.logs WHERE id = NEW.log_id;

    IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
        INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
        VALUES (target_user, 'comment', sender_user, NEW.user_id,
                'left a critique on your log of ' || COALESCE(target_film_title, 'a film') || '.');
    END IF;

    RETURN NEW;
END;
$$;

-- 3 · Stack critiques (now with the stack's title)
CREATE OR REPLACE FUNCTION public.notify_on_list_comment()
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
    SELECT user_id, title INTO target_user, v_title FROM public.lists WHERE id = NEW.list_id;

    IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
        INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
        VALUES (target_user, 'comment', sender_user, NEW.user_id,
                'left a critique on your stack “' || COALESCE(v_title, 'Untitled') || '”.');
    END IF;

    RETURN NEW;
END;
$$;

-- 4 · NEW: dossier certifications (previously silent)
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
        INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
        VALUES (target_user, 'endorse', sender_user, NEW.user_id,
                'certified your dossier “' || COALESCE(v_title, 'Untitled') || '”.');
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_dossier_certify_notify ON public.dossier_certifications;
CREATE TRIGGER on_dossier_certify_notify
AFTER INSERT ON public.dossier_certifications
FOR EACH ROW EXECUTE FUNCTION public.notify_on_dossier_certify();

-- 5 · NEW: dossier critiques (previously silent)
CREATE OR REPLACE FUNCTION public.notify_on_dossier_comment()
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
        INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
        VALUES (target_user, 'comment', sender_user, NEW.user_id,
                'left a critique on your dossier “' || COALESCE(v_title, 'Untitled') || '”.');
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_dossier_comment_notify ON public.dossier_comments;
CREATE TRIGGER on_dossier_comment_notify
AFTER INSERT ON public.dossier_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_on_dossier_comment();

-- 6 · The house's notices — humane, and finally VISIBLE in-app
--     (message column filled; live-only actions delete_content/mute_user kept)
CREATE OR REPLACE FUNCTION public.resolve_moderation_report_v2(
  p_report_id uuid, p_action text, p_admin_id uuid, p_reason text,
  p_duration_hours integer DEFAULT NULL::integer, p_notify_user boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_target_user_id uuid;
  v_reporter_id uuid;
  v_content_id uuid;
  v_content_type text;
  v_expires_at timestamptz;
  v_notice text;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT target_user_id, reporter_id, content_id, content_type
  INTO v_target_user_id, v_reporter_id, v_content_id, v_content_type
  FROM reports
  WHERE id = p_report_id AND status = 'pending';

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Report not found or already resolved';
  END IF;

  IF p_action = 'suspend' AND p_duration_hours IS NOT NULL THEN
    v_expires_at := now() + (p_duration_hours || ' hours')::interval;
  END IF;

  UPDATE reports
  SET status = 'resolved',
      resolved_at = now(),
      resolved_by = v_admin_id,
      resolution_action = p_action
  WHERE id = p_report_id;

  CASE p_action
    WHEN 'warn' THEN
      INSERT INTO warnings (user_id, admin_id, reason)
      VALUES (v_target_user_id, v_admin_id, p_reason);
      UPDATE profiles SET warning_count = warning_count + 1
      WHERE id = v_target_user_id;

    WHEN 'suspend' THEN
      UPDATE profiles
      SET suspended_until = v_expires_at, suspension_reason = p_reason
      WHERE id = v_target_user_id;

    WHEN 'ban' THEN
      UPDATE profiles
      SET is_banned = true, banned_at = now(), suspension_reason = p_reason
      WHERE id = v_target_user_id;

    WHEN 'permanent_exile' THEN
      UPDATE profiles
      SET is_banned = true, banned_at = now(), suspension_reason = 'PERMANENT EXILE: ' || p_reason
      WHERE id = v_target_user_id;

    WHEN 'delete_content' THEN
      NULL;

    WHEN 'mute_user' THEN
      UPDATE profiles
      SET suspended_until = v_expires_at, suspension_reason = 'Muted: ' || p_reason
      WHERE id = v_target_user_id;

    WHEN 'dismiss' THEN
      NULL;
  END CASE;

  INSERT INTO mod_actions (report_id, target_user_id, admin_id, action, reason, duration_hours, expires_at)
  VALUES (p_report_id, v_target_user_id, v_admin_id, p_action, p_reason, p_duration_hours, v_expires_at);

  IF p_notify_user THEN
    -- To the member who reported: gratitude + closure (no outcome broadcast).
    INSERT INTO notifications (user_id, type, title, body, message, metadata)
    VALUES (
      v_reporter_id,
      'moderation',
      'Your Report Was Reviewed',
      'Thank you for looking after the house. Your report was reviewed, and the matter is settled.',
      'Thank you for looking after the house. Your report was reviewed, and the matter is settled.',
      jsonb_build_object('report_id', p_report_id, 'action', p_action)
    );

    IF p_action != 'dismiss' THEN
      v_notice := CASE p_action
        WHEN 'warn' THEN 'After reviewing a report, the house has issued a formal warning.'
        WHEN 'suspend' THEN 'After reviewing a report, the house has paused your membership for ' || COALESCE(p_duration_hours::text, 'a number of') || ' hours.'
        WHEN 'mute_user' THEN 'After reviewing a report, the house has muted your account for a time.'
        WHEN 'ban' THEN 'After reviewing a report, the house has closed your membership until further notice.'
        WHEN 'permanent_exile' THEN 'After reviewing a report, the house has permanently closed your membership.'
        WHEN 'delete_content' THEN 'After reviewing a report, the house has removed a piece of your content.'
        ELSE 'The house has reviewed a report concerning your account.'
      END || ' Reason: ' || p_reason;

      INSERT INTO notifications (user_id, type, title, body, message, metadata)
      VALUES (
        v_target_user_id,
        'moderation',
        'A Notice from the House',
        v_notice,
        v_notice,
        jsonb_build_object('action', p_action, 'reason', p_reason, 'expires_at', v_expires_at)
      );
    END IF;
  END IF;
END;
$$;
