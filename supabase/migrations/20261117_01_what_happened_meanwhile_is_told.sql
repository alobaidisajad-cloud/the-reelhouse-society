-- ════════════════════════════════════════════════════════════════════════════
-- 20261117_01 — what happened meanwhile is told as it happened, and each number counts what it says.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A moderator's REMOVE CONTENT on a piece its author had already deleted removed nothing, yet
--      told the author the house had removed it and put a removal on their record; two moderators
--      judging one case at once both carried out their verdicts. The case is now held while it is
--      judged and closed only while pending (ALREADY_JUDGED), and a removal that finds nothing is
--      refused (PIECE_GONE), undoing the whole verdict (review round 11).
--   2. A seat or a request in a salon dissolved meanwhile was refused as any other refusal, and the
--      phone said "check your connection": it is refused as gone (SALON_GONE).
--   3. A critique filed on a record or a stack deleted meanwhile was refused by its owner's rule
--      and told as the owner's choice: the house now says the page is gone (LOG_GONE, STACK_GONE).
--   4. ADMIT on a follow request withdrawn meanwhile, or across a block, answered as an admission:
--      accept_follow_request now answers whether anyone came in.
--   5. An open ballot printed "0 BALLOTS CAST" to the member who had just voted: ballot_tally gives
--      its running count to those who have voted, and to all once it has closed.
--   6. A rewatch moved the film's earlier viewing out of the calendar, the run, the months and the
--      Year in Cinema: they now count every viewing (member_viewings, year_viewings), and the run
--      comes with the day it ends, for the phone to judge on the member's own day (current_run).
--   7. The Reel's critique counts counted members the reader has hidden: the feeds count what the
--      reader can read (critiques_seen).
--   8. A certification taken back left its notice standing, counted as a member: it takes its
--      notice with it.
--   9. An old-style handle renamed to its cleaned form was silently put back while the phone said
--      renamed: a deliberate rename goes through rename_my_handle, which answers the handle kept.
--  10. Deleting an account said the member's critiques were destroyed while the house kept them:
--      they stay unsigned, as the app now says, unless the member chooses to erase their writing
--      too (request_account_deletion(p_erase_writing)).
--  11. A withdrawn salon message read as found, with nothing in it, in a moderator's evidence: it
--      reads as gone, so REMOVE CONTENT is not offered for it.
--  12. A member could certify, take it back and certify again, buzzing another member's phone each
--      time: a certification from one member for one thing is pushed once (certifications_pushed).
--  13. A salon card sharing an essay or a stack kept the piece's headline after the piece was
--      withdrawn or deleted: the card is marked gone and keeps no headline.
--   This car makes every function and runs every one-time statement; it holds no table members
--   write. The table of 12 is the car before, 20261117_00, so its keys never hold auth.users while
--   this car runs. The triggers of 3, 8 and 13 (a stack's card) are the next car, 20261117_02, applied by
--   the same train run right after this one. The rehearsal holds each, the members acting as
--   themselves; the cases that need the triggers are 20261117_02's.
-- Undo: mobile/supabase/migrations-down/20261117_01_what_happened_meanwhile_is_told.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── A verdict is given once, and a removal removes something (review round 11) ──
-- Two faults of resolve_moderation_report_v2, mended together because they are one function.
--   1. REMOVE CONTENT on a piece its author had already deleted removed nothing, yet it closed the
--      case, wrote a 'delete_content' row onto the member's enforcement record and told them
--      "the house has removed a piece of your content". Now the piece must still stand when it is
--      removed (a record, a stack or a critique still there, a filing not yet ended, a salon message
--      not yet withdrawn); when it does not, the house refuses with PIECE_GONE (P0002), and the
--      whole call is undone: the case stays pending, to be dismissed or judged on the member, and
--      nothing is recorded or told. A standing filing is emptied by the house as before.
--   2. Two moderators judging one case at once were both carried out: the pending case was read
--      without a lock and closed by its id alone, so the second verdict waited for the first, then
--      closed the case again and acted again (two records, two notices each). Now the case is read
--      pending AND locked (FOR UPDATE: the second call waits, then finds it no longer pending), and
--      the close names status = 'pending' too. A case no longer pending (judged by another, or by a
--      bulk dismissal) is refused with ALREADY_JUDGED (P0002), and the phone takes it off the docket.
-- Every other step is unchanged.
-- add-only (3): it only fixes: a verdict on a pending case is made and told as before, as the rehearsal replays (a warning, a removal of a piece that stands); TestFlight build 41 and the website call it as admins alone, and a refusal they meet is the one they met before, under a new word
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
  v_rows           integer;
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

  IF p_action = 'delete_content' AND v_content_type = 'profile' THEN
    RAISE EXCEPTION 'A profile is not content. Use ban or permanent_exile.' USING ERRCODE = 'P0001';
  END IF;

  IF p_duration_hours IS NOT NULL THEN
    v_expires_at := now() + (p_duration_hours || ' hours')::interval;
  END IF;

  IF p_action = 'delete_content' THEN
    v_snapshot := public.get_report_evidence(p_report_id);
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
      -- Whether the piece still stands, asked of the tables that hold it before anything is taken:
      -- a filing is never deleted, only emptied (dispatch_no_hard_delete answers its DELETE with no
      -- row), and a legacy essay or critique is removed through a view, so a removal's own row
      -- count cannot say. A piece already gone took nothing: nothing is recorded or told, and the
      -- case stays pending (the raise undoes the close above).
      IF NOT (CASE v_content_type
        WHEN 'log'              THEN EXISTS (SELECT 1 FROM logs WHERE id = v_content_id)
        WHEN 'list'             THEN EXISTS (SELECT 1 FROM lists WHERE id = v_content_id)
        WHEN 'log_comment'      THEN EXISTS (SELECT 1 FROM log_comments WHERE id = v_content_id)
        WHEN 'list_comment'     THEN EXISTS (SELECT 1 FROM list_comments WHERE id = v_content_id)
        WHEN 'dossier'          THEN EXISTS (SELECT 1 FROM dispatch_posts WHERE id = v_content_id AND ended_at IS NULL)
        WHEN 'dispatch_post'    THEN EXISTS (SELECT 1 FROM dispatch_posts WHERE id = v_content_id AND ended_at IS NULL)
        WHEN 'dossier_comment'  THEN EXISTS (SELECT 1 FROM dispatch_comments WHERE id = v_content_id)
        WHEN 'dispatch_comment' THEN EXISTS (SELECT 1 FROM dispatch_comments WHERE id = v_content_id)
        WHEN 'lounge_message'   THEN EXISTS (SELECT 1 FROM lounge_messages WHERE id = v_content_id AND deleted_at IS NULL)
        ELSE true
      END) THEN
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

-- ── F1 · a withdrawn salon message is evidence destroyed (review round 11) ──────────────────────
--   A salon message is never deleted: withdrawn by its writer or its host (or removed by the
--   house), it keeps its row with its words emptied and deleted_at set. get_report_evidence read
--   such a row as found, with an empty body, so the Tribunal showed a blank exhibit and offered
--   REMOVE CONTENT, which the house then refused as PIECE_GONE. A withdrawn message now reads as
--   any piece already gone (found: false): the Tribunal says the evidence is destroyed and offers
--   only a dismissal or a verdict on the member, from the start. Every other step is unchanged.
-- add-only (3): it only fixes: the evidence of a standing piece (a salon message among them) is read as before, as the rehearsal replays as the moderator; TestFlight build 41 and the website read found: false already, as a piece deleted
CREATE OR REPLACE FUNCTION public.get_report_evidence(p_report_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_admin_id   uuid := auth.uid();
  v_type       text;
  v_content_id uuid;
  v_title      text;
  v_body       text;
  v_route      text;
BEGIN
  -- ── Admin gate: identical to resolve_moderation_report_v2 ──
  -- Uses auth.uid() (canonical identity), never a caller-supplied param.
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- ── Resolve the report ──
  SELECT content_type, content_id
    INTO v_type, v_content_id
  FROM reports
  WHERE id = p_report_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- ── Fetch the exhibit by content type (columns verified against live schema) ──
  IF v_type = 'log' THEN
    SELECT film_title, review, '/log/' || id::text
      INTO v_title, v_body, v_route FROM logs WHERE id = v_content_id;

  ELSIF v_type = 'list' THEN
    SELECT title, description, '/stacks/' || id::text
      INTO v_title, v_body, v_route FROM lists WHERE id = v_content_id;

  ELSIF v_type = 'log_comment' THEN               -- log_comments.body
    SELECT body, '/log/' || log_id::text
      INTO v_body, v_route FROM log_comments WHERE id = v_content_id;

  ELSIF v_type = 'list_comment' THEN              -- list_comments.content
    SELECT content, '/stacks/' || list_id::text
      INTO v_body, v_route FROM list_comments WHERE id = v_content_id;

  ELSIF v_type = 'dossier' THEN
    SELECT title, full_content, '/dossier/' || id::text
      INTO v_title, v_body, v_route FROM dispatch_dossiers WHERE id = v_content_id;

  ELSIF v_type = 'dossier_comment' THEN           -- dossier_comments.body
    SELECT body, '/dossier/' || dossier_id::text
      INTO v_body, v_route FROM dossier_comments WHERE id = v_content_id;

  ELSIF v_type = 'dispatch_post' THEN
    SELECT title, coalesce(full_content, body), '/dispatch/' || id::text
      INTO v_title, v_body, v_route FROM dispatch_posts WHERE id = v_content_id;

  ELSIF v_type = 'dispatch_comment' THEN
    SELECT body, '/dispatch/' || post_id::text
      INTO v_body, v_route FROM dispatch_comments WHERE id = v_content_id;

  ELSIF v_type = 'lounge_message' THEN            -- lounge_messages.content
    -- A withdrawn or removed message keeps its row, its words emptied (deleted_at set): it is
    -- gone, as a deleted piece is, and reads as destroyed.
    SELECT content, '/lounge/' || lounge_id::text
      INTO v_body, v_route FROM lounge_messages WHERE id = v_content_id AND deleted_at IS NULL;

  ELSIF v_type = 'lounge' THEN
    SELECT name, description, '/lounge/' || id::text
      INTO v_title, v_body, v_route FROM lounges WHERE id = v_content_id;

  ELSIF v_type = 'profile' THEN                   -- route uses username, not id
    SELECT username, bio, '/user/' || username
      INTO v_title, v_body, v_route FROM profiles WHERE id = v_content_id;

  ELSE
    RETURN jsonb_build_object('found', false);     -- unknown type → graceful miss
  END IF;

  -- Content deleted since the report was filed → route never got set
  IF v_route IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'title', v_title,
    'body',  v_body,
    'route', v_route
  );
END;
$$;

-- ── A2 · a seat or a request in a salon dissolved meanwhile is told as gone ─────────────────────
--   A member sat in a salon (or stood at its door) while its host dissolved it. TAKE A SEAT and
--   REQUEST were refused with 'Lounge not found' (SQLSTATE P0001, the code of every other refusal),
--   and the phone said "Could not take a seat. Check your connection and try again." over a room
--   that is not there (review round 11). The two doors now raise the agreed code: 'SALON_GONE' with
--   ERRCODE P0002. The phone says "This salon is no longer open." and the room draws its own
--   "Signal Lost" page. Nothing else in either function changes.
--   A phone from before reads any refusal as its connection sentence, as it did, so none is broken.

-- add-only (3): it only fixes: the calls replayed as the members themselves, a seat and a request in a standing salon as before and in a dissolved one refused as SALON_GONE (round 11's rehearsal)
CREATE OR REPLACE FUNCTION public.join_public_lounge(p_lounge_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_private boolean; v_sanction text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT is_private INTO v_private FROM public.lounges WHERE id = p_lounge_id;
  -- Gone (dissolved by its host): said as gone, never as a failure of the member's signal.
  IF v_private IS NULL THEN RAISE EXCEPTION 'SALON_GONE' USING ERRCODE = 'P0002'; END IF;
  IF v_private THEN RAISE EXCEPTION 'This lounge is private — request to join'; END IF;
  SELECT status INTO v_sanction FROM public.lounge_sanctions WHERE lounge_id = p_lounge_id AND user_id = auth.uid();
  IF v_sanction = 'banned' THEN RAISE EXCEPTION 'You cannot join this lounge'; END IF;
  INSERT INTO public.lounge_members (lounge_id, user_id, status)
  VALUES (p_lounge_id, auth.uid(), COALESCE(v_sanction, 'approved'))
  ON CONFLICT (user_id, lounge_id) DO UPDATE SET status = EXCLUDED.status
    WHERE public.lounge_members.status <> 'banned';
END $$;

-- add-only (3): it only fixes: the calls replayed as the members themselves, a seat and a request in a standing salon as before and in a dissolved one refused as SALON_GONE (round 11's rehearsal)
CREATE OR REPLACE FUNCTION public.request_lounge_membership(p_lounge_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_private boolean; v_creator uuid; v_status text; v_uname text; v_lname text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT is_private, creator_id, name INTO v_private, v_creator, v_lname FROM public.lounges WHERE id = p_lounge_id;
  -- Gone (dissolved by its host): said as gone, never as a failure of the member's signal.
  IF v_private IS NULL THEN RAISE EXCEPTION 'SALON_GONE' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.lounge_sanctions
              WHERE lounge_id = p_lounge_id AND user_id = auth.uid() AND status = 'banned') THEN
    RAISE EXCEPTION 'You cannot request this lounge';
  END IF;
  SELECT status INTO v_status FROM public.lounge_members WHERE lounge_id = p_lounge_id AND user_id = auth.uid();
  IF v_status = 'banned' THEN RAISE EXCEPTION 'You cannot request this lounge'; END IF;
  IF v_status IN ('approved','pending','muted') THEN RETURN; END IF;
  INSERT INTO public.lounge_members (lounge_id, user_id, status) VALUES (p_lounge_id, auth.uid(), 'pending')
  ON CONFLICT (user_id, lounge_id) DO UPDATE SET status = 'pending'
    WHERE public.lounge_members.status NOT IN ('banned','approved','muted');
  SELECT username INTO v_uname FROM public.profiles WHERE id = auth.uid();
  IF v_creator IS NOT NULL AND v_creator <> auth.uid() THEN
    -- the sender is from_username; every reader prints it before the message
    INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message, related_lounge_id)
    VALUES (v_creator, 'system', v_uname, auth.uid(),
            CASE WHEN v_uname IS NULL THEN 'A member is asking' ELSE 'is asking' END
              || ' to enter ' || COALESCE(v_lname,'your lounge') || '.',
            p_lounge_id);
  END IF;
END $$;

-- ── A critique on a page gone is told as such (review round 11) ──
-- A member writing a critique under a record or a stack, whose owner deleted it meanwhile (or, for
-- one's own stack, deleted it from one's other phone), pressed FILE and was told "This member limits
-- who may annotate their critiques." on every try: the annotate gates (can_annotate_log,
-- can_annotate_list) read the owner from the parent row, found none, and the RESTRICTIVE insert
-- policies refused with 42501, the owner's rule. The foreign key, which would have said the truth,
-- is checked only after the policies.
-- Now a BEFORE INSERT trigger on each critique table looks for its page first (row triggers run
-- before the policies' WITH CHECK). A page this member can no longer read is gone for them, and the
-- house says so: P0002 'LOG_GONE' for a record, P0002 'STACK_GONE' for a stack. It runs as the
-- member (SECURITY INVOKER), so a page hidden from them reads as gone too, which leaks nothing they
-- could not already see. A critique on a page that stands goes on to the gates exactly as before.
-- The two triggers are made in the next car of the same train (20261117_02, A4.locks), whose
-- rehearsal holds only the cases that need them, so the critiques are held for milliseconds.

-- add-only (1): no shipped client uses it: a trigger function this migration makes, which no client can call (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_critique_has_its_page();
CREATE FUNCTION public.a_critique_has_its_page() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_TABLE_NAME = 'log_comments' THEN
    IF NOT EXISTS (SELECT 1 FROM public.logs l WHERE l.id = NEW.log_id) THEN
      RAISE EXCEPTION 'LOG_GONE' USING ERRCODE = 'P0002';
    END IF;
  ELSIF TG_TABLE_NAME = 'list_comments' THEN
    IF NOT EXISTS (SELECT 1 FROM public.lists l WHERE l.id = NEW.list_id) THEN
      RAISE EXCEPTION 'STACK_GONE' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- add-only (1): no shipped client uses it: a trigger function this migration makes, which no client can call (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.a_critique_has_its_page() FROM PUBLIC;
GRANT ALL ON FUNCTION public.a_critique_has_its_page() TO service_role;

-- ── An admission says whether anyone was admitted (review round 11) ──────────
-- accept_follow_request answered the same when it admitted the member at the door, when the
-- request had been withdrawn meanwhile (nothing to admit), and when a block stood between the two
-- (the request taken, no one admitted): the phone took every answer as an admission, and the
-- member believed someone now followed them who did not. It now answers true when it admitted
-- the member, and false when no one was admitted; every step is otherwise unchanged.
-- A function's answer is part of its shape, so the old one goes and the new one is made with the
-- grants the old one had (members and the house; never visitors).
-- add-only (3): it only fixes: an admission of a request at the door is made, told and counted as before, as the rehearsal replays; TestFlight build 41 and the website read only its error, never its answer (FollowRequestService.accept, NotificationBell)
DROP FUNCTION IF EXISTS public.accept_follow_request(uuid);

CREATE FUNCTION public.accept_follow_request(requester_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_me uuid := auth.uid();
  v_granted integer;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;

  -- A request across a block admits no one: it is taken from the door instead. One can be
  -- waiting there only if it was made in the same moment as the block.
  IF public.a_block_stands_between(requester_id, v_me) THEN
    DELETE FROM public.interactions
     WHERE user_id = requester_id
       AND target_user_id = v_me
       AND type = 'follow_request';
    RETURN false;
  END IF;

  -- Convert follow_request → follow
  UPDATE public.interactions
     SET type = 'follow'
   WHERE user_id = requester_id
     AND target_user_id = v_me
     AND type = 'follow_request';
  GET DIAGNOSTICS v_granted = ROW_COUNT;
  -- No request at the door: withdrawn (or answered) meanwhile. No one is admitted.
  IF v_granted = 0 THEN RETURN false; END IF;

  -- the follow count trigger counts inserts and deletes; a granted request is an update, so it is counted here
  UPDATE public.profiles SET followers_count = COALESCE(followers_count, 0) + 1 WHERE id = v_me;
  UPDATE public.profiles SET following_count = COALESCE(following_count, 0) + 1 WHERE id = requester_id;

  INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
  SELECT requester_id, 'follow_accept', p.username, v_me, 'accepted your follow request. You can now view their archive.'
    FROM public.profiles p WHERE p.id = v_me;
  RETURN true;
END;
$$;

-- add-only (3): it only fixes: the grants the old call had (members and the service; never PUBLIC or a visitor), restated for the call it became; ADMIT replayed as the members themselves (A7 rehearsal), TestFlight build 41 reading no answer as before
REVOKE ALL ON FUNCTION public.accept_follow_request(requester_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.accept_follow_request(requester_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.accept_follow_request(requester_id uuid) TO service_role;

-- ── B1 · an open ballot's count, for a member who has voted in it ───────────────────────────────
--   A member marked an open ballot and its foot said "0 BALLOTS CAST" under their own mark, and
--   every voter after them read the same until the close (review round 11). The options' numbers
--   came only from frozen_totals, written at the close, and a member may read no vote but their
--   own (votes_read), so nothing could count an open ballot. The ballot's own engine is "you cannot
--   see the result until you mark it": ballot_tally gives the running count, in frozen_totals'
--   shape ({ total, counts: { "<option>": n } }), to a member who has voted in the ballot, and to
--   any member once it has closed; to anyone else, null. It answers only for a ballot the caller
--   may read (published, not withheld, not withdrawn, its author not hidden from them), as the
--   filing's own rules give it. New: no client before it asks for it.

-- New, as the train's new functions are written (CREATE FUNCTION), and run again safely: dropped first.
-- add-only (1): no shipped client uses it: a function this migration makes, named by no client before it (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.ballot_tally(uuid);
CREATE FUNCTION public.ballot_tally(p_post uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT CASE WHEN EXISTS (
      SELECT 1 FROM public.dispatch_posts p
       WHERE p.id = p_post
         AND p.kind = 'ballot'
         AND p.is_published AND p.withheld_at IS NULL AND p.ended_at IS NULL
         AND NOT COALESCE(p.user_id = ANY ((SELECT public.hidden_authors())::uuid[]), false)
         -- Voted in, or closed: until then the result is not the reader's to see.
         AND (p.closes_at <= now()
              OR EXISTS (SELECT 1 FROM public.dispatch_votes v
                          WHERE v.post_id = p.id AND v.user_id = auth.uid())))
    THEN (
      -- sum(t.n), not count(*): `t` is one row per option, as freeze_closed_ballots counts.
      SELECT jsonb_build_object(
               'total', COALESCE(sum(t.n), 0),
               'counts', COALESCE(jsonb_object_agg(t.option_index, t.n)
                                  FILTER (WHERE t.option_index IS NOT NULL), '{}'::jsonb))
        FROM (SELECT option_index, count(*) AS n FROM public.dispatch_votes
               WHERE post_id = p_post GROUP BY option_index) t)
  END
$$;

-- add-only (1): no shipped client uses it: a function this migration makes, named by no client before it (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.ballot_tally(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ballot_tally(uuid) TO authenticated;

-- ── Every viewing keeps its own day, and a run is judged by the member's own day (review round 11) ──
--   1. A film is one record per member, and a rewatch moves the record to the rewatch's day: the
--      viewing before it is kept only in the record's history (viewing_history, each with its own
--      date). Every count read the record's day alone, so a rewatch took the earlier night off the
--      Viewing Calendar, broke the "N NIGHTS RUNNING" run (five nights running read as three) and
--      took a film seen in March out of that year's Year in Cinema once it was seen again in
--      January. One house set now names a member's viewings (member_viewings): each record's
--      viewing on its own day, and each earlier viewing in its history on the day it was made. The
--      calendar, both runs, the Projector Room's heaviest month (monthly_viewings, new) and the year
--      (year_viewings, new, paged by its day and viewing) count from it. monthly_activity stays the
--      Archive's count of the records filed under each month, as the posters beneath its headings
--      are, so a heading never counts more films than it shows.
--   2. The run on a member's file was judged against the house's day (UTC): west of UTC, every
--      evening after the house's midnight a run that ended on the member's yesterday read as no
--      run at all, and east of UTC a broken run stood until the house's day turned. The house now
--      also gives the newest run whole, current_run {length, ends_on}, and the phone decides on
--      its own calendar whether it still stands (it ends today or yesterday there). current_streak
--      is kept as it was for the builds that read it (TestFlight build 41), counted over the same
--      viewings.
--   Every set here runs with the caller's own rights where it did before, so the logs' read rules
--   decide what is counted exactly as they decide what is read.
-- ═════════════════════════════════════════════════════════════════════════════════════════════

-- A member's viewings: each record's viewing on its own day, and every earlier viewing kept in its
-- history on the day that viewing was made. A history day that cannot be read as a date (written
-- by an old build) falls back to the day the record was made, the day the house counted it on
-- before. Its rights are the caller's: a record the caller may not read gives no viewing.
-- Dropped first, so the piece can run again: a function this piece makes, which nothing else holds.
-- add-only (1): no shipped client uses it: a function this migration makes, named by no client before it (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.member_viewings(uuid);
CREATE FUNCTION public.member_viewings(p_user_id uuid)
RETURNS TABLE(log_id uuid, viewing_id uuid, film_id integer, day date, rating numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT l.id, l.viewing_id, l.film_id, l.watched_date, l.rating
    FROM public.logs l
   WHERE l.user_id = p_user_id
  UNION ALL
  SELECT l.id,
         CASE WHEN pg_input_is_valid(e->>'viewingId', 'uuid') THEN (e->>'viewingId')::uuid END,
         l.film_id,
         COALESCE(CASE WHEN e->>'date' ~ '^\d{4}-\d{2}-\d{2}' AND pg_input_is_valid(left(e->>'date', 10), 'date')
                       THEN left(e->>'date', 10)::date END,
                  l.created_at::date),
         CASE WHEN pg_input_is_valid(e->>'rating', 'numeric') THEN (e->>'rating')::numeric END
    FROM public.logs l
   CROSS JOIN LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(l.viewing_history) = 'array' THEN l.viewing_history ELSE '[]'::jsonb END) AS e
   WHERE l.user_id = p_user_id
     AND jsonb_typeof(e) = 'object';
$$;

-- add-only (1): no shipped client uses it: a function this migration makes, named by no client before it (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.member_viewings(uuid) FROM PUBLIC;
-- The calendar runs with its reader's rights and reads through this, so whoever may read the calendar may run it.
GRANT ALL ON FUNCTION public.member_viewings(uuid) TO anon;
GRANT ALL ON FUNCTION public.member_viewings(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.member_viewings(uuid) TO service_role;

-- add-only (3): it only fixes: the calls replayed as the members themselves (a record never rewatched counted on its day as before, a private member's calendar still none of a stranger's), and a rewatched record's earlier viewing counted on its own day (B2B5 rehearsal piece)
CREATE OR REPLACE FUNCTION public.calendar_days(p_user_id uuid) RETURNS TABLE(day date, films integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  -- The grid's 364 days end on the member's today: the house's yesterday, today or tomorrow.
  -- Each viewing on its own day: a rewatch adds a night, it never moves the one before it.
  SELECT v.day, count(*)::integer
    FROM public.member_viewings(p_user_id) v
   WHERE v.day BETWEEN (now() AT TIME ZONE 'UTC')::date - 364 AND (now() AT TIME ZONE 'UTC')::date + 1
   GROUP BY v.day
   ORDER BY v.day DESC;
$$;

-- add-only (3): it only fixes: the calls replayed as the members themselves (every field as before for a member who never rewatched, current_streak still judged as before; a private member's analytics still refused), the runs counted over every viewing's day, and two fields added, current_run and monthly_viewings (B2B5 rehearsal piece)
CREATE OR REPLACE FUNCTION public.get_user_analytics(p_user_id uuid) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  result JSON;
  v_vault JSON := '[]'::json;
  v_decades JSON := '[]'::json;
  v_current integer := 0;
  v_longest integer := 0;
  v_run JSON;
  v_months JSON := '[]'::json;
BEGIN
  -- The check the other two functions already had. This one had none.
  IF NOT public.can_view_user_data(p_user_id) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  -- The two NEW fields, where a failure cannot reach the rest of the payload.
  BEGIN
    SELECT COALESCE(json_agg(row_to_json(vf)), '[]'::json) INTO v_vault
    FROM (
      SELECT COALESCE(f, 'unfiled') AS format, COUNT(*) AS count
      FROM physical_archive pa
      LEFT JOIN LATERAL unnest(NULLIF(pa.formats, '{}')) AS f ON TRUE
      WHERE pa.user_id = p_user_id
      GROUP BY 1 ORDER BY count DESC
    ) vf;
  EXCEPTION WHEN OTHERS THEN v_vault := '[]'::json;
  END;

  BEGIN
    SELECT COALESCE(json_agg(row_to_json(wd)), '[]'::json) INTO v_decades
    FROM (
      -- {1,4} not + : an unbounded pattern accepts a 20-digit string and the
      -- int cast then raises 22003, aborting everything.
      SELECT ((year::text)::int / 10) * 10 AS decade, COUNT(*) AS count
      FROM watchlists
      WHERE user_id = p_user_id
        AND year::text ~ '^\d{1,4}$'
        AND (year::text)::int > 0
      GROUP BY 1 ORDER BY 1 DESC
    ) wd;
  EXCEPTION WHEN OTHERS THEN v_decades := '[]'::json;
  END;

  -- The nights a member saw a film: every viewing's day, a rewatched film's earlier viewings
  -- among them. A run is consecutive days; date - row_number holds still along one, read
  -- ascending.
  --   current_streak: the run reaching the house's today or yesterday, as before, for the builds
  --     that read it.
  --   current_run: the newest run whole, its length and its last day, for the phone to judge on
  --     its own calendar (the house's day is not the member's). A day past the house's tomorrow
  --     is today nowhere, so a run ending after it is not the newest one.
  --   monthly_viewings: the viewings of each month, `YYYY-MM`.
  WITH viewed AS (
    SELECT v.day FROM public.member_viewings(p_user_id) v
  ),
  streak AS (
    SELECT d.day, d.day - (ROW_NUMBER() OVER (ORDER BY d.day))::int AS grp
    FROM (SELECT DISTINCT day FROM viewed) d
  ),
  runs AS (
    SELECT COUNT(*)::int AS len, MAX(day) AS ends_on FROM streak GROUP BY grp
  )
  SELECT
    COALESCE((SELECT r.len FROM runs r WHERE r.ends_on >= CURRENT_DATE - 1 ORDER BY r.ends_on DESC LIMIT 1), 0),
    COALESCE((SELECT MAX(r.len) FROM runs r), 0),
    (SELECT json_build_object('length', r.len, 'ends_on', r.ends_on)
       FROM runs r WHERE r.ends_on <= CURRENT_DATE + 1 ORDER BY r.ends_on DESC LIMIT 1),
    (SELECT COALESCE(json_agg(row_to_json(mv)), '[]'::json) FROM (
       SELECT TO_CHAR(day, 'YYYY-MM') AS month, COUNT(*) AS count
       FROM viewed GROUP BY 1 ORDER BY 1 DESC) mv)
  INTO v_current, v_longest, v_run, v_months;

  SELECT json_build_object(
    'total_logs', (SELECT COUNT(*) FROM logs WHERE user_id = p_user_id),
    'avg_rating', (SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0)
                   FROM logs WHERE user_id = p_user_id AND rating > 0),
    'rating_distribution', (
      SELECT COALESCE(json_agg(row_to_json(rd)), '[]'::json) FROM (
        SELECT rating, COUNT(*) as count FROM logs
        WHERE user_id = p_user_id AND rating > 0
        GROUP BY rating ORDER BY rating) rd),

    -- the 12-month window is gone. The Archive's records by the month each is filed under, as
    -- its headings count the posters beneath them.
    'monthly_activity', (
      SELECT COALESCE(json_agg(row_to_json(ma)), '[]'::json) FROM (
        SELECT TO_CHAR(COALESCE(watched_date::date, created_at::date), 'YYYY-MM') as month,
               COUNT(*) as count
        FROM logs WHERE user_id = p_user_id
        GROUP BY month ORDER BY month DESC) ma),

    'current_streak', v_current,
    'longest_streak', v_longest,
    'current_run', v_run,
    'monthly_viewings', v_months,

    -- unchanged: this is logs.format, how a film was watched — NOT the Vault
    'format_breakdown', (
      SELECT COALESCE(json_agg(row_to_json(fb)), '[]'::json) FROM (
        SELECT format, COUNT(*) as count FROM logs
        WHERE user_id = p_user_id AND format IS NOT NULL AND format != ''
        GROUP BY format ORDER BY count DESC) fb),

    'vault_formats', v_vault,
    'watchlist_decades', v_decades
  ) INTO result;

  RETURN result;
END;
$_$;

-- The viewings of one year, for Year in Cinema: each with its film, its mark and its day, newest
-- first, a page of 1,000 at a time. A page goes on from the last row of the one before it, by its
-- day and its viewing (a viewing's identity is its own for ever, so two viewings of one day are
-- never taken for each other). Its rights are the caller's.
-- Dropped first, so the piece can run again: a function this piece makes, which nothing else holds.
-- add-only (1): no shipped client uses it: a function this migration makes, named by no client before it (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.year_viewings(uuid, integer, date, uuid);
CREATE FUNCTION public.year_viewings(p_user_id uuid, p_year integer, p_before_day date DEFAULT NULL, p_before_viewing uuid DEFAULT NULL)
RETURNS TABLE(log_id uuid, viewing_id uuid, film_id integer, film_title text, poster_path text, rating numeric, day date)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT v.log_id, v.viewing_id, v.film_id, l.film_title, l.poster_path, v.rating, v.day
    FROM public.member_viewings(p_user_id) v
    JOIN public.logs l ON l.id = v.log_id
   WHERE v.day >= make_date(p_year, 1, 1) AND v.day < make_date(p_year + 1, 1, 1)
     AND (p_before_day IS NULL OR (v.day, v.viewing_id) < (p_before_day, p_before_viewing))
   ORDER BY v.day DESC, v.viewing_id DESC
   LIMIT 1000;
$$;

-- add-only (1): no shipped client uses it: a function this migration makes, named by no client before it (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.year_viewings(uuid, integer, date, uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.year_viewings(uuid, integer, date, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.year_viewings(uuid, integer, date, uuid) TO service_role;

-- ── A log's critique count is the reader's (review round 11) ──
-- A log card on the Reel counted every critique of the log (log_counts, kept the same for every
-- reader), critiques from members the reader has blocked or muted, or who blocked the reader, among
-- them; the log's own page counts only the critiques its reader may read (log_comments_hide_blocked).
-- The card said 3, the page "CRITIQUES · 2", and the shared count on the phone flipped between the
-- two with whichever was read last.
-- Now the feeds count a log's critiques as its page does: log_counts' number when the reader hides
-- no one (the common case, unchanged and as fast), else the critiques by members the reader does
-- not hide. The rule is also a computed field, critiques_seen, that a direct read of logs may ask
-- for beside log_counts' embed, so every count of a log's critiques is the reader's.
-- Every other column of both feeds is unchanged, and so are their names, arguments and columns.

-- The critiques of a log its reader may read: what its page counts.
-- As the caller (SECURITY INVOKER): log_counts and log_comments under their own rules, so a log the
-- caller cannot read counts nothing, whatever row is handed in.
CREATE OR REPLACE FUNCTION public.critiques_seen(l public.logs) RETURNS integer
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH me AS (SELECT public.hidden_authors() AS hidden)
  SELECT CASE
    WHEN COALESCE(cardinality(me.hidden), 0) = 0
      THEN COALESCE((SELECT c.critique_count FROM public.log_counts c WHERE c.log_id = l.id), 0)
    ELSE (SELECT count(*)::integer FROM public.log_comments x
           WHERE x.log_id = l.id AND NOT COALESCE(x.user_id = ANY (me.hidden), false))
  END
  FROM me;
$$;

-- add-only (1): no shipped client uses it: a function this migration makes, named by no client before it (TestFlight build 41 and the website checked)
-- A member's alone: a visitor hides no one, so log_counts' count is already theirs; and a computed
-- field is called with the whole row, which a visitor's column grants on logs never give (42501).
REVOKE ALL ON FUNCTION public.critiques_seen(l public.logs) FROM PUBLIC;
-- add-only (1): no shipped client uses it: a function this migration makes, named by no client before it (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.critiques_seen(l public.logs) FROM anon;
GRANT ALL ON FUNCTION public.critiques_seen(l public.logs) TO authenticated;
GRANT ALL ON FUNCTION public.critiques_seen(l public.logs) TO service_role;

-- The house feed (as the caller, as before). The hidden are asked for once (me), and only a reader
-- who hides someone has the critiques counted (under the caller's own rules, as the page counts them).
-- add-only (3): it only fixes: the calls replayed as the members themselves, every column of the house feed as before and its critique count without a member the reader has hidden (B4 rehearsal: a log's critiques are the reader's)
CREATE OR REPLACE FUNCTION public.get_community_feed_auth_cursor(p_limit integer DEFAULT 40, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, film_id integer, film_title text, poster_path text, rating numeric, review text, drop_cap boolean, status text, abandoned_reason text, created_at timestamp with time zone, year text, user_id uuid, username text, avatar_url text, role text, editorial_header text, pull_quote text, watched_with text, is_autopsied boolean, autopsy jsonb, is_spoiler boolean, certify_count integer, critique_count integer, certified boolean, alt_poster text, physical_media text)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH me AS (SELECT hidden_authors() AS hidden)
  SELECT
    l.id, l.film_id, l.film_title, l.poster_path, l.rating, l.review,
    l.drop_cap, l.status, l.abandoned_reason, l.created_at, l.year,
    l.user_id,
    p.username, p.avatar_url, p.role,
    l.editorial_header, l.pull_quote, l.watched_with,
    l.is_autopsied, l.autopsy, l.is_spoiler,
    COALESCE(c.certify_count, 0) AS certify_count,
    CASE
      WHEN COALESCE(cardinality(me.hidden), 0) = 0 THEN COALESCE(c.critique_count, 0)
      ELSE (SELECT count(*)::integer FROM log_comments x
             WHERE x.log_id = l.id AND NOT COALESCE(x.user_id = ANY (me.hidden), false))
    END AS critique_count,
    (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM interactions im
       WHERE im.target_log_id = l.id AND im.user_id = auth.uid() AND im.type = 'endorse_log'
    )) AS certified,
    l.alt_poster, l.physical_media
  FROM logs l
  JOIN profiles p ON p.id = l.user_id
  LEFT JOIN log_counts c ON c.log_id = l.id
  CROSS JOIN me
  WHERE l.review IS NOT NULL
    AND l.review <> ''
    AND NOT COALESCE(l.user_id = ANY ((SELECT hidden_authors())::uuid[]), false)
    AND (
      p_cursor_created_at IS NULL
      OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit;
$$;

-- The following feed (SECURITY DEFINER, as before: no row rules inside it, so the hidden are left
-- out by name, as its page's rules leave them out).
-- add-only (3): it only fixes: the calls replayed as the members themselves, every column of the following feed as before and its critique count without a member the reader has hidden (B4 rehearsal: a log's critiques are the reader's)
CREATE OR REPLACE FUNCTION public.get_following_feed_auth_cursor(p_limit integer DEFAULT 40, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, film_id integer, film_title text, poster_path text, rating numeric, review text, drop_cap boolean, status text, abandoned_reason text, created_at timestamp with time zone, year text, user_id uuid, username text, avatar_url text, role text, editorial_header text, pull_quote text, watched_with text, is_autopsied boolean, autopsy jsonb, is_spoiler boolean, certify_count integer, critique_count integer, certified boolean, alt_poster text, physical_media text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH me AS (SELECT public.hidden_authors() AS hidden),
  followed AS (
    SELECT i.target_user_id AS author
      FROM public.interactions i
     WHERE i.user_id = auth.uid()
       AND i.type = 'follow'
       AND NOT COALESCE(i.target_user_id = ANY ((SELECT public.hidden_authors())::uuid[]), false)
       AND public.can_view_user_data(i.target_user_id)
  ),
  page AS (
    SELECT r.id, r.created_at
      FROM followed f
      CROSS JOIN LATERAL (
        SELECT l.id, l.created_at
          FROM public.logs l
         WHERE l.user_id = f.author
           AND l.review IS NOT NULL
           AND l.review <> ''
           AND (p_cursor_created_at IS NULL OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id))
         ORDER BY l.created_at DESC, l.id DESC
         LIMIT p_limit
      ) r
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT p_limit
  )
  SELECT
    l.id, l.film_id, l.film_title, l.poster_path, l.rating, l.review,
    l.drop_cap, l.status, l.abandoned_reason, l.created_at, l.year,
    l.user_id,
    p.username, p.avatar_url, p.role,
    l.editorial_header, l.pull_quote, l.watched_with,
    l.is_autopsied, l.autopsy, l.is_spoiler,
    COALESCE(c.certify_count, 0) AS certify_count,
    CASE
      WHEN COALESCE(cardinality(me.hidden), 0) = 0 THEN COALESCE(c.critique_count, 0)
      ELSE (SELECT count(*)::integer FROM public.log_comments x
             WHERE x.log_id = l.id AND NOT COALESCE(x.user_id = ANY (me.hidden), false))
    END AS critique_count,
    EXISTS (
      SELECT 1 FROM public.interactions im
       WHERE im.target_log_id = l.id AND im.user_id = auth.uid() AND im.type = 'endorse_log'
    ) AS certified,
    l.alt_poster, l.physical_media
  FROM page pg
  JOIN public.logs l ON l.id = pg.id
  JOIN public.profiles p ON p.id = l.user_id
  LEFT JOIN public.log_counts c ON c.log_id = l.id
  CROSS JOIN me
  ORDER BY pg.created_at DESC, pg.id DESC;
$$;

-- ── B6 · a certification taken back takes its notice with it ────────────────────────────────────
--   A member who certified a log, took it back and certified it again left three notices, and the
--   author's Notices said "3 members certified your log" of one member (review round 11). Every
--   certification wrote a notice and nothing took one away. Of the two ways to keep the notices
--   true (write no second notice while one stands, or take the notice when the certification goes)
--   the second is chosen: the first left a notice standing for a certification already withdrawn,
--   still counted as a member who certified, against the card's own count. Now, as a follow
--   request takes its notice (a_request_takes_its_notice), a certification of a log or a stack
--   (interactions) and of a filing or a critique (dispatch_certifications) takes the notice it
--   wrote when it is withdrawn, or when what it certified is gone. The notices already standing
--   for a certification since withdrawn go once, here. Only new triggers: no client is changed by
--   it but in the notices it is shown.
--   The functions and the one-time sweep come here, while nothing is held; the two triggers are
--   made in the next car of the same train (20261117_02, B6.locks), whose rehearsal holds only the
--   cases that need them, so the tables they hold are held for milliseconds. A certification
--   withdrawn between the sweep and its trigger (the seconds between two cars of one train run,
--   never longer: the train stops at a car that fails, and its next run applies the trigger first)
--   keeps its notice, as every one did before.

-- add-only (1): no shipped client uses it: a trigger's function this migration makes, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_certification_takes_its_notice();
CREATE FUNCTION public.a_certification_takes_its_notice() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Its notice was written with these keys (notify_on_interaction); its author may be gone with
  -- the log or the stack, so the notice is found by its sender and its key.
  DELETE FROM public.notifications
   WHERE from_user_id = OLD.user_id
     AND type = 'endorse'
     AND group_key = CASE OLD.type
           WHEN 'endorse_log' THEN 'endorse:log:' || OLD.target_log_id
           ELSE 'endorse:list:' || OLD.target_list_id
         END;
  RETURN NULL;
END $$;

-- add-only (1): no shipped client uses it: a trigger's function this migration makes, called by no client (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.a_certification_takes_its_notice() FROM PUBLIC, anon, authenticated;

-- add-only (1): no shipped client uses it: a trigger's function this migration makes, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_dispatch_certification_takes_its_notice();
CREATE FUNCTION public.a_dispatch_certification_takes_its_notice() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Found by what dispatch_notify_certify wrote in its metadata: a critique's by the critique
  -- (whatever key it was written under), a filing's by the filing and no critique.
  IF OLD.comment_id IS NOT NULL THEN
    DELETE FROM public.notifications
     WHERE from_user_id = OLD.user_id
       AND type = 'endorse'
       AND metadata ->> 'comment_id' = OLD.comment_id::text;
  ELSE
    DELETE FROM public.notifications
     WHERE from_user_id = OLD.user_id
       AND type = 'endorse'
       AND metadata ->> 'dispatch_post_id' = OLD.post_id::text
       AND NOT (metadata ? 'comment_id');
  END IF;
  RETURN NULL;
END $$;

-- add-only (1): no shipped client uses it: a trigger's function this migration makes, called by no client (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.a_dispatch_certification_takes_its_notice() FROM PUBLIC, anon, authenticated;

-- Notices standing for a certification already taken back, or for one whose log, stack, filing or
-- critique is gone: each goes as the triggers would have taken it. One reading of the notices finds
-- the certifications' own (keyed as each writer keys them); only those are asked whether their
-- certification still stands, each kind as its trigger matches it.
WITH told AS MATERIALIZED (
  SELECT id FROM public.notifications
   WHERE type = 'endorse'
     AND (group_key LIKE 'endorse:log:%' OR group_key LIKE 'endorse:list:%'
          OR metadata ? 'comment_id' OR metadata ? 'dispatch_post_id'))
DELETE FROM public.notifications n
 USING told
 WHERE n.id = told.id
   AND ((n.group_key LIKE 'endorse:log:%'
         AND NOT EXISTS (SELECT 1 FROM public.interactions i
                          WHERE i.user_id = n.from_user_id AND i.type = 'endorse_log'
                            AND 'endorse:log:' || i.target_log_id = n.group_key))
     OR (n.group_key LIKE 'endorse:list:%'
         AND NOT EXISTS (SELECT 1 FROM public.interactions i
                          WHERE i.user_id = n.from_user_id AND i.type = 'endorse_list'
                            AND 'endorse:list:' || i.target_list_id = n.group_key))
     OR (n.metadata ? 'comment_id'
         AND NOT EXISTS (SELECT 1 FROM public.dispatch_certifications c
                          WHERE c.user_id = n.from_user_id AND c.comment_id::text = n.metadata ->> 'comment_id'))
     OR (n.metadata ? 'dispatch_post_id'
         AND NOT (n.metadata ? 'comment_id')
         AND NOT EXISTS (SELECT 1 FROM public.dispatch_certifications c
                          WHERE c.user_id = n.from_user_id AND c.post_id::text = n.metadata ->> 'dispatch_post_id')));

-- ── A rename the member chooses is kept, even to a handle's own cleaned form (review round 11) ──
-- A member whose handle predates today's letters (a dot or a capital: "john.doe") renamed it in Edit
-- Profile to the same letters cleaned ("johndoe"). The handle's rule put the old one back without a
-- word (it does so for old builds, which sent the cleaned handle on every save, a bio edit too): the
-- phone was told nothing, said DOSSIER AMENDED, and held a handle no row had, so the member's own
-- Profile tab said "Member Not Found" until the profile was read again, and the rename undid itself.
-- A rename the member chooses now comes through rename_my_handle, which marks its own write for that
-- statement alone (the setting reelhouse.deliberate_rename); the rule puts the old handle back only
-- for a write without the mark, as an old build's save is. Every other check on a new handle is
-- unchanged, and the house answers with the handle it kept. The put-back stays until no build older
-- than 2026-08-02 can reach the house.

-- add-only (3): it only fixes: the calls replayed as the members themselves, an old build's save keeping a handle that predates today's letters as before, a chosen rename to its cleaned form kept, and every other rename judged as before (D1.rehearsal.sql)
CREATE OR REPLACE FUNCTION public.enforce_username_policy() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  reserved text[] := ARRAY[
    'admin','administrator','mod','moderator','support','help',
    'reelhouse','system','root','official','staff','team','bot',
    'null','undefined','anonymous','anon','deleted','unknown',
    'api','www','mail','email','noreply','no_reply',
    'settings','login','signup','logout','feed','discover',
    'profile','edit','delete','create','new','user','users'
  ];
  v_raw    text;
  v_clean  text;
  v_hex    text;
  v_base   text;
  v_n      integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.username IS NOT DISTINCT FROM OLD.username THEN
    RETURN NEW;
  END IF;

  -- An old build's save: the cleaned form of a handle that predates today's letters, sent with
  -- every save. The handle is kept. A rename the member chose (rename_my_handle marks its own
  -- write) goes on to the checks below.
  IF TG_OP = 'UPDATE'
     AND current_setting('reelhouse.deliberate_rename', true) IS DISTINCT FROM 'on'
     AND NEW.username = regexp_replace(
           regexp_replace(lower(btrim(coalesce(OLD.username, ''))), '[[:space:]]+', '_', 'g'),
           '[^a-z0-9_]', '', 'g') THEN
    NEW.username := OLD.username;
    RETURN NEW;
  END IF;

  v_raw := coalesce(NEW.username, '');

  v_clean := regexp_replace(
               regexp_replace(lower(btrim(v_raw)), '[[:space:]]+', '_', 'g'),
               '[^a-z0-9_]', '', 'g');

  IF TG_OP = 'UPDATE' THEN
    IF v_clean IS DISTINCT FROM v_raw THEN
      RAISE EXCEPTION 'Usernames may only contain lowercase letters, numbers and underscores.'
        USING ERRCODE = '23514';
    END IF;
    IF length(v_clean) < 3 THEN
      RAISE EXCEPTION 'Username must be at least 3 characters.' USING ERRCODE = '23514';
    END IF;
    IF length(v_clean) > 30 THEN
      RAISE EXCEPTION 'Username must be 30 characters or less.' USING ERRCODE = '23514';
    END IF;
    IF left(v_clean, 1) = '_' OR right(v_clean, 1) = '_' THEN
      RAISE EXCEPTION 'Username cannot start or end with an underscore.' USING ERRCODE = '23514';
    END IF;
    IF position('__' in v_clean) > 0 THEN
      RAISE EXCEPTION 'Username cannot have consecutive underscores.' USING ERRCODE = '23514';
    END IF;
    IF v_clean = ANY(reserved) THEN
      RAISE EXCEPTION 'This username is reserved.' USING ERRCODE = '23514';
    END IF;
    IF public.handle_is_unwelcome(v_clean) THEN
      RAISE EXCEPTION 'This username is not allowed.' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles
                WHERE lower(username) = v_clean AND id <> NEW.id) THEN
      RAISE EXCEPTION 'This username is already taken.' USING ERRCODE = '23505';
    END IF;

    NEW.username := v_clean;
    RETURN NEW;
  END IF;

  v_hex := replace(NEW.id::text, '-', '');

  v_clean := regexp_replace(v_clean, '_+', '_', 'g');
  v_clean := btrim(v_clean, '_');
  v_clean := left(v_clean, 30);
  v_clean := btrim(v_clean, '_');

  IF length(v_clean) < 3 THEN
    v_clean := 'user_' || substr(v_hex, 1, 6);
  END IF;

  IF public.handle_is_unwelcome(v_clean) THEN
    v_clean := 'user_' || substr(v_hex, 1, 6);
  END IF;

  v_base := btrim(left(v_clean, 23), '_');
  v_n    := 0;
  WHILE v_clean = ANY(reserved)
        OR EXISTS (SELECT 1 FROM public.profiles
                    WHERE lower(username) = v_clean AND id <> NEW.id)
  LOOP
    v_n := v_n + 1;
    IF v_n > 20 THEN
      RAISE EXCEPTION 'Could not derive an available username.' USING ERRCODE = '23505';
    END IF;
    v_clean := v_base || '_' || substr(v_hex, v_n, 6);
  END LOOP;

  NEW.username := v_clean;
  RETURN NEW;
END;
$$;

-- The member's own rename, marked as chosen, answered with the handle the house kept. As the caller
-- (SECURITY INVOKER): the profile's own rules decide (the member's own row, in good standing, the
-- handle's checks), and a write that reached no row is refused, never answered as kept. The mark is
-- taken off again at once, so nothing else written in the same transaction carries it.
CREATE FUNCTION public.rename_my_handle(p_new text) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_me    uuid := auth.uid();
  v_kept  text;
  v_found boolean;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;

  PERFORM pg_catalog.set_config('reelhouse.deliberate_rename', 'on', true);
  UPDATE public.profiles SET username = p_new WHERE id = v_me RETURNING username INTO v_kept;
  v_found := FOUND;
  PERFORM pg_catalog.set_config('reelhouse.deliberate_rename', '', true);

  IF NOT v_found THEN
    RAISE EXCEPTION 'Your handle could not be changed.' USING ERRCODE = '42501';
  END IF;
  RETURN v_kept;
END;
$$;

-- add-only (1): no shipped client uses it: a function this migration makes, named by no client before it (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.rename_my_handle(text) FROM PUBLIC;
-- add-only (1): no shipped client uses it: a function this migration makes, named by no client before it (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.rename_my_handle(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rename_my_handle(text) TO authenticated, service_role;

-- ── A shared card whose piece is gone reads as gone (review round 11) ──
-- A member shares another member's essay (a filing) or stack in a salon: the card's headline is
-- copied into the sharer's own message (a filing's into film_title; a stack's title, its count, its
-- curator and its posters into the metadata). When the piece went (its author withdrew the filing,
-- the house took it down, the curator deleted the stack, or the member left and their stacks went
-- with the account, or they chose to erase their writing as they left), the card in every salon
-- still printed the old headline: words their writer had taken back, kept in another member's message.
-- Now the house takes the copy down at the moment the piece goes, as it takes a withdrawn message's
-- quotes down: a filing's card loses its headline and its byline, a stack's card keeps only its id,
-- and each is marked {"gone": true}, which the phone draws as WITHDRAWN. The card stays a door (the
-- filing's page says it was withdrawn; the stack's says it is gone), and the sharer's own words
-- under it are untouched.
--   Filings: in dispatch_empty_filing, the one erase of a filing that ends (end_filing, the
--   no_hard_delete trigger, and an account erased on leaving all come through it).
--   Stacks: a trigger after a stack's delete, which every way a stack goes reaches (the member's
--   own delete, and the account's cascade).
--   The cards of pieces already gone are taken down here, once: a filing ended before today, a
--   stack no longer in the house. They are taken down while nothing is held; the trigger is made
--   in the next car of the same train (20261117_02, F4.locks), so stacks are held for
--   milliseconds. A stack deleted between the two (the seconds between two cars of one train run,
--   never longer: the train stops at a car that fails, and its next run applies the trigger first)
--   keeps its card's headline, as every one did before.
-- A card is found by containment, so the cards' own index (lounge_messages_card_names) finds it.

-- The one erase of a filing that ends: as before, and now the filing's cards with it.
-- add-only (3): it only fixes: the calls replayed as the members themselves, a filing withdrawn by its author and its card in a salon reading as withdrawn, another card untouched (F4 rehearsal); TestFlight build 41 draws a card with no headline as no card, and the website draws none at all for a filing
CREATE OR REPLACE FUNCTION public.dispatch_empty_filing(p_post uuid, p_by text) RETURNS void
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH ended AS (
    UPDATE public.dispatch_posts
       SET body = '', full_content = NULL, title = NULL,
           subject_image = NULL, subject_backdrop = NULL,
           source = NULL, source_url = NULL, spoiler_label = NULL,
           ended_at = now(), ended_by = p_by
     WHERE id = p_post AND ended_at IS NULL
    RETURNING id
  )
  UPDATE public.lounge_messages m
     SET film_title = NULL, film_poster = NULL,
         metadata = (m.metadata - 'author_username') || jsonb_build_object('gone', true)
    FROM ended
   WHERE m.type = 'dossier_share'
     AND m.metadata <> '{}'::jsonb
     AND m.metadata @> jsonb_build_object('dossier_id', ended.id::text);
$$;

COMMENT ON FUNCTION public.dispatch_empty_filing(uuid, text) IS
  'The one erase of a filing that ends, its cards in the salons with it. Called by end_filing and the no_hard_delete trigger (both SECURITY DEFINER); no role may call it directly.';

-- A stack deleted takes its cards down with it (its trigger is made in 20261117_02, F4.locks).
-- add-only (1): no shipped client uses it: a trigger's function, new here; TestFlight build 41 and the website never call it
DROP FUNCTION IF EXISTS public.a_deleted_stack_leaves_its_cards();

CREATE FUNCTION public.a_deleted_stack_leaves_its_cards() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- The house's own write, so a_keeps_what_it_is lets it (the sharer's message is not the deleter's).
  UPDATE public.lounge_messages m
     SET metadata = jsonb_build_object('listId', OLD.id::text, 'gone', true)
   WHERE m.type = 'list_share'
     AND m.metadata <> '{}'::jsonb
     AND m.metadata @> jsonb_build_object('listId', OLD.id::text);
  RETURN NULL;
END $$;

-- add-only (1): no shipped client uses it: a trigger's function, new here; TestFlight build 41 and the website never call it
REVOKE ALL ON FUNCTION public.a_deleted_stack_leaves_its_cards() FROM PUBLIC, anon, authenticated;

-- The cards of pieces gone before today, taken down once, as the house would have.
UPDATE public.lounge_messages m
   SET film_title = NULL, film_poster = NULL,
       metadata = (m.metadata - 'author_username') || jsonb_build_object('gone', true)
  FROM public.dispatch_posts p
 WHERE m.type = 'dossier_share'
   AND m.metadata <> '{}'::jsonb
   AND m.metadata @> jsonb_build_object('dossier_id', p.id::text)
   AND p.ended_at IS NOT NULL
   AND NOT (m.metadata @> '{"gone": true}'::jsonb);

UPDATE public.lounge_messages m
   SET metadata = jsonb_build_object('listId', m.metadata ->> 'listId', 'gone', true)
 WHERE m.type = 'list_share'
   AND m.metadata <> '{}'::jsonb
   AND m.metadata ? 'listId'
   AND NOT (m.metadata @> '{"gone": true}'::jsonb)
   AND NOT EXISTS (SELECT 1 FROM public.lists l WHERE l.id::text = m.metadata ->> 'listId');

-- ── A member who leaves may take their words with them (review round 11) ──
-- Deleting an account told the member their critiques were "permanently destroyed", while the house
-- kept every word they had written for others to read: their critiques under records and filings,
-- their notes on other members' stacks, their Dispatch filings and their salon messages, each left
-- in place with the name taken off ('[deleted]', read as "a member, departed").
-- The owner's decision (2026-11-17): the words stay unsigned by default, and the member is told so;
-- and the member may choose, in the same act, to erase what they wrote as well.
-- request_account_deletion now takes p_erase_writing (default false, so every call made today, with
-- no argument, deletes exactly as before). With it on, before the name is taken off, the house takes
-- down every piece the member wrote for others, each in the form the house already uses when a
-- member takes one down themselves, so no other member's page breaks:
--   critiques under records (log_comments), notes on stacks (list_comments) and critiques in the
--   Dispatch (dispatch_comments) are deleted, as a member's own WITHDRAW deletes one; nothing else
--   hangs on them but their certifications (cascade) and a seeking filing's chosen answer (set to
--   none by its key); the counters on the records and filings settle by their own triggers;
--   filings (dispatch_posts) are withdrawn as their author withdraws one (dispatch_empty_filing,
--   'author'): the words go, the critiques others wrote under them stay, the page reads "withdrawn
--   by its author"; a series' title goes with them;
--   salon messages are withdrawn as a member withdraws one (content emptied, deleted_at set; the
--   card, the film and the quote it carried go too): the room shows "dispatch withdrawn", and every
--   reply that quoted it loses the quote (a_withdrawn_message_leaves_its_quotes);
--   a closed ballot's notice to its voters loses the question it quoted;
--   the old Dispatch tables (dossier_comments_legacy, dispatch_dossiers_legacy, which members can
--   still read) lose the member's critiques and essays the same way.
-- Either way, those old tables no longer keep the member's name on what stays (they kept the handle,
-- where every other table wrote '[deleted]'), and a stack's card shared in a salon no longer names
-- its departed curator (as a record's and an essay's cards already did not).

-- add-only (3): it only widens: the one call keeps its name and gains a parameter with a default, so TestFlight build 41 (AuthService) and the website (SettingsPage), which call request_account_deletion with no argument, close an account exactly as before; replayed as the members themselves (D2 rehearsal, a_member_may_always_leave_rehearsal.sql)
DROP FUNCTION IF EXISTS public.request_account_deletion();

CREATE FUNCTION public.request_account_deletion(p_erase_writing boolean DEFAULT false) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  uid      uuid := auth.uid();
  v_handle text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT username INTO v_handle FROM public.profiles WHERE id = uid;

  -- The member has asked; what follows is the house's own act.
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  UPDATE public.lounges l
     SET creator_id = (
           SELECT m.user_id FROM public.lounge_members m
            WHERE m.lounge_id = l.id AND m.user_id <> uid AND m.status = 'approved'
            ORDER BY m.joined_at ASC NULLS LAST
            LIMIT 1)
   WHERE l.creator_id = uid
     AND EXISTS (SELECT 1 FROM public.lounge_members m
                  WHERE m.lounge_id = l.id AND m.user_id <> uid AND m.status = 'approved');

  -- The member chose to take their words with them: each piece comes down in the form a member's own
  -- withdrawal gives it, before the name is taken off what stays.
  IF coalesce(p_erase_writing, false) THEN
    -- Critiques and notes: deleted, as WITHDRAW deletes one. The counters settle by their triggers.
    DELETE FROM public.log_comments      WHERE user_id = uid;
    DELETE FROM public.list_comments     WHERE user_id = uid;
    DELETE FROM public.dispatch_comments WHERE user_id = uid;

    -- A closed ballot's notice quoted its question to every voter: the notice stays, the question goes.
    UPDATE public.notifications n
       SET message = 'A ballot you voted in has closed.', metadata = n.metadata - 'title'
      FROM public.dispatch_posts p
     WHERE p.user_id = uid AND p.kind = 'ballot'
       AND n.from_user_id IS NULL
       AND n.metadata @> jsonb_build_object('dispatch_post_id', p.id, 'kind', 'ballot');

    -- Filings: withdrawn by their author. The critiques others wrote under them stay.
    PERFORM public.dispatch_empty_filing(p.id, 'author')
       FROM public.dispatch_posts p
      WHERE p.user_id = uid AND p.ended_at IS NULL;
    UPDATE public.dispatch_posts
       SET series_id = NULL, series_title = NULL, part_number = NULL
     WHERE user_id = uid AND series_id IS NOT NULL;

    -- Salon messages: withdrawn, with the card, the film and the quote they carried.
    UPDATE public.lounge_messages
       SET content = '', metadata = '{}'::jsonb, film_id = NULL, film_title = NULL, film_poster = NULL,
           reply_to_content = NULL, deleted_at = coalesce(deleted_at, now())
     WHERE user_id = uid;

    -- The old Dispatch tables, still open to read.
    DELETE FROM public.dossier_comments_legacy WHERE user_id = uid;
    UPDATE public.dispatch_dossiers_legacy
       SET title = '', excerpt = NULL, full_content = NULL
     WHERE user_id = uid;
  END IF;

  UPDATE public.log_comments
     SET user_id = NULL, username = '[deleted]'
   WHERE user_id = uid;

  UPDATE public.dossier_comments
     SET user_id = NULL, username = '[deleted]'
   WHERE user_id = uid;

  UPDATE public.dispatch_dossiers
     SET user_id = NULL, author_username = '[deleted]'
   WHERE user_id = uid;

  -- The old Dispatch tables kept the handle on what stays: the name comes off there too.
  UPDATE public.dossier_comments_legacy
     SET user_id = NULL, username = '[deleted]'
   WHERE user_id = uid;

  UPDATE public.dispatch_dossiers_legacy
     SET user_id = NULL, author_username = '[deleted]'
   WHERE user_id = uid;

  UPDATE public.lounge_messages
     SET reply_to_username = '[deleted]'
   WHERE reply_to_id IN (SELECT id FROM public.lounge_messages WHERE user_id = uid);

  DELETE FROM public.notifications WHERE from_user_id = uid;

  IF v_handle IS NOT NULL THEN
    -- Asked as containment, so the cards' own index (lounge_messages_card_names, 20261022_02) finds them.
    -- A stack's card names its curator: that name comes off as a record's and an essay's do.
    UPDATE public.lounge_messages
       SET metadata = ((metadata - 'owner_username') - 'author_username')
                      - CASE WHEN type = 'list_share' AND metadata @> jsonb_build_object('curator', v_handle)
                             THEN 'curator' ELSE '' END
     WHERE metadata <> '{}'::jsonb
       AND (metadata @> jsonb_build_object('owner_username', v_handle)
         OR metadata @> jsonb_build_object('author_username', v_handle)
         OR (type = 'list_share' AND metadata @> jsonb_build_object('curator', v_handle)));
  END IF;

  UPDATE public.list_comments   SET user_id = NULL WHERE user_id = uid;
  UPDATE public.lounge_messages SET user_id = NULL WHERE user_id = uid;

  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects WHERE owner = uid;

  DELETE FROM auth.users WHERE id = uid;
END
$$;

-- add-only (3): it only fixes: the grants the old call had (the house's members and the service; never PUBLIC or a visitor), restated for the call it became; TestFlight build 41 and the website reach it as members, replayed in the D2 rehearsal
REVOKE ALL ON FUNCTION public.request_account_deletion(boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_account_deletion(boolean) TO authenticated;
GRANT ALL ON FUNCTION public.request_account_deletion(boolean) TO service_role;

-- ── F11 · a certification buzzes the phone once (review round 11) ───────────────────────────────
--   A member who certified a record, took it back and certified it again sent its author a fresh
--   notice each time, and each notice a push: certifying and taking back at will, one member could
--   buzz another's phone as often as they liked. Since round 11 a certification taken back takes
--   its notice with it (a_certification_takes_its_notice), so the notices cannot remember a push
--   already sent. The house now keeps that memory itself: certifications_pushed holds, for each
--   member and each thing they certified (a record, a stack, a filing, a critique, a dossier), that
--   its push went. tg_notify_push sends a certification's push only when it can write that row; a
--   certification given again writes its notice as before (under the bell, counted once), and the
--   phone stays still. A push stopped before it was sent (the owner's switch, a block, the member's
--   own setting) writes no row, so a later certification may still push once.
--   The thing is named as its notice names it: a critique by the critique (its notice's group key
--   is the filing's, shared by every critique on it), every other by its notice's group key. The
--   rows go with either member's account; the table is the house's alone (no client reads or
--   writes it, row security on with no rule).

-- The table is made by the car before this one (20261117_00, F11.table), so the sign-ins that its keys
-- hold wait only for that car; here it is filled and written.

-- A certification whose notice stands has been told already: taken back and given again after
-- this, it does not push a second time either. Only a certification's own name is remembered:
-- every writer of a certification's notice keys it 'endorse:…' (a log's, a stack's, a filing's, a
-- dossier's; a critique's is named 'endorse:comment:…' here), so a row under any other key is one
-- tg_notify_push could never look up.
INSERT INTO public.certifications_pushed (from_user_id, user_id, thing, pushed_at)
SELECT DISTINCT ON (n.from_user_id, t.thing) n.from_user_id, n.user_id, t.thing, coalesce(n.pushed_at, n.created_at, now())
  FROM public.notifications n
 CROSS JOIN LATERAL (SELECT CASE WHEN n.metadata ? 'comment_id' THEN 'endorse:comment:' || (n.metadata ->> 'comment_id')
                                 ELSE n.group_key END AS thing) t
 WHERE n.type = 'endorse' AND n.from_user_id IS NOT NULL AND t.thing LIKE 'endorse:%' AND char_length(t.thing) <= 200
 ORDER BY n.from_user_id, t.thing, n.created_at
ON CONFLICT (from_user_id, thing) DO NOTHING;

-- As live, with one step before the push: a certification already pushed is not pushed again.
-- add-only (3): it only fixes: every other notice is pushed as before, and a certification's first push as before; replayed as the members in the F11 rehearsal (a certification, taken back, given again; another member's; a critique's and a filing's)
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

  -- A certification buzzes the phone once: given again after it was taken back, its notice is
  -- written, and its push is not sent. The thing is named as the notice names it, a critique by
  -- the critique (its group key is the filing's), every other by the group key.
  IF NEW.type = 'endorse' AND NEW.from_user_id IS NOT NULL THEN
    v_thing := CASE WHEN NEW.metadata ? 'comment_id' THEN 'endorse:comment:' || (NEW.metadata ->> 'comment_id')
                    ELSE NEW.group_key END;
    IF v_thing IS NOT NULL AND char_length(v_thing) <= 200 THEN
      INSERT INTO public.certifications_pushed (from_user_id, user_id, thing)
      VALUES (NEW.from_user_id, NEW.user_id, v_thing)
      ON CONFLICT (from_user_id, thing) DO NOTHING;
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
