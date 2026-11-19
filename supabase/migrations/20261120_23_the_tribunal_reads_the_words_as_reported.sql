-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_23 — the words a member reported are kept when the report is filed, and the Tribunal reads them.
-- ════════════════════════════════════════════════════════════════════════════
--   1. An author who edited or deleted what was reported before the verdict handed the moderator a clean
--      exhibit: submit_report keeps the piece's words as they stand, and get_report_evidence reads them
--      beside the piece as it stands now, and whether they changed (review round 14).
--   Functions only; no table is locked. The words are kept in 20261120_22's table.
-- Undo: mobile/supabase/migrations-down/20261120_23_the_tribunal_reads_the_words_as_reported.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-B5 · the words a member reported are kept when the report is filed, and the Tribunal reads them (review round 14) ──
--   A member reported a hateful review, critique or message; its author edited it into something
--   harmless, or deleted it, before the verdict; the moderator pressed SUMMON THE EVIDENCE and read the
--   edited words (a clean exhibit, likely dismissed), or "The evidence has been destroyed". The house
--   kept no copy of what was reported: get_report_evidence read the piece as it stood at the moment it
--   was asked, and a copy was taken only when the verdict was REMOVE CONTENT, too late.
--   Now:
--   1. one reading of a piece serves the report and the evidence alike (piece_as_it_stands, the
--      evidence's own per-kind reads lifted out whole, a page's display name and picture and a salon's
--      cover added, so a moderator sees what a report about them was about);
--   2. submit_report keeps the piece's words as they stand when the report is filed (reported_words,
--      H-B5.table), in the same statement that files it;
--   3. get_report_evidence answers the piece as it stands now, as before, and beside it the words as
--      reported and whether they have changed since; a piece deleted since reads as destroyed, as
--      before, with the words as reported beside it, so the member can still be judged on them.
--   A report filed before this piece has no words kept, and its evidence reads exactly as before. A phone
--   from before reads found, title, body and route as it always did, and leaves the rest unread.

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.piece_as_it_stands(text, uuid);
CREATE FUNCTION public.piece_as_it_stands(p_type text, p_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_title text;
  v_body  text;
  v_route text;
  v_more  jsonb := '{}'::jsonb;
BEGIN
  -- A piece already gone (deleted, withdrawn, emptied by an earlier removal) is asked as the verdict
  -- asks it (piece_stands): the two can never disagree.
  IF p_id IS NULL OR NOT public.piece_stands(p_type, p_id) THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF p_type = 'log' THEN
    SELECT film_title, review, '/log/' || id::text
      INTO v_title, v_body, v_route FROM public.logs WHERE id = p_id;

  ELSIF p_type = 'list' THEN
    SELECT title, description, '/stacks/' || id::text
      INTO v_title, v_body, v_route FROM public.lists WHERE id = p_id;

  ELSIF p_type = 'log_comment' THEN               -- log_comments.body
    SELECT body, '/log/' || log_id::text
      INTO v_body, v_route FROM public.log_comments WHERE id = p_id;

  ELSIF p_type = 'list_comment' THEN              -- list_comments.content
    SELECT content, '/stacks/' || list_id::text
      INTO v_body, v_route FROM public.list_comments WHERE id = p_id;

  ELSIF p_type = 'dossier' THEN
    SELECT title, full_content, '/dossier/' || id::text
      INTO v_title, v_body, v_route FROM public.dispatch_dossiers WHERE id = p_id;

  ELSIF p_type = 'dossier_comment' THEN           -- dossier_comments.body
    SELECT body, '/dossier/' || dossier_id::text
      INTO v_body, v_route FROM public.dossier_comments WHERE id = p_id;

  ELSIF p_type = 'dispatch_post' THEN
    SELECT title, coalesce(full_content, body), '/dispatch/' || id::text
      INTO v_title, v_body, v_route FROM public.dispatch_posts WHERE id = p_id;

  ELSIF p_type = 'dispatch_comment' THEN
    SELECT body, '/dispatch/' || post_id::text
      INTO v_body, v_route FROM public.dispatch_comments WHERE id = p_id;

  ELSIF p_type = 'lounge_message' THEN            -- lounge_messages.content
    SELECT content, '/lounge/' || lounge_id::text
      INTO v_body, v_route FROM public.lounge_messages WHERE id = p_id AND deleted_at IS NULL;

  ELSIF p_type = 'lounge' THEN                    -- a salon is reported for its name, words or cover
    SELECT name, description, '/lounge/' || id::text, jsonb_build_object('cover_image', cover_image)
      INTO v_title, v_body, v_route, v_more FROM public.lounges WHERE id = p_id;

  ELSIF p_type = 'profile' THEN                   -- a page is reported for its words or its picture
    SELECT username, bio, '/user/' || username, jsonb_build_object('display_name', display_name, 'avatar_url', avatar_url)
      INTO v_title, v_body, v_route, v_more FROM public.profiles WHERE id = p_id;

  ELSE
    RETURN jsonb_build_object('found', false);     -- unknown type: a graceful miss
  END IF;

  -- Content deleted since: the route never got set.
  IF v_route IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object('found', true, 'title', v_title, 'body', v_body, 'route', v_route)
      || jsonb_strip_nulls(coalesce(v_more, '{}'::jsonb));
END;
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, asked by the house's report and moderation functions alone (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.piece_as_it_stands(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.piece_as_it_stands(text, uuid) TO service_role;

-- As round 12 left it (20261118_01), the exhibit read by piece_as_it_stands, and the words as reported
-- beside it.
-- add-only (3): it only fixes: the evidence of a report filed before reads as before, and one filed after carries the words as reported beside the piece as it stands, as the H-B5 rehearsal replays as the moderator and the members; TestFlight build 41 and the website read found, title, body and route as before
CREATE OR REPLACE FUNCTION public.get_report_evidence(p_report_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_admin_id   uuid := auth.uid();
  v_type       text;
  v_content_id uuid;
  v_now        jsonb;
  v_reported   jsonb;
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

  -- The piece as it stands now: destroyed when it is gone, as the verdict asks it.
  v_now := public.piece_as_it_stands(v_type, v_content_id);

  -- The words as they stood when the report was filed, kept by submit_report (none for a report
  -- filed before the house kept them: the evidence reads as it always did).
  SELECT words INTO v_reported FROM public.reported_words WHERE report_id = p_report_id;
  IF v_reported IS NULL THEN
    RETURN v_now;
  END IF;

  -- Changed: the piece still stands and its words (its name, picture, cover) are not those reported.
  -- Its address is left out: a page renamed is changed by its name already.
  RETURN v_now || jsonb_build_object(
    'reported', v_reported - 'route',
    'changed', coalesce((v_now ->> 'found')::boolean, false)
               AND (v_now - 'found' - 'route') IS DISTINCT FROM (v_reported - 'route'));
END;
$$;

-- As 20261003_07 left it, the words reported kept with the report, in the statement that files it.
-- add-only (3): it only fixes: a report is filed, refused and counted as before, and the words it is about are kept with it, as the H-B5 rehearsal replays as the members themselves; TestFlight build 41 and the website file reports through it and meet no new refusal
CREATE OR REPLACE FUNCTION public.submit_report(p_reporter_id uuid, p_content_id uuid, p_content_type text, p_reason text, p_details text DEFAULT NULL::text, p_target_user_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_reporter_id uuid := auth.uid();
  v_report_id uuid;
  v_recent_count int;
  v_target uuid;
  v_words jsonb;
BEGIN
  IF v_reporter_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*) INTO v_recent_count
  FROM reports
  WHERE reporter_id = v_reporter_id
    AND created_at > now() - interval '1 hour';

  IF v_recent_count >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum 10 reports per hour';
  END IF;

  -- The member is read from the item, never taken from the caller.
  v_target := CASE p_content_type
    WHEN 'profile'          THEN (SELECT id FROM profiles WHERE id = p_content_id)
    WHEN 'log'              THEN (SELECT user_id FROM logs WHERE id = p_content_id)
    WHEN 'list'             THEN (SELECT user_id FROM lists WHERE id = p_content_id)
    WHEN 'log_comment'      THEN (SELECT user_id FROM log_comments WHERE id = p_content_id)
    WHEN 'list_comment'     THEN (SELECT user_id FROM list_comments WHERE id = p_content_id)
    WHEN 'dossier'          THEN (SELECT user_id FROM dispatch_posts WHERE id = p_content_id)
    WHEN 'dispatch_post'    THEN (SELECT user_id FROM dispatch_posts WHERE id = p_content_id)
    WHEN 'dossier_comment'  THEN (SELECT user_id FROM dispatch_comments WHERE id = p_content_id)
    WHEN 'dispatch_comment' THEN (SELECT user_id FROM dispatch_comments WHERE id = p_content_id)
    WHEN 'lounge_message'   THEN (SELECT user_id FROM lounge_messages WHERE id = p_content_id)
    WHEN 'lounge'           THEN (SELECT creator_id FROM lounges WHERE id = p_content_id)
  END;

  IF p_content_type = 'profile' AND v_reporter_id = v_target THEN
    RAISE EXCEPTION 'Cannot report your own profile';
  END IF;

  BEGIN
    INSERT INTO reports (reporter_id, content_id, content_type, reason, details, target_user_id, status)
    VALUES (v_reporter_id, p_content_id, p_content_type, p_reason, p_details, v_target, 'pending')
    RETURNING id INTO v_report_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Already reported' USING ERRCODE = '23505';
  END;

  -- The words reported, as they stand now: whatever their author does before the verdict, the
  -- Tribunal reads what was reported beside what is left (get_report_evidence).
  v_words := public.piece_as_it_stands(p_content_type, p_content_id);
  IF coalesce((v_words ->> 'found')::boolean, false) THEN
    INSERT INTO public.reported_words (report_id, words) VALUES (v_report_id, v_words - 'found');
  END IF;

  RETURN v_report_id;
END;
$$;
