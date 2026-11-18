-- Undo of 20261118_01: the evidence and the verdict test a piece apart, a salon's door and a ballot are told as
-- the house's, a door answered keeps its notice, a follow pushes as often as given, a ballot is told across
-- a block, a notice taken back is not told, a notice across a block may be written, an answer is told again,
-- and search reads as the phone did. The notices taken back, retyped or kept from being written meanwhile
-- are not put back. The triggers on these functions go first, with 20261118_03's undo; the kinds' rule
-- after, with 20261118_00's.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── G-C4 undone · the house-wide search has no search_members ──────────────────────────────────
--   New in this round: undone, it is dropped, and the phone that reads search_members must be
--   undone with it (PEOPLE go back to the phone's two profile reads). The names' trigram index is
--   its own migration's to undo (20261118_02_the_names_are_found_by_their_pieces).
DROP FUNCTION IF EXISTS public.search_members(text, boolean, integer, text, integer);

-- ── G-C3 undone · the house-wide search has no search_logs again ─────────────────────────────────
--   search_logs is new in this round: undone, it is dropped, and the phone that reads it must be
--   undone with it (the search's logs go back to the phone's two reads).
DROP FUNCTION IF EXISTS public.search_logs(text, text, timestamp with time zone, uuid, integer);

-- ── G-B9 undone · an answer told on every change, as the house kept it before round 12 ───────────
--   dispatch_notify_answer exactly as the snapshot holds it, its grants kept (CREATE OR REPLACE); the
--   memory of the answers pushed leaves certifications_pushed. The notices taken are not put back:
--   each was for a critique no longer the answer.
-- add-only (3): it only fixes: the function as it was before round 12, its grants kept (CREATE OR REPLACE), replayed by the snapshot's own rehearsals
CREATE OR REPLACE FUNCTION public.dispatch_notify_answer() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE c record;
BEGIN
  IF NEW.answer_id IS NULL OR NEW.answer_id IS NOT DISTINCT FROM OLD.answer_id THEN
    RETURN NEW;
  END IF;
  SELECT id, user_id INTO c FROM public.dispatch_comments WHERE id = NEW.answer_id;
  PERFORM public.dispatch_notify(
    c.user_id, NEW.user_id, 'comment',
    'took your critique as the answer.',
    jsonb_build_object('dispatch_post_id', NEW.id, 'kind', NEW.kind, 'comment_id', c.id),
    'endorse:post:' || NEW.id);
  RETURN NEW;
END $$;

DELETE FROM public.certifications_pushed WHERE thing LIKE 'answer:%';

-- ── G-B7 undone · every notice written, a hidden member's too, hidden by the board's rule alone ──
-- add-only (1): no shipped client uses it: a trigger's function round 12 made, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_hidden_members_word_is_not_written();

-- ── G-B5 undone · the phone hears only new notices ────────────────────────────────────────────────
--   The function goes; its trigger, and the notices' channel rule as 20261015_01 made it, went first,
--   with 20261118_03's undo.
-- add-only (1): no shipped client uses it: a trigger's function round 12 made, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_notice_gone_is_told();

-- ── G-B4 undone · a ballot's close told to every voter, as the house kept it before round 12 ─────
--   dispatch_notify_ballot_closed exactly as the snapshot holds it, its grants kept (CREATE OR REPLACE).
-- add-only (3): it only fixes: the function as it was before round 12, its grants kept (CREATE OR REPLACE), replayed by the snapshot's own rehearsals
CREATE OR REPLACE FUNCTION public.dispatch_notify_ballot_closed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v record; msg text;
BEGIN
  IF NEW.frozen_totals IS NULL OR OLD.frozen_totals IS NOT NULL THEN RETURN NEW; END IF;
  msg := CASE WHEN btrim(coalesce(NEW.title,'')) = ''
              THEN 'A ballot you voted in has closed.'
              ELSE 'The ballot “' || btrim(NEW.title) || '” you voted in has closed.' END;
  FOR v IN SELECT DISTINCT user_id FROM public.dispatch_votes WHERE post_id = NEW.id LOOP
    INSERT INTO public.notifications (user_id, type, message, metadata, group_key)
    SELECT v.user_id, 'system', msg,
           jsonb_build_object('dispatch_post_id', NEW.id, 'kind', 'ballot',
                              'title', NEW.title),
           'endorse:post:' || NEW.id
     WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = v.user_id);
  END LOOP;
  RETURN NEW;
END $$;

-- ── G-B4, continued, undone · a ballot's notice stays with its voter when its author leaves ──
--   request_account_deletion exactly as 20261117_01 wrote it, its grants kept (CREATE OR REPLACE).
-- add-only (3): it only fixes: the function as round 11 left it, its grants kept (CREATE OR REPLACE), replayed by round 11's D2 rehearsal
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

-- ── G-B2 undone · a follow's notice stands after an unfollow, and only a certification is pushed once ──
--   tg_notify_push exactly as round 11 (20261117_01, F11) left it, its grants kept (CREATE OR REPLACE);
--   the follow trigger's function goes (the trigger went first, with 20261118_03's undo); the memory
--   keeps only what round 11 wrote in it (the certifications), and its comment goes. The follow
--   notices taken are not put back: each was for a follow already taken back.
-- add-only (3): it only fixes: the function as round 11 left it, its grants kept (CREATE OR REPLACE), replayed by round 11's F11 rehearsal
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

-- add-only (1): no shipped client uses it: a trigger's function round 12 made, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_follow_takes_its_notice();
DELETE FROM public.certifications_pushed WHERE thing LIKE 'follow:%';
COMMENT ON TABLE public.certifications_pushed IS NULL;

-- ── G-B1 undone · a salon request's notice stands after its answer ──────────────────────────────
--   The function goes (its trigger went first, with 20261118_03's undo). The notices it took, and those the piece took once, are not
--   put back: each was a request already answered, withdrawn or dissolved. The memory of the
--   requests already pushed leaves certifications_pushed, which keeps only round 11's rows.
-- add-only (1): no shipped client uses it: a trigger's function round 12 made, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_salon_request_takes_its_notice();
DELETE FROM public.certifications_pushed WHERE thing LIKE 'salon_request:%';

-- ── G-B6 undone · a salon's door and a ballot's close written as the house's own word ──────────
--   The two salon writers as they were (CREATE OR REPLACE, grants kept), the notices of the two
--   kinds written back as 'system' (a ballot's close naming no author, as before); the kinds' list
--   goes back as the snapshot holds it with 20261118_00's undo, after this.
-- add-only (3): it only fixes: the function as round 11 left it, its grants kept (CREATE OR REPLACE), replayed by round 11's rehearsal
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

-- add-only (3): it only fixes: the function as the snapshot holds it, its grants kept (CREATE OR REPLACE), replayed by the snapshot's own rehearsals
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
    VALUES (p_user_id, 'system', auth.uid(), 'You were admitted to ' || COALESCE(v_lname,'the lounge') || '.', p_lounge_id);
  END IF;
END $$;

UPDATE public.notifications SET type = 'system' WHERE type = 'salon';
UPDATE public.notifications SET type = 'system', from_user_id = NULL WHERE type = 'ballot';
-- The kinds' rule as 20261118_00 left it, not yet proved over the notices before (NOT VALID): this
-- piece's VALIDATE is undone, so 20261118_00's own undo finds the rule as it made it.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['follow'::text, 'endorse'::text, 'comment'::text, 'annotate'::text, 'retransmit'::text, 'system'::text, 'reaction'::text, 'follow_request'::text, 'follow_accept'::text, 'moderation'::text, 'featured'::text, 'salon'::text, 'ballot'::text]))) NOT VALID;

-- ── G-A2 undone · the evidence and the verdict as round 11 left them ─────────────────────────────
--   get_report_evidence and resolve_moderation_report_v2 exactly as 20261117_01 wrote them (their
--   grants kept, CREATE OR REPLACE), then piece_stands, which only they asked, goes. The verdict's
--   test of a standing piece is put back parenthesised, IF NOT (CASE ... END) THEN: bare, the
--   CASE's own THEN ends the IF's condition and PL/pgSQL refuses the function.
-- add-only (3): it only fixes: the function as round 11 left it, its grants kept (CREATE OR REPLACE), replayed by round 11's rehearsal
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

-- add-only (3): it only fixes: the function as round 11 left it, its grants kept (CREATE OR REPLACE), replayed by round 11's rehearsal
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

-- add-only (1): no shipped client uses it: a function round 12 made, asked by the house's moderation functions alone (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.piece_stands(text, uuid);
