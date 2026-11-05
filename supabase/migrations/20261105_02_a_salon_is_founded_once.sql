-- ════════════════════════════════════════════════════════════════════════════
-- 20261105_02 — a salon asked for twice is founded once (P4.13).
-- ════════════════════════════════════════════════════════════════════════════
--   create_lounge made the room's id itself. When the answer was lost on the
--   way back (the house had founded the room; the phone heard nothing), the
--   form said it failed and the next tap founded a second room of the same
--   name, its member seated twice over in rooms of their own.
--   create_lounge now takes the id the form made when it opened (p_id), kept
--   across every tap until the room is made. Asked again with an id already
--   founded by the same member, the room is the answer, before any gate can
--   judge it as a second founding; an id of another member's room is refused
--   (42501). Two asks at once with one id found one room (ON CONFLICT on the
--   key), and the second answers with it.
--   An older call, with no p_id, founds as before.
-- Undo: mobile/supabase/migrations-down/20261105_02_a_salon_is_founded_once.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- One more argument, at its default: a function's arguments are its name, so the old one goes and
-- the new one takes every call it took. Every caller names its arguments (the app, build 41, the
-- website), so each older call resolves to it unchanged.
-- add-only (3): it only widens: the same function with p_id at its default; build 41's and the website's create_lounge calls replayed in the old clients' run (e2e-old-clients), each landing as before
DROP FUNCTION public.create_lounge(text, text, boolean);

CREATE FUNCTION public.create_lounge(p_name text, p_description text, p_is_private boolean, p_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_id uuid; v_uid uuid := auth.uid(); v_founder uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  -- Asked again with the id its form made (the first answer lost): the room it founded is the
  -- answer, before any gate can judge a second founding.
  IF p_id IS NOT NULL THEN
    SELECT creator_id INTO v_founder FROM public.lounges WHERE id = p_id;
    IF FOUND THEN
      IF v_founder IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'That room is another member''s.' USING ERRCODE = '42501';
      END IF;
      RETURN p_id;
    END IF;
  END IF;
  -- `invite_code` is deliberately NOT set. A room is entered by asking at the
  -- door and being admitted; a code would be a way around the door, and the
  -- table it would live in is readable by every member.
  INSERT INTO public.lounges (id, name, description, is_private, creator_id, member_count)
  VALUES (coalesce(p_id, gen_random_uuid()), p_name, p_description, COALESCE(p_is_private, false), v_uid, 0)
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_id;
  -- Two asks at once with one id: the first founded the room, and this one answers with it.
  IF v_id IS NULL THEN
    SELECT creator_id INTO v_founder FROM public.lounges WHERE id = p_id;
    IF v_founder IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'That room is another member''s.' USING ERRCODE = '42501';
    END IF;
    RETURN p_id;
  END IF;
  INSERT INTO public.lounge_members (lounge_id, user_id, status) VALUES (v_id, v_uid, 'approved');
  RETURN v_id;
END $$;

-- add-only (3): it only widens: the grants the old create_lounge had, on the new one; build 41's and the website's create_lounge calls replayed in the old clients' run (e2e-old-clients), each landing as before
REVOKE ALL ON FUNCTION public.create_lounge(text, text, boolean, uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_lounge(text, text, boolean, uuid) TO anon;
GRANT ALL ON FUNCTION public.create_lounge(text, text, boolean, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.create_lounge(text, text, boolean, uuid) TO service_role;
