-- ═══════════════════════════════════════════════════════════════════════════════
-- Restore create_lounge_with_member (Phase 2 #2) — APPLIED MANUALLY 2026-06-26
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ do NOT `supabase db push` — see WAVE0_LIVE_NOTES.md. Applied via SQL editor.
--
-- WAVE 0: the app calls create_lounge_with_member (4-param) to create a lounge, but
-- the function did NOT exist on the live DB → lounge creation was broken. Restored
-- the hardened version (creator = auth.uid(), not a spoofable param), + search_path.
-- Verified against the live lounge_members shape (id/joined_at/last_read_at all
-- defaulted; only lounge_id + user_id need inserting).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.create_lounge_with_member(text, text, boolean, text, uuid);
DROP FUNCTION IF EXISTS public.create_lounge_with_member(text, text, boolean, text);

CREATE FUNCTION public.create_lounge_with_member(
  p_name text,
  p_description text,
  p_is_private boolean,
  p_invite_code text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lounge_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.lounges (name, description, is_private, invite_code, creator_id, member_count)
  VALUES (p_name, p_description, p_is_private, p_invite_code, v_user_id, 0)
  RETURNING id INTO v_lounge_id;

  INSERT INTO public.lounge_members (lounge_id, user_id)
  VALUES (v_lounge_id, v_user_id);

  RETURN v_lounge_id;
END;
$$;

COMMIT;
