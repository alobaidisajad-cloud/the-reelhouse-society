-- ═══════════════════════════════════════════════════════════════════════════
-- A SECRET NOBODY USES IS STILL A SECRET
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `create_lounge` mints an eight-character `invite_code` on every room it
-- creates, private ones included. The `lounges` SELECT policy is
-- "Lounges are discoverable" USING (true), so ANY signed-in member can read ANY
-- private room's code straight off the table. Proven: a member belonging to no
-- private room read a seeded code, inside a rolled-back transaction.
--
-- ── HOW BAD, EXACTLY ───────────────────────────────────────────────────────
-- Not as bad as it first looks, and worth stating precisely rather than
-- alarmingly: NO FUNCTION ANYWHERE ACCEPTS A CODE TO JOIN. Checked every
-- function whose body mentions invite_code — only `create_lounge` (which mints
-- it) and `get_user_lounges` (which returns it). A private room is entered by
-- requesting admission and being admitted, which is what the app's own comment
-- in `stores/lounge.ts` says happened when codes were retired from both
-- clients.
--
-- So today it is a DEAD CREDENTIAL that leaks. The problem is what it becomes:
-- the moment anyone adds "join by code" — the obvious next feature for a
-- private room — every private room in the house is already open, and the
-- person adding it has no reason to suspect that.
--
-- ── WHY NOT REVOKE THE COLUMN ──────────────────────────────────────────────
-- The obvious fix is to revoke SELECT on `lounges.invite_code`. It would break
-- the app: `app/lounge/[id].tsx` reads `select('*')`, and a column the caller
-- may not read turns that into a permission error on a screen that works today.
--
-- ── SO: REMOVE THE SECRET, DO NOT GUARD IT ─────────────────────────────────
-- Nothing reads the code, nothing joins with it, and both clients stopped
-- issuing it. A column that is always NULL cannot leak, cannot be guarded
-- wrongly, and breaks nothing that selects it. You cannot leak what does not
-- exist — which is a better property than any policy.
--
-- The column stays so `select('*')` keeps working; it simply holds nothing.

CREATE OR REPLACE FUNCTION public.create_lounge(p_name text, p_description text, p_is_private boolean)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
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
END $function$;

-- The codes already minted are dead credentials sitting in a readable table.
UPDATE public.lounges SET invite_code = NULL WHERE invite_code IS NOT NULL;

-- ── AND THE FUNCTION THAT HANDED THEM OUT ──────────────────────────────────
-- `get_user_lounges(p_user_id)` filters with `WHERE TRUE OR ...`, which is not
-- a filter — it returns EVERY lounge regardless of the id passed, with
-- `invite_code` in its return type, and takes the subject as a parameter rather
-- than reading auth.uid().
--
-- Batch 7 revoked it from `anon` after finding exactly that. It was still
-- executable by `authenticated`, which is the caller that matters: a member is
-- a real person with a real reason to look. Nothing calls it — `stores/
-- lounge.ts` documents choosing a different function precisely because this one
-- "takes a caller-supplied user id instead of reading auth.uid(), returns
-- invite_code, and had its access revoked".
--
-- Revoked rather than dropped: a DROP would need certainty about every
-- dependent object, and revoking makes it unreachable either way.
REVOKE EXECUTE ON FUNCTION public.get_user_lounges(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_lounges(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_lounges(uuid) FROM PUBLIC;
