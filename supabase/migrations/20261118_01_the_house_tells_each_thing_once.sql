-- ════════════════════════════════════════════════════════════════════════════
-- 20261118_01 — the house tells each thing once, to the member it is for, and finds what is asked.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A filing already withdrawn read as found, empty, in a moderator's evidence: one test of whether a
--      piece still stands (piece_stands) serves the evidence and the verdict alike (review round 12).
--   2. A salon's door and a ballot's close were told as society announcements (system): they are their
--      own kinds, 'salon' with its own switch (notif_salons) and 'ballot' with the critiques'.
--   3. A request at a salon's door, answered, withdrawn or dissolved, stayed in the host's bell: it
--      takes its notice with it.
--   4. Follow, unfollow, follow again buzzed the other member's phone each time, and a follow taken back
--      left its notice: a follow takes its notice when it goes, and a follow or request pushes once in
--      thirty days, a salon request and an answer once (certifications_pushed, round 11's, widened).
--   5. A ballot's close was told across a block or mute, and for a ballot withheld or ended: it is not.
--   6. A notice the house took back stayed counted on an open phone: the member's own channel hears it.
--   7. A member's notice to another was written across a block or mute by several writers: one gate
--      refuses it at the door of the notices table.
--   8. A critique taken as the answer, moved away and back, told the first critic again: it is told once.
--   9. Universal search read every record under the read rule, a fixed number and no further, quoted
--      spoiler reviews and found authors by the phone: search_logs pages, finds by the words first,
--      leaves the hidden out, and says what is a spoiler.
--  10. Member search sorted 30 rows on the phone, losing a handle that begins with the words:
--      search_members orders exact, beginning, the rest, at the house, and pages.
--   This car makes every function and runs every one-time statement; it holds no table members read or
--   write. The kinds of 2 were widened by the car before it (20261118_00); the triggers of 3, 4, 6 and 7, and
--   the channel rule of 6, are the car after it (20261118_03), applied by the same train run. The
--   rehearsal holds each, the members acting as themselves; the cases that need the triggers are
--   20261118_03's.
-- Undo: mobile/supabase/migrations-down/20261118_01_the_house_tells_each_thing_once.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── G-A2 · a filing already withdrawn is evidence destroyed, asked as the verdict asks it (review round 12) ──
--   A moderator opening a case on a filing its author had withdrawn, or one another moderator had
--   already removed on a second report, saw an empty exhibit (“”) and was offered REMOVE CONTENT,
--   which the house then refused as PIECE_GONE, the typed reason lost with the closed sheet. A filing
--   is never deleted: ended, it keeps its row with its words emptied. The verdict asked whether a
--   piece still stands one way (a filing not yet ended), the evidence another (any row with that id),
--   and the two had drifted apart. Now one question answers both: piece_stands(type, id), the
--   verdict's own test lifted out whole. get_report_evidence asks it first and reads a piece gone as
--   destroyed (found: false), so the Tribunal offers only a dismissal or a verdict on the member from
--   the start; resolve_moderation_report_v2 asks the same, so the two can never disagree again.
--   Every other step of both is unchanged. A phone from before reads found: false already, as a
--   piece deleted.

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.piece_stands(text, uuid);
CREATE FUNCTION public.piece_stands(p_type text, p_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  -- Whether a reported piece still stands, as the house removes it: a filing is never deleted, only
  -- ended (its words emptied), and a salon message only withdrawn; every other piece stands while its
  -- row does. A kind no removal reaches (a salon, a profile) stands.
  SELECT CASE p_type
    WHEN 'log'              THEN EXISTS (SELECT 1 FROM public.logs WHERE id = p_id)
    WHEN 'list'             THEN EXISTS (SELECT 1 FROM public.lists WHERE id = p_id)
    WHEN 'log_comment'      THEN EXISTS (SELECT 1 FROM public.log_comments WHERE id = p_id)
    WHEN 'list_comment'     THEN EXISTS (SELECT 1 FROM public.list_comments WHERE id = p_id)
    WHEN 'dossier'          THEN EXISTS (SELECT 1 FROM public.dispatch_posts WHERE id = p_id AND ended_at IS NULL)
    WHEN 'dispatch_post'    THEN EXISTS (SELECT 1 FROM public.dispatch_posts WHERE id = p_id AND ended_at IS NULL)
    WHEN 'dossier_comment'  THEN EXISTS (SELECT 1 FROM public.dispatch_comments WHERE id = p_id)
    WHEN 'dispatch_comment' THEN EXISTS (SELECT 1 FROM public.dispatch_comments WHERE id = p_id)
    WHEN 'lounge_message'   THEN EXISTS (SELECT 1 FROM public.lounge_messages WHERE id = p_id AND deleted_at IS NULL)
    ELSE true
  END
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, asked by the house's moderation functions alone (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.piece_stands(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.piece_stands(text, uuid) TO service_role;

-- As round 11 left it, with one step before the exhibit is read: a piece already gone is destroyed.
-- add-only (3): it only fixes: the evidence of every standing piece is read as before, and a filing ended meanwhile reads as gone, as the G-A2 rehearsal replays as the moderator; TestFlight build 41 and the website read found: false already, as a piece deleted
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

  -- ── A piece already gone is destroyed evidence, asked as the verdict asks it (piece_stands) ──
  -- A filing ended (withdrawn by its author, or emptied by an earlier REMOVE CONTENT) keeps its row
  -- with its words emptied: it read as found, an empty exhibit, and REMOVE CONTENT was offered only
  -- to be refused as PIECE_GONE (review round 12).
  IF NOT public.piece_stands(v_type, v_content_id) THEN
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

-- As round 11 left it, the piece's standing asked of piece_stands, the question the evidence asks too.
-- add-only (3): it only fixes: a verdict on a pending case is made and told as before, a removal of a piece that stands carried out and one already gone refused as PIECE_GONE, as the G-A2 rehearsal replays as the moderator; TestFlight build 41 and the website call it as admins alone, and meet no new refusal
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

-- ── G-B6 · a salon's door and a ballot's close are heard under switches that name them (review round 12) ──
--   A host who turned off "System Alerts — Society announcements" to stop the house's announcements
--   stopped, with them, the pushes of members asking to enter their salon, of their own admission
--   to a salon, and of a ballot they voted in closing; on Android those arrived in "From the house",
--   at the highest weight, while "Members — a member follows you, asks to, or admits you" carried
--   none of them. All three were written as 'system', the kind of the house's own word.
--   Now a salon's request and admission are their own kind, 'salon', heard under a switch of their
--   own (notif_salons, "Salons" in Settings) and pushed to Android's "Members" channel, which every
--   installed build already has; a ballot's close is 'ballot' (G-B4), heard under the critiques'
--   switch and channel (G-B2's tg_notify_push and notify-push say so). The kinds are added to the
--   notices' list, and the notices already written are given their kind (a ballot's close its
--   author too, as G-B4 writes it), so the board draws each as what it is. A phone from before
--   reads any kind (its notice's kind is any word) and routes these by their salon and their key,
--   as before.

-- The notices' kinds are widened by the car before this one (20261118_00, G-B6.kinds), so the two
-- writers below may write them; the notices written before are given theirs at the end of this piece,
-- and the widened rule is proved over every notice there.

-- As round 11 left it, writing the request as a salon's notice.
-- add-only (3): it only fixes: a request is made and told as before, its notice of the kind 'salon'; replayed as the members themselves (G-B1 and G-B6 rehearsals); TestFlight build 41 and the website read any kind of notice
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
    VALUES (v_creator, 'salon', v_uname, auth.uid(),
            CASE WHEN v_uname IS NULL THEN 'A member is asking' ELSE 'is asking' END
              || ' to enter ' || COALESCE(v_lname,'your lounge') || '.',
            p_lounge_id);
  END IF;
END $$;

-- As the snapshot holds it, writing the admission as a salon's notice.
-- add-only (3): it only fixes: an admission is made and told as before, its notice of the kind 'salon'; replayed as the members themselves (G-B1 and G-B6 rehearsals); TestFlight build 41 and the website read any kind of notice
CREATE OR REPLACE FUNCTION public.approve_lounge_member(p_lounge_id uuid, p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_lname text; v_sanction text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF auth.uid() IS DISTINCT FROM (SELECT creator_id FROM public.lounges WHERE id = p_lounge_id) THEN
    RAISE EXCEPTION 'Only the host can admit members'; END IF;
  -- A banned member cannot be pending (request_lounge_membership refuses them),
  -- so the only sanction met here is a mute.
  SELECT status INTO v_sanction FROM public.lounge_sanctions WHERE lounge_id = p_lounge_id AND user_id = p_user_id;
  UPDATE public.lounge_members SET status = COALESCE(v_sanction, 'approved')
   WHERE lounge_id = p_lounge_id AND user_id = p_user_id AND status = 'pending';
  IF FOUND THEN
    SELECT name INTO v_lname FROM public.lounges WHERE id = p_lounge_id;
    INSERT INTO public.notifications (user_id, type, from_user_id, message, related_lounge_id)
    VALUES (p_user_id, 'salon', auth.uid(), 'You were admitted to ' || COALESCE(v_lname,'the lounge') || '.', p_lounge_id);
  END IF;
END $$;

-- The salon's notices and the ballots' closes written before, each given its kind, in one reading:
-- a salon's ('system' about a salon) is 'salon'; a ballot's close ('system' of the kind ballot, about
-- no salon) is 'ballot', and names its author (a ballot whose author has left names no one, as before).
-- Here, not under the kinds' rule: the rule allows both since 20261118_00, so this reading holds no
-- member's read or write (each row it changes, only for the moment it is changed).
UPDATE public.notifications n
   SET type = CASE WHEN n.related_lounge_id IS NOT NULL THEN 'salon' ELSE 'ballot' END,
       from_user_id = CASE WHEN n.related_lounge_id IS NOT NULL THEN n.from_user_id
                           ELSE (SELECT p.user_id FROM public.dispatch_posts p WHERE p.id::text = n.metadata ->> 'dispatch_post_id') END
 WHERE n.type = 'system' AND (n.related_lounge_id IS NOT NULL OR n.metadata ->> 'kind' = 'ballot');

-- The kinds' rule, added by 20261118_00 without reading the notices, proved over every notice now:
-- VALIDATE reads them under SHARE UPDATE EXCLUSIVE, which no member's read or write waits on.
-- add-only (3): it only widens: the kinds 20261118_00 allowed, every notice written before one of them once the statement above has run; replayed as the members (G-B6 and the kinds' rehearsals)
ALTER TABLE public.notifications VALIDATE CONSTRAINT notifications_type_check;

-- ── G-B1 · a salon request answered or withdrawn takes its notice with it (review round 12) ─────────
--   A member pressed REQUEST at a host's private salon; the host was pushed "The Lounge — @X is
--   asking to enter …" and the bell read 1. The host ADMITted (or DECLINEd) X at the door, or X
--   stepped out of the pending row first: the door's count fell to 0, but the bell still read 1 and
--   The Notices kept "@X is asking to enter …" unread, opening a door with no one at it. After a
--   decline X could ask again, and each new request wrote and pushed another notice beside the old.
--   Nothing took a request's notice away: approve_lounge_member changes the row's status,
--   decline_lounge_member and a member stepping out delete it, and no step touched the notice.
--   Now, as a follow request takes its notice (a_request_takes_its_notice), a salon request takes its
--   own when its pending row is answered (its status changes) or goes (declined, withdrawn, or the
--   salon dissolved): a_salon_request_takes_its_notice, after the row changes. The notice is found
--   as request_lounge_membership wrote it: the salon, the asker as its sender, to someone else
--   (an admission's sender is the host, so an admission is never taken). Round 12 writes a request
--   as type 'salon' (G-B6); one written before is 'system': both are matched.
--   The push is sent once for each asker and salon (G-B2's tg_notify_push, remembered in
--   certifications_pushed as 'salon_request:<salon>'): the requests already told are remembered
--   here first, then the notices standing for a request no longer pending go, once.
--   The phone takes the notice off the bell at once when the host answers at the door
--   (forgetSalonRequestNotices), and hears the rest from the house (G-B5).

-- The requests already told: one asked again after this is not pushed a second time.
INSERT INTO public.certifications_pushed (from_user_id, user_id, thing, pushed_at)
SELECT DISTINCT ON (n.from_user_id, n.related_lounge_id)
       n.from_user_id, n.user_id, 'salon_request:' || n.related_lounge_id, coalesce(n.pushed_at, n.created_at, now())
  FROM public.notifications n
 WHERE n.type IN ('system', 'salon') AND n.related_lounge_id IS NOT NULL AND n.from_user_id IS NOT NULL
   AND n.from_user_id IS DISTINCT FROM (SELECT l.creator_id FROM public.lounges l WHERE l.id = n.related_lounge_id)
   AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = n.user_id)
 ORDER BY n.from_user_id, n.related_lounge_id, n.created_at
ON CONFLICT (from_user_id, thing) DO NOTHING;

-- add-only (1): no shipped client uses it: a trigger's function this piece makes, dropped first so it is made new (no grant it did not ask for), called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_salon_request_takes_its_notice();
CREATE FUNCTION public.a_salon_request_takes_its_notice() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Asked again while still pending (the status written over with itself): the request stands.
  IF TG_OP = 'UPDATE' AND NEW.status = 'pending' THEN
    RETURN NULL;
  END IF;
  -- The request's notice: about this salon, from the one who asked, to someone else (the host).
  DELETE FROM public.notifications
   WHERE type IN ('salon', 'system')
     AND related_lounge_id = OLD.lounge_id
     AND from_user_id = OLD.user_id
     AND user_id IS DISTINCT FROM OLD.user_id;
  RETURN NULL;
END $$;
-- add-only (1): no shipped client uses it: a trigger's function this piece makes, called by no client (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.a_salon_request_takes_its_notice() FROM PUBLIC, anon, authenticated;

-- Notices standing for a request no longer pending (answered, declined, withdrawn, or its salon
-- dissolved): each goes as the trigger above would have taken it. An admission is never one of
-- them, its salon dissolved or not (its words are the house's own: "You were admitted to …"). The
-- trigger is made in the next car of the same train (20261118_03): a request answered between the two
-- (the seconds between two cars of one train run, never longer: the train stops at a car that fails,
-- and its next run applies the trigger first) keeps its notice, as every one did before.
DELETE FROM public.notifications n
 WHERE n.type IN ('salon', 'system')
   AND n.related_lounge_id IS NOT NULL
   AND n.from_user_id IS NOT NULL
   AND n.user_id IS DISTINCT FROM n.from_user_id
   AND n.message NOT LIKE 'You were admitted to %'
   AND n.from_user_id IS DISTINCT FROM (SELECT l.creator_id FROM public.lounges l WHERE l.id = n.related_lounge_id)
   AND NOT EXISTS (SELECT 1 FROM public.lounge_members m
                    WHERE m.lounge_id = n.related_lounge_id AND m.user_id = n.from_user_id AND m.status = 'pending');

-- ── G-B2 · a follow taken back takes its notice; a follow, a request, a salon request and an answer each buzz the phone once (review round 12) ──
--   1. A member who followed another and took it back left "@X is following you." standing, and a
--      follow given again wrote it again: after an unfollow the notice said X followed, and follow,
--      unfollow, follow wrote two. Nothing took a follow's notice (a follow request's is taken by
--      a_request_takes_its_notice). Now, as round 11 made a certification take its notice, a follow
--      taken back (an unfollow, or a block that removes it) takes the notice it wrote:
--      a_follow_takes_its_notice. A follow request admitted becomes a follow by an update and wrote
--      no follow notice, so nothing else changes. The follow notices already standing for a follow
--      since taken back go once, here.
--   2. Following, unfollowing and following again buzzed the other member's phone every time (one
--      act a second was the only brake), and so did a request at a private member's door, withdrawn
--      and made again. Round 11 gave the house a memory of the pushes sent for certifications
--      (certifications_pushed, F11); round 12 widens the same memory, under the same name, to every
--      act one member may repeat at another at will, each named as its notice is:
--        a follow or a follow request:   'follow:<recipient>'  once in 30 days for each pair, so a
--                                          member who follows again a month on is told again;
--        a request to enter a salon:     'salon_request:<salon>' once (G-B1);
--        a critique taken as the answer: 'answer:<critique>'    once (G-B9).
--      A certification keeps its rule: once. tg_notify_push sends a push only when it can write (or,
--      for a follow past its 30 days, renew) that row; the notice is written under the bell either
--      way. A push stopped before it was sent (the owner's switch, a block, the member's own setting)
--      writes no row, so a later act may still push once.
--   3. The kinds of notice round 12 adds (G-B6) are heard under their own switches: a salon's door
--      ('salon') under notif_salons, a ballot's close ('ballot') under notif_comments.
--   The follows and requests already told are remembered first, from their notices, as F11 seeded
--   the certifications; the table's comment says what it now holds. Every other step of
--   tg_notify_push is as round 11 left it.

-- The follows and follow requests already told: one given again within 30 days of its notice is not
-- pushed a second time. Only the last 30 days are remembered: a follow told before them is told
-- again either way (its row would be renewed by tg_notify_push, as no row is written), so it is read
-- by the notices' own index on their day (a notice is claimed for its push within minutes of being
-- written, so a day more holds every one pushed in the 30 days).
INSERT INTO public.certifications_pushed (from_user_id, user_id, thing, pushed_at)
SELECT DISTINCT ON (n.from_user_id, n.user_id)
       n.from_user_id, n.user_id, 'follow:' || n.user_id, coalesce(n.pushed_at, n.created_at, now())
  FROM public.notifications n
 WHERE n.type IN ('follow', 'follow_request') AND n.from_user_id IS NOT NULL
   AND n.created_at >= now() - interval '31 days'
   AND coalesce(n.pushed_at, n.created_at) >= now() - interval '30 days'
 ORDER BY n.from_user_id, n.user_id, n.created_at DESC
ON CONFLICT (from_user_id, thing) DO UPDATE SET pushed_at = greatest(public.certifications_pushed.pushed_at, EXCLUDED.pushed_at);

COMMENT ON TABLE public.certifications_pushed IS 'The house''s memory of the pushes sent for the acts one member may repeat at another at will: a certification (its notice''s group key, a critique''s by the critique), a follow or follow request (follow:<recipient>, renewed after 30 days), a request to enter a salon (salon_request:<salon>), a critique taken as the answer (answer:<critique>). Written by tg_notify_push alone; no client reads or writes it.';

-- add-only (1): no shipped client uses it: a trigger's function this piece makes, dropped first so it is made new (no grant it did not ask for), called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_follow_takes_its_notice();
CREATE FUNCTION public.a_follow_takes_its_notice() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Its notice was written with these keys (notify_on_interaction): to the one followed, from the
  -- follower, saying they follow.
  DELETE FROM public.notifications
   WHERE user_id = OLD.target_user_id
     AND from_user_id = OLD.user_id
     AND type = 'follow';
  RETURN NULL;
END $$;
-- add-only (1): no shipped client uses it: a trigger's function this piece makes, called by no client (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.a_follow_takes_its_notice() FROM PUBLIC, anon, authenticated;

-- Follow notices standing for a follow already taken back: each goes as the trigger would have taken it.
-- The trigger is made in the next car of the same train (20261118_03): a follow taken back between the
-- two (the seconds between two cars of one train run, never longer: the train stops at a car that
-- fails, and its next run applies the trigger first) keeps its notice, as every one did before.
DELETE FROM public.notifications n
 WHERE n.type = 'follow'
   AND n.from_user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.interactions i
                    WHERE i.user_id = n.from_user_id AND i.target_user_id = n.user_id AND i.type = 'follow');

-- As round 11 left it, with the memory widened and the two new kinds given their switches.
-- add-only (3): it only fixes: every other notice is pushed as before, a certification's once as before, and a follow, a follow request, a salon request and an answer each once; replayed as the members in the G-B1, G-B2 and G-B9 rehearsals (each given, taken back, given again; another member's; a switch off)
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

-- ── G-B4 · a ballot's close is told only to those who may read it (review round 12) ──────────────
--   A member voted on another member's ballot, then blocked or muted its author (or the author
--   blocked them). When the ballot closed, the house still told them, and pushed them, "The ballot
--   “<the hidden author's question>” you voted in has closed.", and the tap opened "This filing is
--   no longer here." A ballot the house had withheld was told to its voters the same way. The close's
--   notice was written straight into the notices, past dispatch_notify's block and mute test, and
--   named no author, so neither the push's block test nor the board's hidden filter could see whose
--   words it carried.
--   Now the close is told only of a ballot its voters can open (published, not ended, not withheld),
--   to each voter with no block or mute between them and its author, and the notice names its author
--   (from_user_id, no handle, as the house's admission to a salon does), so a block or mute made
--   after it hides it on the board as every other member's notice. Its kind is 'ballot' (G-B6),
--   heard under the critiques' switch and channel. Every other step is as before.
-- add-only (3): it only fixes: a ballot's voters are told of its close as before, and a voter hidden from its author, or the voters of a ballot withheld, are not; replayed as the members themselves (G-B4 rehearsal); TestFlight build 41 and the website read any kind of notice
CREATE OR REPLACE FUNCTION public.dispatch_notify_ballot_closed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v record; msg text;
BEGIN
  IF NEW.frozen_totals IS NULL OR OLD.frozen_totals IS NOT NULL THEN RETURN NEW; END IF;
  -- A ballot no voter can open (ended, withheld by the house, or unpublished) is told to no one.
  IF NEW.ended_at IS NOT NULL OR NEW.withheld_at IS NOT NULL OR NOT coalesce(NEW.is_published, false) THEN
    RETURN NEW;
  END IF;
  msg := CASE WHEN btrim(coalesce(NEW.title,'')) = ''
              THEN 'A ballot you voted in has closed.'
              ELSE 'The ballot “' || btrim(NEW.title) || '” you voted in has closed.' END;
  -- Each voter, but one who blocked or muted the author, or whom the author blocked: the same test
  -- dispatch_notify makes of every other Dispatch notice.
  FOR v IN SELECT DISTINCT dv.user_id FROM public.dispatch_votes dv
            WHERE dv.post_id = NEW.id
              AND NOT EXISTS (SELECT 1 FROM public.user_blocks b
                               WHERE (b.blocker_id = dv.user_id AND b.blocked_id = NEW.user_id)
                                  OR (b.blocker_id = NEW.user_id AND b.blocked_id = dv.user_id AND b.type = 'block'))
  LOOP
    INSERT INTO public.notifications (user_id, type, from_user_id, message, metadata, group_key)
    SELECT v.user_id, 'ballot', NEW.user_id, msg,
           jsonb_build_object('dispatch_post_id', NEW.id, 'kind', 'ballot',
                              'title', NEW.title),
           'endorse:post:' || NEW.id
     WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = v.user_id);
  END LOOP;
  RETURN NEW;
END $$;

-- ── G-B4, continued · a ballot's notice stays with its voter when its author leaves ──
--   A closed ballot's notice named no one, and an account closed with its words erased took the
--   question out of it, the notice staying with each voter (round 11). Naming its author (above), it
--   would have gone instead, with every notice the departing member sent. Now an erase finds it by its
--   author too, and a close of either kind leaves it with its voter, unsigned as the ballot stays.
--   Every other step of request_account_deletion is as round 11 left it.
-- add-only (3): it only fixes: an account is closed as before, with or without its words, and a ballot's notice stays with its voter as round 11 kept it; replayed as the members themselves (round 11's D2 rehearsal and the G-B4 rehearsal); TestFlight build 41 and the website call it as before
CREATE OR REPLACE FUNCTION public.request_account_deletion(p_erase_writing boolean DEFAULT false) RETURNS void
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
    -- (written before round 12 it names no author; since, it names this member)
    UPDATE public.notifications n
       SET message = 'A ballot you voted in has closed.', metadata = n.metadata - 'title'
      FROM public.dispatch_posts p
     WHERE p.user_id = uid AND p.kind = 'ballot'
       AND (n.from_user_id IS NULL OR n.from_user_id = uid)
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

  -- A closed ballot's notice names its author since round 12, so a block or a mute hides it: it stays
  -- with each voter, unsigned as the ballot itself stays, as it did before it named anyone.
  UPDATE public.notifications SET from_user_id = NULL WHERE from_user_id = uid AND type = 'ballot';

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

-- ── G-B5 · the phone hears the house take a notice back (review round 12) ─────────────────────────
--   The house takes notices back on its own: a follow request withdrawn, a follow or a certification
--   taken back, a salon request answered (round 12), a member's notices with their account. The
--   phone's live channel heard only new notices (postgres_changes, INSERT), so an open phone kept
--   counting the gone notice in the bell, drew it on a board opened from what it held, and a
--   certification given again read as two until the next whole read.
--   A deleted row cannot be heard over postgres_changes as one member's alone (a DELETE carries no
--   filter, and under row security it would reach every member's phone), so the house tells each
--   member's phone on a topic of their own: a_notice_gone_is_told sends, once per statement and per
--   member, the ids of their notices that went ('notices_gone' on the private topic
--   'notices:<member>', through realtime.send as the salon's typing is sent). The notices' channel
--   rule is widened to let each signed-in member receive their own topic, and no one else's. The
--   phone drops those ids and their unread count (notificationStore). A member whose account is
--   gone is told nothing. A phone from before opens no such topic and hears nothing new.

-- add-only (1): no shipped client uses it: a trigger's function this piece makes, dropped first so it is made new (no grant it did not ask for), called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_notice_gone_is_told();
CREATE FUNCTION public.a_notice_gone_is_told() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  r record;
BEGIN
  -- One word per member a statement touched, holding the ids of their notices that went. A member
  -- whose account went with them has no phone to tell.
  FOR r IN SELECT g.user_id, jsonb_agg(g.id) AS ids
             FROM gone g
            WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = g.user_id)
            GROUP BY g.user_id
  LOOP
    PERFORM realtime.send(jsonb_build_object('ids', r.ids), 'notices_gone', 'notices:' || r.user_id::text, true);
  END LOOP;
  RETURN NULL;
END $$;
-- add-only (1): no shipped client uses it: a trigger's function this piece makes, called by no client (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.a_notice_gone_is_told() FROM PUBLIC, anon, authenticated;

-- ── G-B7 · what a hidden member does is not written as news (review round 12) ───────────────────
--   A member muted another; the muted member followed them and certified their log (a mute is one
--   way: both are allowed). The house wrote both notices, hidden from the board only while the mute
--   stood; unmuted, the bell jumped and the board showed "@B is following you." and "@B certified
--   your log of …", unread, dated during the mute. The Dispatch's notices were never written across a
--   mute (dispatch_notify asks first), so the house told the same act two ways.
--   Now one gate stands before every notice: a notice from a member, to a member who has blocked or
--   muted them, or whom they have blocked, is not written (a_hidden_members_word_is_not_written,
--   before each insert). No writer can forget it: the follow, the certification, the critique on a
--   log or a stack, a salon's request, a ballot's close (G-B4), and any written later. The house's
--   own word (a moderation notice, the Lobby's) is never stopped. The act itself is untouched: a
--   follow request still waits at the door, a follow still counts; only the news of it is not told.
--   A notice written before a block or a mute is hidden from the board while it stands, as before.

-- add-only (1): no shipped client uses it: a trigger's function this piece makes, dropped first so it is made new (no grant it did not ask for), called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_hidden_members_word_is_not_written();
CREATE FUNCTION public.a_hidden_members_word_is_not_written() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- The pair is asked for directly, as dispatch_notify asks it: inside a trigger the session's
  -- viewer is the one acting, never the one told.
  IF NEW.from_user_id IS NOT NULL
     AND NEW.from_user_id IS DISTINCT FROM NEW.user_id
     AND NEW.type NOT IN ('moderation', 'featured')
     AND EXISTS (SELECT 1 FROM public.user_blocks b
                  WHERE (b.blocker_id = NEW.user_id AND b.blocked_id = NEW.from_user_id)
                     OR (b.blocker_id = NEW.from_user_id AND b.blocked_id = NEW.user_id AND b.type = 'block'))
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;
-- add-only (1): no shipped client uses it: a trigger's function this piece makes, called by no client (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.a_hidden_members_word_is_not_written() FROM PUBLIC, anon, authenticated;

-- ── G-B9 · an answer moved takes its notice, and is pushed once (review round 12) ────────────────
--   The author of a seeking took critic C1's critique as the answer: C1 was pushed "A New Critique —
--   @S took your critique as the answer." The author took C2's instead: C1's notice still said
--   theirs was the answer. Taken back to C1, C1 was pushed again and held two such notices. Each
--   change of the answer wrote a notice and nothing took one away.
--   Now, as a certification taken back takes its notice, the answer moved away (to another critique,
--   or to none) takes the notice it wrote; the new answer's notice is written as before, marked as an
--   answer (metadata 'answer'), so the push is titled as what it is ("Taken as the Answer",
--   notify-push) and sent once for each critique (G-B2's tg_notify_push, remembered in
--   certifications_pushed as 'answer:<critique>'). The answers already told are remembered first,
--   from their notices; the notices standing for a critique that is no longer the answer go, once.

-- The answers already told: one taken again after this is not pushed a second time.
INSERT INTO public.certifications_pushed (from_user_id, user_id, thing, pushed_at)
SELECT DISTINCT ON (n.from_user_id, n.metadata ->> 'comment_id')
       n.from_user_id, n.user_id, 'answer:' || (n.metadata ->> 'comment_id'), coalesce(n.pushed_at, n.created_at, now())
  FROM public.notifications n
 WHERE n.type = 'comment' AND n.from_user_id IS NOT NULL AND n.metadata ? 'comment_id'
   AND (n.metadata ? 'answer' OR n.message = 'took your critique as the answer.')
 ORDER BY n.from_user_id, n.metadata ->> 'comment_id', n.created_at
ON CONFLICT (from_user_id, thing) DO NOTHING;

-- As the snapshot holds it, with the answer moved away taking its notice, and the new one marked.
-- add-only (3): it only fixes: an answer taken is told as before, now marked as an answer, and an answer moved away takes its notice; replayed as the members themselves (G-B9 rehearsal); TestFlight build 41 and the website read the same words
CREATE OR REPLACE FUNCTION public.dispatch_notify_answer() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE c record;
BEGIN
  IF NEW.answer_id IS NOT DISTINCT FROM OLD.answer_id THEN
    RETURN NEW;
  END IF;
  -- The answer moved away (to another critique, or to none): its critic's notice goes with it. A
  -- notice written before the answer was marked is known by its words.
  IF OLD.answer_id IS NOT NULL THEN
    DELETE FROM public.notifications
     WHERE from_user_id = NEW.user_id
       AND type = 'comment'
       AND metadata ->> 'comment_id' = OLD.answer_id::text
       AND (metadata ? 'answer' OR message = 'took your critique as the answer.');
  END IF;
  IF NEW.answer_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT id, user_id INTO c FROM public.dispatch_comments WHERE id = NEW.answer_id;
  PERFORM public.dispatch_notify(
    c.user_id, NEW.user_id, 'comment',
    'took your critique as the answer.',
    jsonb_build_object('dispatch_post_id', NEW.id, 'kind', NEW.kind, 'comment_id', c.id, 'answer', true),
    'endorse:post:' || NEW.id);
  RETURN NEW;
END $$;

-- Notices standing for a critique no longer the answer of its seeking: each goes as the trigger
-- would have taken it.
DELETE FROM public.notifications n
 WHERE n.type = 'comment'
   AND n.from_user_id IS NOT NULL
   AND n.metadata ? 'comment_id'
   AND (n.metadata ? 'answer' OR n.message = 'took your critique as the answer.')
   AND NOT EXISTS (SELECT 1 FROM public.dispatch_posts p
                    WHERE p.id::text = n.metadata ->> 'dispatch_post_id'
                      AND p.answer_id::text = n.metadata ->> 'comment_id');

-- ── The house-wide search reads its logs by pages, and says which are spoilers (review round 12) ──
--   The search's LOGS were two reads made by the phone (the film or the writing; the writer's
--   handle), each cut at twenty and merged, with no way past them: a log older than the newest
--   twenty that held the word was found nowhere, and a review its author marked as spoilers was
--   quoted in the clear, its spoiler mark never read. search_logs is the one read: a record whose
--   film title or review holds the words, or whose author's handle holds the handle, newest first,
--   by pages (the last row's time and id are the next page's cursor), never a record of a member
--   the reader has hidden, and with each record's is_spoiler, for the phone to veil it. A record
--   with no review is not a search result, as before. Nothing searched finds nothing. A page is at
--   most 51 rows (the phone asks 21: 20 to show, one to know there is more).
--   The words arrive as the phone's buildSearchPattern made them (the one funnel: its own escapes
--   for % _ \ and *, each of ( ) , standing for any one character), and are read as an ILIKE
--   pattern with the backslash as its escape, as PostgREST read them.
--   What it finds is what the logs' read rule lets the reader read, applied here to the records
--   found, row for row as the rule reads it: the reader's own (their rule "Users can manage their
--   logs"), or one can_view_user_data lets them read (logs_select_authorized: a public member's, a
--   private member's to their followers), and never one by a member hidden_authors() names
--   (logs_hide_blocked: one the reader blocked or muted, or who blocked the reader). Read with the
--   reader's own rights, that rule was asked of every record before the words were (no row rule
--   lets a pattern reach an index first), so each search read all the records, calling
--   can_view_user_data on each: 20-30 s at 100,000 members, against a 30 s limit. It runs as the
--   house (SECURITY DEFINER) so the words reach the indexes first, and asks the rule of the few
--   records found (the rehearsal holds a private, a blocked and a muted author's record out).
--   How it reads, fastest first:
--     1. the members whose handle holds the handle, by profiles_username_trigram (a thousand at most:
--        a handle more share than that is asked of each record's author as it is read);
--     2. the newest 5,000 reviewed records after the cursor, walked by logs_reviewed_newest and asked
--        the words: a word many records hold fills its page here (a page of 21 needs a word one
--        record in some 240 holds), and only the records found are joined to their authors;
--     3. a word rarer than that is read by its trigram pieces (logs_reviewed_words, 20261118_04; the
--        handle's members' records by logs_reviewed_by_author): every record holding it, at most
--        some 5,000 by the walk's measure, each asked the rule, the page the newest of them;
--     4. a search with no three letters or digits in a row has no trigram to read by: past the walk,
--        it reads every reviewed record once, in the table's order (a word nearly every record holds
--        is found in the walk; a letter or two almost none hold reads them all, some seconds, as
--        every search did before).
--   Each read is planned for the words it is given (plan_cache_mode), so a rare word and a common
--   one each take the plan that suits them.

-- Dropped first, so the piece can run again: a function this piece makes, which nothing else holds.
-- add-only (1): no shipped client uses it: a function this migration makes, named by no client before it (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.search_logs(text, text, timestamp with time zone, uuid, integer);
CREATE FUNCTION public.search_logs(p_pattern text, p_handle text DEFAULT NULL::text, p_cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid, user_id uuid, film_title text, review text, rating numeric, poster_path text, status text, abandoned_reason text, is_spoiler boolean, created_at timestamp with time zone, username text, role text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    SET plan_cache_mode TO 'force_custom_plan'
    AS $$
#variable_conflict use_column
DECLARE
  v_me      uuid := auth.uid();
  v_hidden  uuid[];
  v_limit   integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 51);
  v_words   text := '%' || p_pattern || '%';
  v_handle  text := CASE WHEN COALESCE(p_handle, '') <> '' THEN '%' || p_handle || '%' END;
  -- The cursor as one bound on (created_at, id), newest first: none is the newest record.
  v_at      timestamp with time zone := COALESCE(p_cursor_at, 'infinity'::timestamp with time zone);
  v_id      uuid := CASE WHEN p_cursor_at IS NULL THEN 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid ELSE p_cursor_id END;
  -- A trigram is three letters or digits in a row: without one, no index can find the words.
  v_pieces  boolean := p_pattern ~ '[[:alnum:]]{3}';
  v_authors uuid[] := '{}'::uuid[];
  v_many    boolean := false;
  v_page    uuid[];
BEGIN
  IF COALESCE(p_pattern, '') = '' THEN
    RETURN;
  END IF;
  v_hidden := COALESCE((SELECT public.hidden_authors()), '{}'::uuid[]);

  -- 1. The members the handle finds.
  IF v_handle IS NOT NULL THEN
    SELECT COALESCE(array_agg(a.id), '{}'::uuid[]) INTO v_authors
      FROM (SELECT pa.id FROM public.profiles pa WHERE pa.username ILIKE v_handle ESCAPE '\' LIMIT 1001) a;
    v_many := cardinality(v_authors) > 1000;
  END IF;

  -- 2. The newest 5,000 reviewed records after the cursor, each asked the words; the rule asked of
  -- the records found.
  SELECT array_agg(w.id ORDER BY w.created_at DESC, w.id DESC) INTO v_page
    FROM (SELECT r.id, r.created_at
            FROM (SELECT l.id, l.created_at, l.user_id, l.film_title, l.review
                    FROM public.logs l
                   WHERE l.review IS NOT NULL AND l.review <> ''
                     AND (l.created_at, l.id) < (v_at, v_id)
                   ORDER BY l.created_at DESC, l.id DESC
                   LIMIT 5000) r
            JOIN public.profiles p ON p.id = r.user_id
           WHERE (r.film_title ILIKE v_words ESCAPE '\' OR r.review ILIKE v_words ESCAPE '\'
                  OR r.user_id = ANY (v_authors)
                  OR (v_many AND EXISTS (SELECT 1 FROM public.profiles pa
                                          WHERE pa.id = r.user_id AND pa.username ILIKE v_handle ESCAPE '\')))
             AND NOT (r.user_id = ANY (v_hidden))
             AND (r.user_id = v_me OR NOT COALESCE(p.is_social_private, false) OR public.can_view_user_data(r.user_id))
           ORDER BY r.created_at DESC, r.id DESC
           LIMIT v_limit) w;
  IF COALESCE(cardinality(v_page), 0) >= v_limit THEN
    NULL;
  ELSIF v_pieces THEN
    -- 3. Not full within the walk: the words are rare, and every record holding them is read by its pieces.
    SELECT array_agg(w.id ORDER BY w.created_at DESC, w.id DESC) INTO v_page
      FROM (SELECT m.id, m.created_at
              FROM (SELECT l.id, l.created_at, l.user_id
                      FROM public.logs l
                     WHERE l.review IS NOT NULL AND l.review <> ''
                       AND (l.film_title ILIKE v_words ESCAPE '\' OR l.review ILIKE v_words ESCAPE '\')
                    UNION
                    SELECT l.id, l.created_at, l.user_id
                      FROM public.logs l
                     WHERE NOT v_many AND l.user_id = ANY (v_authors)
                       AND l.review IS NOT NULL AND l.review <> ''
                    UNION
                    SELECT l.id, l.created_at, l.user_id
                      FROM public.profiles pa
                      JOIN public.logs l ON l.user_id = pa.id
                     WHERE v_many AND pa.username ILIKE v_handle ESCAPE '\'
                       AND l.review IS NOT NULL AND l.review <> '') m
              JOIN public.profiles p ON p.id = m.user_id
             WHERE (m.created_at, m.id) < (v_at, v_id)
               AND NOT (m.user_id = ANY (v_hidden))
               AND (m.user_id = v_me OR NOT COALESCE(p.is_social_private, false) OR public.can_view_user_data(m.user_id))
             ORDER BY m.created_at DESC, m.id DESC
             LIMIT v_limit) w;
  ELSE
    -- 4. No trigram, and not full within the walk: every reviewed record is read once, in the table's
    -- own order (no index can find the words, and walking them newest first reads each by its index,
    -- some seven times slower), and the newest found make the page. The words and the order are said
    -- so no index answers either.
    SELECT array_agg(w.id ORDER BY w.created_at DESC, w.id DESC) INTO v_page
      FROM (SELECT l.id, l.created_at
              FROM public.logs l
              JOIN public.profiles p ON p.id = l.user_id
             WHERE l.review IS NOT NULL AND l.review <> ''
               AND (l.created_at, l.id) < (v_at, v_id)
               AND ((l.film_title || '') ILIKE v_words ESCAPE '\' OR (l.review || '') ILIKE v_words ESCAPE '\'
                    OR l.user_id = ANY (v_authors)
                    OR (v_many AND p.username ILIKE v_handle ESCAPE '\'))
               AND NOT (l.user_id = ANY (v_hidden))
               AND (l.user_id = v_me OR NOT COALESCE(p.is_social_private, false) OR public.can_view_user_data(l.user_id))
             ORDER BY (l.created_at + interval '0 seconds') DESC, l.id DESC
             LIMIT v_limit) w;
  END IF;

  RETURN QUERY
  SELECT l.id, l.user_id, l.film_title, l.review, l.rating, l.poster_path, l.status, l.abandoned_reason,
         COALESCE(l.is_spoiler, false), l.created_at, p.username, p.role
    FROM unnest(v_page) WITH ORDINALITY AS g(log_id, n)
    JOIN public.logs l ON l.id = g.log_id
    JOIN public.profiles p ON p.id = l.user_id
   ORDER BY g.n;
END $$;

-- add-only (1): no shipped client uses it: a function this migration makes, named by no client before it (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.search_logs(text, text, timestamp with time zone, uuid, integer) FROM PUBLIC;
-- A visitor searches as a member does (the logs were read by both): the read rule decides what each finds.
GRANT ALL ON FUNCTION public.search_logs(text, text, timestamp with time zone, uuid, integer) TO anon;
GRANT ALL ON FUNCTION public.search_logs(text, text, timestamp with time zone, uuid, integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_logs(text, text, timestamp with time zone, uuid, integer) TO service_role;

-- ── The house-wide search finds the members whose handle begins with the words (review round 12) ──
--   PEOPLE read the first thirty members whose handle or name held the words, in the order of
--   their handles, and only then put the closest first: once thirty handles sorting before
--   "samantha" held "sam" (any "absam", any "adamsam", any name holding it), the member whose
--   handle begins with the words was never shown, and nothing paged past the thirty.
--   search_members chooses in the house, closest first: the handle that is the words, then the
--   handles that begin with them, then the names that begin with them, then the rest that hold
--   them, each in the order of its handle; by pages (the last row's closeness and handle are the
--   next page's cursor; a handle is unique, so no row is read twice or skipped); never a member the
--   reader has hidden (hidden_authors()). p_handles_only reads handles alone (a search written as
--   "@kane"). It runs with the reader's own rights, as the profiles were read before.
--   The words arrive as the phone's buildSearchPattern made them (the one funnel: its own escapes
--   for % _ \ and *, each of ( ) , standing for any one character), and are read as an ILIKE
--   pattern with the backslash as its escape, as PostgREST read them. Nothing searched finds
--   no one. A page is at most 51 rows (the phone asks 21: 20 to show, one to know there is more).
--   The handles are found by profiles_username_trigram; the names by profiles_display_name_trigram,
--   so a search of three letters or more never reads every profile. That index is built
--   CONCURRENTLY, alone, before this migration (20261118_02_the_names_are_found_by_their_pieces),
--   so members write their profiles on while it builds; the search reads the same rows without it,
--   only slower.

-- Dropped first, so the piece can run again: a function this piece makes, which nothing else holds.
-- add-only (1): no shipped client uses it: a function this migration makes, named by no client before it (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.search_members(text, boolean, integer, text, integer);
CREATE FUNCTION public.search_members(p_pattern text, p_handles_only boolean DEFAULT false, p_cursor_closeness integer DEFAULT NULL::integer, p_cursor_username text DEFAULT NULL::text, p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid, username text, avatar_url text, role text, closeness integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT m.id, m.username, m.avatar_url, m.role, m.closeness
    FROM (
      SELECT p.id, p.username, p.avatar_url, p.role,
             CASE WHEN p.username ILIKE p_pattern ESCAPE '\' THEN 0
                  WHEN p.username ILIKE p_pattern || '%' ESCAPE '\' THEN 1
                  WHEN NOT COALESCE(p_handles_only, false) AND p.display_name ILIKE p_pattern || '%' ESCAPE '\' THEN 2
                  ELSE 3 END AS closeness
        FROM public.profiles p
       WHERE COALESCE(p_pattern, '') <> ''
         AND (p.username ILIKE '%' || p_pattern || '%' ESCAPE '\'
              OR (NOT COALESCE(p_handles_only, false) AND p.display_name ILIKE '%' || p_pattern || '%' ESCAPE '\'))
         AND NOT COALESCE(p.id = ANY ((SELECT public.hidden_authors())::uuid[]), false)
    ) m
   WHERE p_cursor_closeness IS NULL OR (m.closeness, m.username) > (p_cursor_closeness, p_cursor_username)
   ORDER BY m.closeness, m.username
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 51);
$$;

-- add-only (1): no shipped client uses it: a function this migration makes, named by no client before it (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.search_members(text, boolean, integer, text, integer) FROM PUBLIC;
-- A visitor searches as a member does (the profiles were read by both).
GRANT ALL ON FUNCTION public.search_members(text, boolean, integer, text, integer) TO anon;
GRANT ALL ON FUNCTION public.search_members(text, boolean, integer, text, integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_members(text, boolean, integer, text, integer) TO service_role;
