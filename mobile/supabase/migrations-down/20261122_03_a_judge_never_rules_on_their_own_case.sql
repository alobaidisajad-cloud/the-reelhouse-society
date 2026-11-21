-- Undo of 20261122_03: a moderator never rules on a case about themselves, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- The two functions as 20261120_32 and 20261120_29 left them.
-- add-only (3): it only fixes: the undo puts back round 14's definitions whole
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
  v_kept           jsonb;
  v_rows           integer;
  v_held_until     timestamptz;
  v_held_banned    boolean;
  v_action_id      uuid;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;

  -- Read pending and locked: a second verdict given at the same moment waits here for the first,
  -- then reads the case again as the first left it, no longer pending, and is refused.
  SELECT target_user_id, reporter_id, content_id, content_type
  INTO v_target_user_id, v_reporter_id, v_content_id, v_content_type
  FROM reports
  WHERE id = p_report_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ALREADY_JUDGED' USING ERRCODE = 'P0002';
  END IF;

  IF v_target_user_id IS NULL AND p_action NOT IN ('dismiss', 'delete_content') THEN
    RAISE EXCEPTION 'That member has deleted their account. Only dismiss or delete_content remain.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_action IN ('suspend', 'mute_user') AND (p_duration_hours IS NULL OR p_duration_hours <= 0) THEN
    RAISE EXCEPTION 'A duration in hours is required for %', p_action USING ERRCODE = 'P0001';
  END IF;

  IF p_duration_hours IS NOT NULL THEN
    v_expires_at := now() + (p_duration_hours || ' hours')::interval;
  END IF;

  -- The copy of what a removal takes: the piece as it stands (piece_as_it_stands), and, where its row
  -- stays to be put back (a salon message struck through, a filing emptied, a page's or a salon's words
  -- cleared), the fields that put it back, should the removal be overturned on appeal.
  IF p_action = 'delete_content' THEN
    v_snapshot := public.piece_as_it_stands(v_content_type, v_content_id);
    -- A log, a stack, a critique and a filing are withheld whole (H-B10), so need nothing kept to put them back.
    v_kept := CASE v_content_type
      WHEN 'lounge_message' THEN (SELECT jsonb_build_object('content', content) FROM lounge_messages WHERE id = v_content_id)
      WHEN 'profile' THEN (SELECT jsonb_build_object('bio', bio, 'display_name', display_name, 'avatar_url', avatar_url,
                                   'social_links', social_links) FROM profiles WHERE id = v_content_id)
      WHEN 'lounge' THEN (SELECT jsonb_build_object('name', name, 'description', description, 'cover_image', cover_image)
                            FROM lounges WHERE id = v_content_id)
    END;
    v_snapshot := v_snapshot || jsonb_build_object('type', v_content_type, 'id', v_content_id)
               || CASE WHEN v_kept IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('kept', v_kept) END;
  END IF;

  -- Closed only while still pending: the lock above holds it so, and this says so as well.
  UPDATE reports
  SET status = 'resolved',
      resolved_at = now(),
      resolved_by = v_admin_id,
      resolution_action = p_action
  WHERE id = p_report_id AND status = 'pending';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'ALREADY_JUDGED' USING ERRCODE = 'P0002';
  END IF;

  CASE p_action
    WHEN 'warn' THEN
      INSERT INTO warnings (user_id, admin_id, reason)
      VALUES (v_target_user_id, v_admin_id, p_reason);
      UPDATE profiles SET warning_count = warning_count + 1
      WHERE id = v_target_user_id;

    WHEN 'suspend', 'mute_user' THEN
      -- The later end stands: a shorter sentence given after a longer one never cuts it short. The
      -- member's page carries the reason of the sentence that governs (a ban's, while one stands).
      SELECT suspended_until, coalesce(is_banned, false) INTO v_held_until, v_held_banned
        FROM profiles WHERE id = v_target_user_id FOR UPDATE;
      UPDATE profiles
      SET suspended_until = GREATEST(suspended_until, v_expires_at),
          suspension_reason = CASE
            WHEN v_held_banned OR (v_held_until IS NOT NULL AND v_held_until >= v_expires_at) THEN suspension_reason
            WHEN p_action = 'mute_user' THEN 'Muted: ' || p_reason
            ELSE p_reason END
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
      -- Whether the piece still stands, asked of the tables that hold it before anything is taken:
      -- a filing is never deleted, only emptied (dispatch_no_hard_delete answers its DELETE with no
      -- row), and a legacy essay or critique is removed through a view, so a removal's own row
      -- count cannot say. A piece already gone took nothing: nothing is recorded or told, and the
      -- case stays pending (the raise undoes the close above).
      IF NOT public.piece_stands(v_content_type, v_content_id) THEN
        RAISE EXCEPTION 'PIECE_GONE' USING ERRCODE = 'P0002';
      END IF;
      -- A log, a stack, a critique or a filing is withheld whole, once the verdict's row names it (below):
      -- read by its author and the Tribunal alone until its appeal is upheld or 30 days pass unappealed,
      -- and only then deleted as before; given back whole if the verdict is overturned (H-B10).
      CASE
        WHEN public.withheld_kind(v_content_type) IS NOT NULL THEN
          NULL;
        WHEN v_content_type = 'lounge_message' THEN
          UPDATE lounge_messages
             SET content = '', deleted_at = now()
           WHERE id = v_content_id AND deleted_at IS NULL;
        -- A page is a member's, not a piece: what is taken is what they wrote on it, never the page.
        -- Its words, the name it shows, its picture and its links; its handle stays (a ban answers that).
        WHEN v_content_type = 'profile' THEN
          UPDATE profiles
             SET bio = NULL, display_name = NULL, avatar_url = NULL, social_links = '{}'::jsonb
           WHERE id = v_content_id;
        -- A salon is a place: what is taken is what it is called and shows, never its rooms or the
        -- words members left in it.
        WHEN v_content_type = 'lounge' THEN
          UPDATE lounges
             SET name = 'An Unnamed Salon', description = '', cover_image = NULL
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
          p_duration_hours, v_expires_at, v_snapshot)
  RETURNING id INTO v_action_id;

  -- Withheld under the verdict that names it, which keys its register (H-B10).
  IF p_action = 'delete_content' AND public.withheld_kind(v_content_type) IS NOT NULL THEN
    PERFORM public.withhold_piece(v_action_id, public.withheld_kind(v_content_type), v_content_id);
  END IF;

  IF p_notify_user THEN
    IF v_reporter_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, body, message, metadata)
      VALUES (
        v_reporter_id,
        'moderation',
        'Your Report Was Reviewed',
        'Thank you for looking after the house. Your report was reviewed, and the matter is settled.',
        'Thank you for looking after the house. Your report was reviewed, and the matter is settled.',
        jsonb_build_object('report_id', p_report_id, 'action', p_action)
      );
    END IF;

    IF p_action != 'dismiss' AND v_target_user_id IS NOT NULL THEN
      v_notice := CASE p_action
        WHEN 'warn' THEN 'After reviewing a report, the house has issued a formal warning.'
        WHEN 'suspend' THEN 'After reviewing a report, the house has paused your membership for ' || COALESCE(p_duration_hours::text, 'a number of') || ' hours.'
        WHEN 'mute_user' THEN 'After reviewing a report, the house has muted your account for a time.'
        WHEN 'ban' THEN 'After reviewing a report, the house has closed your membership until further notice.'
        WHEN 'permanent_exile' THEN 'After reviewing a report, the house has permanently closed your membership.'
        WHEN 'delete_content' THEN CASE v_content_type
          WHEN 'profile' THEN 'After reviewing a report, the house has cleared the words and picture on your page.'
          WHEN 'lounge' THEN 'After reviewing a report, the house has cleared the name, description and cover of your salon.'
          WHEN 'lounge_message' THEN 'After reviewing a report, the house has removed a piece of your content.'
          ELSE 'After reviewing a report, the house has withheld a piece of your content: no one but you can see it. '
               || 'It is kept whole for 30 days, and until your appeal is heard if you appeal; unappealed, it is deleted then. '
               || 'Open this notice in the current app to read the verdict whole, the day and hour it is kept until, and to appeal.' END
        ELSE 'The house has reviewed a report concerning your account.'
      END
      -- A shorter sentence than the one standing: the member is told the longer one stands, and to when.
      || CASE WHEN p_action IN ('suspend', 'mute_user') AND NOT v_held_banned
                   AND v_held_until IS NOT NULL AND v_held_until >= v_expires_at
              THEN ' The longer pause already in place stands, to '
                   || to_char(v_held_until AT TIME ZONE 'UTC', 'DD Mon YYYY HH24:MI "UTC"') || '.'
              ELSE '' END
      || ' Reason: ' || p_reason;

      INSERT INTO notifications (user_id, type, title, body, message, metadata)
      VALUES (
        v_target_user_id,
        'moderation',
        'A Notice from the House',
        v_notice,
        v_notice,
        jsonb_build_object('action', p_action, 'reason', p_reason, 'expires_at', v_expires_at, 'mod_action_id', v_action_id)
      );
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_dismiss_reports(p_report_ids uuid[], p_admin_id uuid, p_reason text DEFAULT 'Bulk dismissed'::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_count int;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;

  WITH dismissed AS (
    UPDATE reports
       SET status = 'resolved', resolved_at = now(), resolved_by = v_admin_id, resolution_action = 'dismiss'
     WHERE id = ANY(p_report_ids) AND status = 'pending'
    RETURNING id, target_user_id, reporter_id
  ), recorded AS (
    INSERT INTO mod_actions (report_id, target_user_id, admin_id, action, reason)
    SELECT d.id, d.target_user_id, v_admin_id, 'dismiss', p_reason FROM dismissed d
    RETURNING report_id
  ), told AS (
    -- Each reporter told as a single dismissal tells them (resolve_moderation_report_v2).
    INSERT INTO notifications (user_id, type, title, body, message, metadata)
    SELECT d.reporter_id, 'moderation', 'Your Report Was Reviewed',
           'Thank you for looking after the house. Your report was reviewed, and the matter is settled.',
           'Thank you for looking after the house. Your report was reviewed, and the matter is settled.',
           jsonb_build_object('report_id', d.id, 'action', 'dismiss')
      FROM dismissed d
     WHERE d.reporter_id IS NOT NULL
  )
  SELECT count(*) INTO v_count FROM recorded;

  RETURN v_count;
END;
$$;
