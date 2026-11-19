-- Undo of 20261120_23: the words a member reported are kept when the report is filed, and the Tribunal reads them, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-B5, undone: the report keeps no words, and the evidence reads the piece as it stands alone ──
-- get_report_evidence as 20261118_01 left it; submit_report as 20261003_07 left it.

-- As 20261118_01 left it.
-- add-only (3): it only fixes: the undo of H-B5, the evidence read as round 12 made it (TestFlight build 41 and the website read it so)
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

-- As 20261003_07 left it.
-- add-only (3): it only fixes: the undo of H-B5, a report filed as round 4 made it (TestFlight build 41 and the website file so)
CREATE OR REPLACE FUNCTION public.submit_report(p_reporter_id uuid, p_content_id uuid, p_content_type text, p_reason text, p_details text DEFAULT NULL::text, p_target_user_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_reporter_id uuid := auth.uid();
  v_report_id uuid;
  v_recent_count int;
  v_target uuid;
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

  RETURN v_report_id;
END;
$$;

-- add-only (1): no shipped client uses it: a function H-B5 made, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.piece_as_it_stands(text, uuid);
