-- The undo of 20261015_07: each function's body, each grant and each policy as
-- it was, and the new triggers and functions gone. The data of section 9 stays:
-- each member's stated choice, and lists no client reads.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- 8.
DROP POLICY lounge_messages_hide_blocked ON public.lounge_messages;

-- 7.
CREATE OR REPLACE FUNCTION public.resolve_moderation_report_v2(p_report_id uuid, p_action text, p_admin_id uuid, p_reason text, p_duration_hours integer DEFAULT NULL::integer, p_notify_user boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_admin_id       uuid := auth.uid();
  v_target_user_id uuid;
  v_reporter_id    uuid;
  v_content_id     uuid;
  v_content_type   text;
  v_expires_at     timestamptz;
  v_notice         text;
  v_snapshot       jsonb;
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found or already resolved';
  END IF;

  IF v_target_user_id IS NULL AND p_action NOT IN ('dismiss', 'delete_content') THEN
    RAISE EXCEPTION 'That member has deleted their account. Only dismiss or delete_content remain.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_action IN ('suspend', 'mute_user') AND (p_duration_hours IS NULL OR p_duration_hours <= 0) THEN
    RAISE EXCEPTION 'A duration in hours is required for %', p_action USING ERRCODE = 'P0001';
  END IF;

  IF p_action = 'delete_content' AND v_content_type = 'profile' THEN
    RAISE EXCEPTION 'A profile is not content. Use ban or permanent_exile.' USING ERRCODE = 'P0001';
  END IF;

  IF p_duration_hours IS NOT NULL THEN
    v_expires_at := now() + (p_duration_hours || ' hours')::interval;
  END IF;

  IF p_action = 'delete_content' THEN
    v_snapshot := public.get_report_evidence(p_report_id);
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

    WHEN 'mute_user' THEN
      UPDATE profiles
      SET suspended_until = v_expires_at, suspension_reason = 'Muted: ' || p_reason
      WHERE id = v_target_user_id;

    WHEN 'delete_content' THEN
      CASE v_content_type
        WHEN 'log'             THEN DELETE FROM logs              WHERE id = v_content_id;
        WHEN 'list'            THEN DELETE FROM lists             WHERE id = v_content_id;
        WHEN 'log_comment'     THEN DELETE FROM log_comments      WHERE id = v_content_id;
        WHEN 'list_comment'    THEN DELETE FROM list_comments     WHERE id = v_content_id;
        WHEN 'dossier'         THEN DELETE FROM dispatch_dossiers WHERE id = v_content_id;
        WHEN 'dossier_comment' THEN DELETE FROM dossier_comments  WHERE id = v_content_id;
        WHEN 'dispatch_post'    THEN DELETE FROM dispatch_posts    WHERE id = v_content_id;
        WHEN 'dispatch_comment' THEN DELETE FROM dispatch_comments WHERE id = v_content_id;
        WHEN 'lounge_message' THEN
          UPDATE lounge_messages
             SET content = '', deleted_at = now()
           WHERE id = v_content_id;
        ELSE
          RAISE EXCEPTION 'Cannot remove content of type %', COALESCE(v_content_type, 'unknown')
            USING ERRCODE = 'P0001';
      END CASE;

    WHEN 'dismiss' THEN
      NULL;

    ELSE
      RAISE EXCEPTION 'Unknown moderation action: %', p_action USING ERRCODE = 'P0001';
  END CASE;

  INSERT INTO mod_actions (report_id, target_user_id, admin_id, action, reason,
                           duration_hours, expires_at, content_snapshot)
  VALUES (p_report_id, v_target_user_id, v_admin_id, p_action, p_reason,
          p_duration_hours, v_expires_at, v_snapshot);

  IF p_notify_user THEN
    INSERT INTO notifications (user_id, type, title, body, message, metadata)
    VALUES (
      v_reporter_id,
      'moderation',
      'Your Report Was Reviewed',
      'Thank you for looking after the house. Your report was reviewed, and the matter is settled.',
      'Thank you for looking after the house. Your report was reviewed, and the matter is settled.',
      jsonb_build_object('report_id', p_report_id, 'action', p_action)
    );

    IF p_action != 'dismiss' AND v_target_user_id IS NOT NULL THEN
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

-- 6.
CREATE OR REPLACE FUNCTION public.toggle_dossier_certify(dossier_uuid uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
    DECLARE already boolean;
    BEGIN
      SELECT EXISTS(SELECT 1 FROM public.dispatch_certifications
                     WHERE user_id = auth.uid() AND post_id = dossier_uuid) INTO already;
      IF already THEN
        DELETE FROM public.dispatch_certifications
         WHERE user_id = auth.uid() AND post_id = dossier_uuid;
        RETURN FALSE;
      ELSE
        INSERT INTO public.dispatch_certifications (user_id, post_id)
        VALUES (auth.uid(), dossier_uuid);
        RETURN TRUE;
      END IF;
    END $$;

-- 5.
DROP TRIGGER daily_ceiling ON public.error_logs;
DROP FUNCTION public.error_logs_daily_ceiling();
DROP INDEX public.error_logs_member_day;

-- 4.
ALTER POLICY "Users can insert analytics events" ON public.analytics_events
  WITH CHECK ((auth.role() = 'authenticated'::text));

-- 3.
GRANT EXECUTE ON FUNCTION
    public.can_annotate_log(p_actor uuid, p_log_id uuid),
    public.can_annotate_list(p_actor uuid, p_list_id uuid),
    public.can_endorse_content(p_actor uuid, p_type text, p_log_id uuid, p_list_id uuid)
  TO anon;

-- 2. The bodies that call a_block_stands_between first, then the function itself.
DROP TRIGGER refuse_across_a_block ON public.dispatch_comments;
DROP TRIGGER refuse_across_a_block ON public.dispatch_certifications;
DROP FUNCTION public.dispatch_refuses_across_a_block();

CREATE OR REPLACE FUNCTION public.enforce_privacy_on_follow() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_is_private BOOLEAN;
BEGIN
    IF NEW.type = 'follow' THEN
        SELECT is_social_private INTO v_is_private FROM public.profiles WHERE id = NEW.target_user_id;
        IF v_is_private THEN
            -- Automatically downgrade the 'follow' to a 'follow_request' at the database level.
            NEW.type := 'follow_request';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audience_allows(p_actor uuid, p_owner uuid, p_pref text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT CASE
    WHEN p_owner IS NULL THEN TRUE
    WHEN p_actor = p_owner THEN TRUE
    WHEN COALESCE(p_pref, 'everyone') = 'everyone' THEN TRUE
    WHEN COALESCE(p_pref, 'everyone') = 'nobody' THEN FALSE
    ELSE EXISTS (SELECT 1 FROM public.interactions
                 WHERE type = 'follow' AND user_id = p_actor AND target_user_id = p_owner)
  END;
$$;

DROP FUNCTION public.a_block_stands_between(uuid, uuid);

-- 1.
CREATE OR REPLACE FUNCTION public.rate_limit_check(table_name text, user_col text, max_count integer, window_minutes integer DEFAULT 1440) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    current_count INTEGER;
BEGIN
    EXECUTE format(
        'SELECT COUNT(*) FROM %I WHERE %I = auth.uid() AND created_at > now() - interval ''%s minutes''',
        table_name, user_col, window_minutes
    ) INTO current_count;
    RETURN current_count < max_count;
END;
$$;
