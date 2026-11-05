-- ════════════════════════════════════════════════════════════════════════════
-- Undo of 20261105_02 — create_lounge as it was: the house makes the id.
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DROP FUNCTION public.create_lounge(text, text, boolean, uuid);

CREATE FUNCTION public.create_lounge(p_name text, p_description text, p_is_private boolean) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_id uuid; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  -- `invite_code` is deliberately NOT set. A room is entered by asking at the
  -- door and being admitted; a code would be a way around the door, and the
  -- table it would live in is readable by every member.
  INSERT INTO public.lounges (name, description, is_private, creator_id, member_count)
  VALUES (p_name, p_description, COALESCE(p_is_private, false), v_uid, 0)
  RETURNING id INTO v_id;
  INSERT INTO public.lounge_members (lounge_id, user_id, status) VALUES (v_id, v_uid, 'approved');
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_lounge(text, text, boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_lounge(text, text, boolean) TO anon;
GRANT ALL ON FUNCTION public.create_lounge(text, text, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.create_lounge(text, text, boolean) TO service_role;
