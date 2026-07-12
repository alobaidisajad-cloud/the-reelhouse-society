-- ─────────────────────────────────────────────────────────────────────────────
-- 20260712_01_get_report_evidence
--
-- Adds the admin-only get_report_evidence(uuid) RPC.
--
-- WHY: A pre-launch live-DB audit (2026-07-12) found the client
-- (ModerationService.getReportEvidence -> tribunal "summon evidence" button)
-- calls supabase.rpc('get_report_evidence', { p_report_id }) — but the function
-- existed nowhere: not on the live DB, not in this repo. The evidence panel was
-- silently failing (caught in tribunal.tsx, rendered as "no evidence"). This
-- migration version-controls the function that was authored to close that gap,
-- so it can never silently drift out of the repo again.
--
-- SECURITY: SECURITY DEFINER, admin-gated identically to
-- resolve_moderation_report_v2 — auth.uid() (never a caller-supplied param) must
-- be a profiles.role = 'admin'. SET search_path = public blocks search-path
-- hijacking. EXECUTE revoked from anon/PUBLIC, granted to authenticated (the fn
-- self-guards to admin inside). Column names verified against the live schema
-- (note: log_comments/dossier_comments use `body`; list_comments/lounge_messages
-- use `content`). Deleted content or an unknown type returns { found: false }.
-- Idempotent (CREATE OR REPLACE) — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_report_evidence(p_report_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  ELSIF v_type = 'lounge_message' THEN            -- lounge_messages.content
    SELECT content, '/lounge/' || lounge_id::text
      INTO v_body, v_route FROM lounge_messages WHERE id = v_content_id;

  ELSIF v_type = 'lounge' THEN
    SELECT name, description, '/lounge/' || id::text
      INTO v_title, v_body, v_route FROM lounges WHERE id = v_content_id;

  ELSIF v_type = 'profile' THEN                   -- route uses username, not id
    SELECT username, bio, '/user/' || username
      INTO v_title, v_body, v_route FROM profiles WHERE id = v_content_id;

  ELSE
    RETURN jsonb_build_object('found', false);     -- unknown type -> graceful miss
  END IF;

  -- Content deleted since the report was filed -> route never got set
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

-- Lock down execution: authenticated only (self-guards to admin inside), never anon.
REVOKE ALL ON FUNCTION public.get_report_evidence(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_report_evidence(uuid) TO authenticated;
