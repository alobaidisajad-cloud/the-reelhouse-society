-- ============================================================================
-- BATCH 28 · moderation that actually does something
-- ============================================================================
--
-- Verified against production before writing a line of this:
--
--   `delete_content` in resolve_moderation_report_v2 is literally `NULL`. The
--   report is marked resolved and the author is notified "the house has removed
--   a piece of your content" — and nothing is removed. The notice is a lie.
--
--   `mute_user` sets suspended_until = v_expires_at, but v_expires_at is only
--   assigned when p_action = 'suspend'. So a mute sets it to NULL: the member is
--   told they were muted, nothing happens, and if they were ALREADY suspended
--   the suspension is CLEARED. Worse than a no-op.
--
--   `suspend` with no duration does the same: no suspension, and a notice saying
--   membership was paused "for a number of hours".
--
-- All three are unreachable from the mobile Tribunal, which validates first and
-- offers no button for the other two. They are dead code that lies when reached,
-- and the fix is to make them honest rather than silent.
--
-- ── WHAT IS ACTUALLY LIVE AND BROKEN ────────────────────────────────────────
-- The WEB Tribunal never calls this function. It writes tables directly, and
-- ONLY ONE TABLE IN THE DATABASE lets a moderator touch another member's row
-- (dossier_comments). So on the web:
--
--   dismiss        works    (reports has an admins_update_reports policy)
--   ban            DOES NOTHING — profiles is `USING (auth.uid() = id)` with no
--                  admin override, so the row is invisible to the update: zero
--                  rows, NO error, then "User has been silenced from The Society."
--   delete content DOES NOTHING — same reason, and it only attempts 3 of the 8
--                  content types; the other 5 are skipped and still reported as
--                  "Content destroyed."
--
-- That is fixed by pointing the web at THIS function (SECURITY DEFINER, so it
-- runs with the rights RLS denies the caller) rather than by loosening RLS.
-- Granting moderators write access to every member's row would be a far larger
-- hole than the one being closed.
--
-- ── EVIDENCE ────────────────────────────────────────────────────────────────
-- Deleting the content destroys the report's evidence: get_report_evidence looks
-- the row up live and returns found:false once it is gone. An appeal, or a second
-- moderator reviewing the history, would have nothing to look at. So the exhibit
-- is copied into the audit record BEFORE the delete — by calling
-- get_report_evidence itself, so the content-type mapping lives in exactly one
-- place and cannot drift from the one the Tribunal displays.
-- ============================================================================

-- ── The exhibit, kept with the action that removed it ────────────────────────
ALTER TABLE public.mod_actions
  ADD COLUMN IF NOT EXISTS content_snapshot jsonb;

-- Batch 27's rule: every text/jsonb column carries a ceiling. This one is not in
-- the coverage test's schema snapshot, so it would otherwise go unbounded and
-- unnoticed — the snapshot is a photograph, and a column added by SQL is
-- invisible to it.
ALTER TABLE public.mod_actions DROP CONSTRAINT IF EXISTS mod_actions_content_snapshot_len;
ALTER TABLE public.mod_actions
  ADD CONSTRAINT mod_actions_content_snapshot_len
  CHECK (char_length(content_snapshot::text) <= 30000);

COMMENT ON COLUMN public.mod_actions.content_snapshot IS
  'What was removed, captured before deletion. Without it an appeal has nothing to look at, because get_report_evidence resolves the row live and returns found:false once it is gone.';


CREATE OR REPLACE FUNCTION public.resolve_moderation_report_v2(
  p_report_id uuid,
  p_action text,
  p_admin_id uuid,
  p_reason text,
  p_duration_hours integer DEFAULT NULL::integer,
  p_notify_user boolean DEFAULT true
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- p_admin_id is accepted and DELIBERATELY IGNORED. The actor is auth.uid(),
  -- never a caller-supplied value, or any admin could act in another's name. The
  -- parameter stays only because the shipped TestFlight build passes it and
  -- dropping it would change the signature that build calls.
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

  -- NOT FOUND, not "target_user_id IS NULL".
  --
  -- Those were the same thing until this batch made account deletion work:
  -- reports.target_user_id is now ON DELETE SET NULL, so a report against
  -- somebody who has since left has a NULL target while being a perfectly real,
  -- still-pending report. Testing the target instead of the row made every such
  -- report PERMANENTLY UNRESOLVABLE — stuck in the docket, refusing even a
  -- dismiss, with an error saying "not found" that was untrue. Reproduced.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found or already resolved';
  END IF;

  -- There is nobody left to warn, suspend or ban. Say so plainly instead of
  -- writing an UPDATE that matches no rows and reporting success — the exact
  -- failure this whole batch is about. The content may well still be standing,
  -- so removal and dismissal remain available.
  IF v_target_user_id IS NULL AND p_action NOT IN ('dismiss', 'delete_content') THEN
    RAISE EXCEPTION 'That member has deleted their account. Only dismiss or delete_content remain.'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Refuse rather than pretend ───────────────────────────────────────────
  -- Both of these previously set suspended_until to NULL and told the member
  -- they had been punished. A moderation tool that reports success without
  -- acting is worse than one that refuses: the report leaves the queue and
  -- nobody looks again.
  IF p_action IN ('suspend', 'mute_user') AND (p_duration_hours IS NULL OR p_duration_hours <= 0) THEN
    RAISE EXCEPTION 'A duration in hours is required for %', p_action USING ERRCODE = 'P0001';
  END IF;

  IF p_action = 'delete_content' AND v_content_type = 'profile' THEN
    RAISE EXCEPTION 'A profile is not content. Use ban or permanent_exile.' USING ERRCODE = 'P0001';
  END IF;

  IF p_duration_hours IS NOT NULL THEN
    v_expires_at := now() + (p_duration_hours || ' hours')::interval;
  END IF;

  -- ── Capture the exhibit BEFORE anything is removed ───────────────────────
  -- get_report_evidence owns the content-type mapping and is already live and
  -- proven; calling it keeps one mapping rather than two that can drift.
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
      -- Every reportable type, so no report can be "resolved" against content
      -- that is still standing. The web version handled 3 of 8 and silently
      -- skipped the rest while reporting success.
      CASE v_content_type
        WHEN 'log'             THEN DELETE FROM logs              WHERE id = v_content_id;
        WHEN 'list'            THEN DELETE FROM lists             WHERE id = v_content_id;
        WHEN 'log_comment'     THEN DELETE FROM log_comments      WHERE id = v_content_id;
        WHEN 'list_comment'    THEN DELETE FROM list_comments     WHERE id = v_content_id;
        WHEN 'dossier'         THEN DELETE FROM dispatch_dossiers WHERE id = v_content_id;
        WHEN 'dossier_comment' THEN DELETE FROM dossier_comments  WHERE id = v_content_id;
        WHEN 'lounge_message' THEN
          -- Struck through, not removed. A hole in a transcript reads as
          -- tampering and breaks every reply that quotes it. This is the same
          -- tombstone withdraw_lounge_message writes — done inline because that
          -- function admits only the author or the founder, never an admin.
          UPDATE lounge_messages
             SET content = '', deleted_at = now()
           WHERE id = v_content_id;
        ELSE
          RAISE EXCEPTION 'Cannot remove content of type %', COALESCE(v_content_type, 'unknown')
            USING ERRCODE = 'P0001';
      END CASE;
      -- Zero rows is not an error: the member may have deleted it themselves
      -- before the moderator got to it. Resolving the report is still correct,
      -- and the snapshot records what was there when it was reported.

    WHEN 'dismiss' THEN
      NULL;

    ELSE
      -- An unrecognised action previously fell through a CASE with no ELSE,
      -- which raises case_not_found — correct, but unreadable. Name it.
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

    -- Only if there is still somebody to notify. notifications.user_id is NOT
    -- NULL, so a departed target would abort the whole resolve here — after the
    -- content had already been removed.
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
$function$;

REVOKE ALL ON FUNCTION public.resolve_moderation_report_v2(uuid, text, uuid, text, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_moderation_report_v2(uuid, text, uuid, text, integer, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
