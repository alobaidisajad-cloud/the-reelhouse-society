-- ═══════════════════════════════════════════════════════════════════════════════
-- WAVE 3 — LOUNGE-1 (stop private-lounge metadata enumeration) + signup-collision
-- ═══════════════════════════════════════════════════════════════════════════════
-- Audit refs: BACKEND-LOUNGE-1 (LOW), signup-collision (LOW)
--
-- LOUNGE-1: the "Invite code lookup" SELECT policy gated on `invite_code IS NOT
--   NULL` (i.e. "has a code"), not on matching a specific code — so any archivist+
--   could `SELECT * FROM lounges` and enumerate every private lounge's metadata.
--   Fix: a SECURITY DEFINER RPC that returns only the row whose invite_code equals
--   the supplied code, and drop the broad policy. (Client `joinLounge` is switched
--   to this RPC in the same change.)
--
-- signup-collision: handle_new_user's email-prefix fallback had no general
--   collision handling, so an OAuth/no-username signup whose prefix matched an
--   existing handle would fail the unique index. Extend enforce_username_policy
--   (the BEFORE INSERT trigger) to also de-dup general collisions by appending a
--   short unique suffix — signup can then never fail on a handle clash.
--
-- Idempotent. Single transaction.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── LOUNGE-1 ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.find_lounge_by_invite(p_code text)
RETURNS SETOF public.lounges
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.*
  FROM public.lounges l
  WHERE l.invite_code = upper(p_code)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('archivist', 'auteur', 'projectionist')
    )
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.find_lounge_by_invite(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.find_lounge_by_invite(text) TO authenticated;

-- Remove the broad enumeration policy. Members still see their private lounges via
-- "Private lounges visible to members"; public lounges via the archivist policy.
DROP POLICY IF EXISTS "Invite code lookup" ON public.lounges;

-- ── signup-collision ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_username_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  reserved text[] := ARRAY[
    'admin','administrator','mod','moderator','support','help',
    'reelhouse','system','root','official','staff','team','bot',
    'null','undefined','anonymous','anon','deleted','unknown',
    'api','www','mail','email','noreply','no_reply',
    'settings','login','signup','logout','feed','discover',
    'profile','edit','delete','create','new','user','users'
  ];
  v_norm text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.username IS NOT DISTINCT FROM OLD.username THEN
    RETURN NEW;
  END IF;

  v_norm := lower(coalesce(NEW.username, ''));

  IF TG_OP = 'UPDATE' THEN
    -- Profile edit: enforce strictly (the app validates first).
    IF v_norm = ANY(reserved) THEN
      RAISE EXCEPTION 'This username is reserved.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT (signup): never fail. Append a short unique suffix if the handle is
  -- reserved OR already taken (case-insensitive) — so the account is always created.
  IF v_norm = ANY(reserved)
     OR EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = v_norm AND id <> NEW.id) THEN
    NEW.username := NEW.username || '_' || substr(replace(NEW.id::text, '-', ''), 1, 6);
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
