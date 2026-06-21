-- Atomic creation of a lounge and its founding member
CREATE OR REPLACE FUNCTION create_lounge_with_member(
  p_name text,
  p_description text,
  p_is_private boolean,
  p_invite_code text,
  p_creator_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lounge_id uuid;
BEGIN
  -- Insert the lounge
  INSERT INTO public.lounges (name, description, is_private, invite_code, creator_id, member_count)
  VALUES (p_name, p_description, p_is_private, p_invite_code, p_creator_id, 0)
  RETURNING id INTO v_lounge_id;

  -- Insert the member
  INSERT INTO public.lounge_members (lounge_id, user_id)
  VALUES (v_lounge_id, p_creator_id);

  RETURN v_lounge_id;
END;
$$;
