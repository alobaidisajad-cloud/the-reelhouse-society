-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_24 — a later, shorter sentence never cuts short a longer one, and an admin may lift a ban or a suspension.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A second, shorter suspension wrote its end over a longer one: a suspension or a mute runs to the
--      later of its own end and the one standing, and its notice says so (review round 14).
--   2. Nothing could lift a ban or a suspension, though the BAN sheet promises an admin can: lift_sanction,
--      and the Tribunal's list of members under sanction (get_sanctioned_members) (review round 14).
--   3. Each notice of a verdict names its verdict, so the member opens it whole; the notices already
--      written are given theirs once, here (review round 14).
--   4. A page's or a salon's words removed are kept with what puts them back (review round 14).
--   Functions and the one-time pass over the verdicts' notices; no table is locked whole. The columns
--   are 20261120_21's; the indexes 20261120_25 and 20261120_26, the appeal's functions 20261120_27.
-- Undo: mobile/supabase/migrations-down/20261120_24_a_shorter_sentence_never_cuts_a_longer_one.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-B2 · a later, shorter sentence never cuts short a longer one, and an admin may lift a ban or a suspension (review round 14) ──
--   A member reported twice was suspended for 720 hours on the first case, then for 24 hours on the
--   second: the second verdict wrote suspended_until = now() + 24 hours, so the member could write
--   again the next day, and their notice said "paused your membership for 24 hours". 'suspend' and
--   'mute_user' wrote the new end over the old one. And nothing could undo a verdict: no function or
--   screen lifted a ban or a suspension, though the BAN sheet and its confirmation promise "until an
--   admin lifts it". Now:
--   1. a suspension or a mute runs to the later of its own end and the one already standing; the reason
--      on the member's page is the one of the sentence that governs; and a shorter verdict's notice says
--      that the longer pause already in place stands, and to when;
--   2. lift_sanction: an admin (any admin, as the sheet promises) lifts a member's ban and suspension
--      with a reason the member is told; every ban, suspension and mute verdict still holding is marked
--      lifted (H-B6.locks), so the record says so; a sentence already served is left served, never
--      "lifted". A permanent exile is not lifted: the house calls it irrevocable; it may be overturned on
--      its one appeal alone (H-B6). No admin lifts a sanction on themselves (a_judge_is_refused);
--   3. standing_from_verdicts: the one reading of a member's standing from their verdicts not lifted,
--      the longest suspension and any ban, for a verdict overturned on appeal (H-B6);
--   4. get_sanctioned_members: the Tribunal's list of members under a ban or a suspension now, to find
--      the one to lift (a banned member may have no case open);
--   5. each notice of a verdict names the verdict it tells (metadata mod_action_id), so the member opens
--      it whole, reads the reason in full and may appeal it (H-B6); the notices already written are given
--      theirs once, matched by member, verdict and moment (a verdict and its notice are written in one
--      statement's moment);
--   6. (H-B7) REMOVE CONTENT on a page or a salon: a page's words, display name, picture and links are
--      cleared, a salon's name, description and cover; the copy of every removal keeps what puts it back
--      (kept), so a removal overturned on appeal is put back where its row still stands (H-B6).
--   Every other step of resolve_moderation_report_v2 is unchanged. A phone from before reads the notice
--   as before and leaves its new key unread; it never calls the new functions.

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.standing_from_verdicts(uuid, text);
CREATE FUNCTION public.standing_from_verdicts(p_user uuid, p_what text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_ban       public.mod_actions%ROWTYPE;
  v_susp      public.mod_actions%ROWTYPE;
  v_banned    boolean;
  v_banned_at timestamptz;
  v_until     timestamptz;
  v_said      text;
BEGIN
  SELECT coalesce(is_banned, false), banned_at, suspended_until, suspension_reason
    INTO v_banned, v_banned_at, v_until, v_said
    FROM public.profiles WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- The verdicts that still hold: never lifted, never overturned (an overturned one is lifted too).
  SELECT * INTO v_ban FROM public.mod_actions
   WHERE target_user_id = p_user AND action IN ('ban', 'permanent_exile') AND lifted_at IS NULL
   ORDER BY (action = 'permanent_exile') DESC, created_at DESC, id DESC LIMIT 1;
  SELECT * INTO v_susp FROM public.mod_actions
   WHERE target_user_id = p_user AND action IN ('suspend', 'mute_user') AND lifted_at IS NULL AND expires_at > now()
   ORDER BY expires_at DESC, created_at DESC, id DESC LIMIT 1;

  -- 'ban' reads the ban again, 'suspension' the suspension, 'all' both: a part not asked of is left as
  -- it stands, so a verdict overturned never touches a standing it did not make.
  IF p_what IN ('ban', 'all') THEN
    v_banned := v_ban.id IS NOT NULL;
    v_banned_at := v_ban.created_at;
  END IF;
  IF p_what IN ('suspension', 'all') THEN
    v_until := v_susp.expires_at;
  END IF;

  -- The reason on the member's page is the one of what governs: a ban's while one stands, else the
  -- longest suspension's; none when nothing stands.
  v_said := CASE
    WHEN v_banned AND v_ban.id IS NOT NULL AND p_what IN ('ban', 'all')
      THEN CASE WHEN v_ban.action = 'permanent_exile' THEN 'PERMANENT EXILE: ' ELSE '' END || v_ban.reason
    WHEN v_banned THEN v_said
    WHEN v_until > now() AND v_susp.id IS NOT NULL
      THEN CASE WHEN v_susp.action = 'mute_user' THEN 'Muted: ' ELSE '' END || v_susp.reason
    WHEN v_until > now() THEN v_said
    ELSE NULL
  END;

  UPDATE public.profiles
     SET is_banned = v_banned, banned_at = v_banned_at, suspended_until = v_until, suspension_reason = v_said
   WHERE id = p_user;
END;
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, asked by the house's moderation functions alone (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.standing_from_verdicts(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.standing_from_verdicts(uuid, text) TO service_role;

-- As round 12 left it (20261118_01), with a suspension that never shortens one standing, a notice that
-- names its verdict, and REMOVE CONTENT on a page and a salon, its copy keeping what puts a piece back.
-- add-only (3): it only fixes: a verdict on a pending case is made and told as before, a shorter suspension no longer cuts a longer one, and a page or a salon reported may have its words removed, as the H-B2 rehearsal replays as the moderator and the members; TestFlight build 41 and the website call it as admins alone, and meet no new refusal
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
    v_kept := CASE v_content_type
      WHEN 'lounge_message' THEN (SELECT jsonb_build_object('content', content) FROM lounge_messages WHERE id = v_content_id)
      WHEN 'dispatch_post' THEN (SELECT jsonb_build_object('body', body, 'full_content', full_content, 'title', title,
                                   'subject_image', subject_image, 'subject_backdrop', subject_backdrop, 'source', source,
                                   'source_url', source_url, 'spoiler_label', spoiler_label) FROM dispatch_posts WHERE id = v_content_id)
      WHEN 'dossier' THEN (SELECT jsonb_build_object('body', body, 'full_content', full_content, 'title', title,
                                   'subject_image', subject_image, 'subject_backdrop', subject_backdrop, 'source', source,
                                   'source_url', source_url, 'spoiler_label', spoiler_label) FROM dispatch_posts WHERE id = v_content_id)
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
           WHERE id = v_content_id AND deleted_at IS NULL;
        -- A page is a member's, not a piece: what is taken is what they wrote on it, never the page.
        -- Its words, the name it shows, its picture and its links; its handle stays (a ban answers that).
        WHEN 'profile' THEN
          UPDATE profiles
             SET bio = NULL, display_name = NULL, avatar_url = NULL, social_links = '{}'::jsonb
           WHERE id = v_content_id;
        -- A salon is a place: what is taken is what it is called and shows, never its rooms or the
        -- words members left in it.
        WHEN 'lounge' THEN
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
          ELSE 'After reviewing a report, the house has removed a piece of your content.' END
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

-- The one rule of who may judge a member's case (hear an appeal of a verdict, lift a sanction): never the
-- member it is about, and, for an appeal, never the moderator who ruled. One function, so the owner's
-- answer on a house with a single admin changes it here alone (H-B6's appeals and the door count, and
-- lift_sanction, each ask it).
-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, asked by the house's moderation functions alone (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS private.a_judge_is_refused(uuid, uuid, uuid);
CREATE FUNCTION private.a_judge_is_refused(p_judge uuid, p_ruler uuid, p_target uuid) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  -- Why this judge may not judge this case, or nothing when they may: the member it is about is refused
  -- (OWN_CASE), as the one who ruled is (OWN_VERDICT). A lift has no ruler to ask (p_ruler NULL).
  SELECT CASE
    WHEN p_judge IS NOT DISTINCT FROM p_target THEN 'OWN_CASE'
    WHEN p_ruler IS NOT NULL AND p_judge IS NOT DISTINCT FROM p_ruler THEN 'OWN_VERDICT'
  END
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, asked by the house's moderation functions alone (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION private.a_judge_is_refused(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.a_judge_is_refused(uuid, uuid, uuid) TO service_role;

-- Whether any moderator of the house may hear an appeal of a verdict, by that one rule. The owner's
-- decision (2026-11-19): a second moderator is appointed before launch; until then an appeal no moderator
-- may hear waits (never heard by one refused), the member is told so, and what it removed stays withheld,
-- whole, while it waits. Asked of the house's moderators by their own index (H-B2.admins).
-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, asked by the house's moderation functions alone (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS private.an_appeal_may_be_heard(uuid, uuid);
CREATE FUNCTION private.an_appeal_may_be_heard(p_ruler uuid, p_target uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.role = 'admin' AND private.a_judge_is_refused(p.id, p_ruler, p_target) IS NULL)
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, asked by the house's moderation functions alone (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION private.an_appeal_may_be_heard(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.an_appeal_may_be_heard(uuid, uuid) TO service_role;

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.lift_sanction(uuid, text);
CREATE FUNCTION public.lift_sanction(p_user_id uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_reason   text := btrim(coalesce(p_reason, ''));
  v_banned   boolean;
  v_until    timestamptz;
  v_said     text;
  v_lifted   uuid;
  v_what     text;
  v_notice   text;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_reason) = 0 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'A reason of up to 500 characters is required.' USING ERRCODE = 'P0001';
  END IF;
  -- No admin lifts their own sanction: the house's one rule of who may judge a case (a_judge_is_refused).
  IF private.a_judge_is_refused(v_admin_id, NULL, p_user_id) IS NOT NULL THEN
    RAISE EXCEPTION '%', private.a_judge_is_refused(v_admin_id, NULL, p_user_id) USING ERRCODE = '42501';
  END IF;

  -- The member's standing, held while it is lifted: a verdict given at the same moment waits.
  SELECT coalesce(is_banned, false), suspended_until, suspension_reason INTO v_banned, v_until, v_said
    FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEMBER_GONE' USING ERRCODE = 'P0002';
  END IF;
  -- Exile is the house's last word: never lifted by hand, only overturned on its one appeal.
  IF EXISTS (SELECT 1 FROM public.mod_actions WHERE target_user_id = p_user_id AND action = 'permanent_exile' AND lifted_at IS NULL)
     OR (v_banned AND coalesce(v_said, '') LIKE 'PERMANENT EXILE:%') THEN
    RAISE EXCEPTION 'EXILE_STANDS' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_banned AND (v_until IS NULL OR v_until <= now()) THEN
    -- Lifted meanwhile by another admin, or a suspension run out: nothing stands to lift.
    RAISE EXCEPTION 'NOT_SANCTIONED' USING ERRCODE = 'P0002';
  END IF;

  -- The verdict told in the member's notice: the ban standing, else the suspension that governs.
  SELECT id INTO v_lifted FROM public.mod_actions
   WHERE target_user_id = p_user_id AND lifted_at IS NULL
     AND (action = 'ban' OR (action IN ('suspend', 'mute_user') AND expires_at > now()))
   ORDER BY (action = 'ban') DESC, expires_at DESC NULLS LAST, created_at DESC LIMIT 1;

  -- Only what holds now is lifted: a sentence already served stays served on the record, never "lifted".
  UPDATE public.mod_actions
     SET lifted_at = now(), lifted_by = v_admin_id, lift_reason = v_reason
   WHERE target_user_id = p_user_id AND lifted_at IS NULL
     AND (action = 'ban' OR (action IN ('suspend', 'mute_user') AND expires_at > now()));

  UPDATE public.profiles
     SET is_banned = false, banned_at = NULL, suspended_until = NULL, suspension_reason = NULL
   WHERE id = p_user_id;

  v_what := CASE WHEN v_banned THEN 'the closing of your membership' ELSE 'the pause on your membership' END;
  v_notice := 'The house has lifted ' || v_what || '. You may write again. Reason: ' || v_reason;
  INSERT INTO public.notifications (user_id, type, title, body, message, metadata)
  VALUES (p_user_id, 'moderation', 'A Notice from the House', v_notice, v_notice,
          jsonb_build_object('action', 'lift', 'reason', v_reason)
          || CASE WHEN v_lifted IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('mod_action_id', v_lifted) END);
END;
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, called by the app's Tribunal alone, admins only (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.lift_sanction(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lift_sanction(uuid, text) TO authenticated, service_role;

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.get_sanctioned_members(text, uuid, integer);
CREATE FUNCTION public.get_sanctioned_members(p_cursor_name text DEFAULT NULL::text, p_cursor_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 30) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_admin_id uuid := auth.uid();
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;

  -- By handle, a page at a time (keyset on the handle and the id): the list an admin reads to lift.
  -- Asked of the partial index profiles_under_sanction (H-B2.index), never every member.
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', p.id, 'username', p.username, 'avatar_url', p.avatar_url,
             'is_banned', coalesce(p.is_banned, false),
             'exiled', coalesce(p.is_banned, false) AND coalesce(p.suspension_reason, '') LIKE 'PERMANENT EXILE:%',
             'suspended_until', CASE WHEN p.suspended_until > now() THEN p.suspended_until END,
             'reason', p.suspension_reason,
             'since', p.banned_at)
           ORDER BY lower(coalesce(p.username, '')), p.id)
      FROM (
        SELECT * FROM public.profiles q
         WHERE (q.is_banned OR q.suspended_until IS NOT NULL)
           AND (coalesce(q.is_banned, false) OR q.suspended_until > now())
           AND (p_cursor_name IS NULL OR (lower(coalesce(q.username, '')), q.id) > (lower(p_cursor_name), p_cursor_id))
         ORDER BY lower(coalesce(q.username, '')), q.id
         LIMIT LEAST(GREATEST(coalesce(p_limit, 30), 1), 50)
      ) p
  ), '[]'::jsonb);
END;
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, called by the app's Tribunal alone, admins only (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.get_sanctioned_members(text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sanctioned_members(text, uuid, integer) TO authenticated, service_role;

-- Once: each notice of a verdict already written names its verdict, matched by its member, its verdict
-- and its moment (resolve_moderation_report_v2 writes the two in one statement's moment, so the two
-- moments are one). Driven from the verdicts, each asked of the notices' (user_id, created_at) order.
UPDATE public.notifications n
   SET metadata = coalesce(n.metadata, '{}'::jsonb) || jsonb_build_object('mod_action_id', m.id)
  FROM public.mod_actions m
 WHERE m.action <> 'dismiss' AND m.target_user_id IS NOT NULL
   AND n.user_id = m.target_user_id AND n.created_at = m.created_at
   AND n.type = 'moderation' AND n.metadata ->> 'action' = m.action
   AND NOT (coalesce(n.metadata, '{}'::jsonb) ? 'mod_action_id');
