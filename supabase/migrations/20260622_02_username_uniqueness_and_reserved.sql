-- ReelHouse: username uniqueness + reserved-handle backstop (SCHEMA-1 server side)
-- ---------------------------------------------------------------------------
-- The app validates usernames (length, charset, reserved words) but the
-- database had no backstop, so a direct API call could bypass it and two
-- accounts could share a handle. This adds:
--   1. case-insensitive uniqueness on profiles.username
--   2. a trigger that BLOCKS reserved handles on profile edits, and SANITIZES
--      them on signup (so a new signup can never fail because of this).
-- Pre-checked: no duplicate usernames exist, so the unique index is safe.

-- 1. Case-insensitive uniqueness --------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_unique
  ON public.profiles (lower(username));

-- 2. Username policy trigger -------------------------------------------------
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
  -- Nothing to do if the username isn't actually changing.
  IF TG_OP = 'UPDATE' AND NEW.username IS NOT DISTINCT FROM OLD.username THEN
    RETURN NEW;
  END IF;

  v_norm := lower(coalesce(NEW.username, ''));

  IF TG_OP = 'UPDATE' THEN
    -- Profile edit: enforce strictly (the app validates first; this blocks
    -- anyone trying to claim a reserved handle by going around the app).
    IF v_norm = ANY(reserved) THEN
      RAISE EXCEPTION 'This username is reserved.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT (signup): never fail — if the auto-resolved handle is reserved,
  -- append a short unique suffix so the account is still created.
  IF v_norm = ANY(reserved) THEN
    NEW.username := NEW.username || '_' || substr(replace(NEW.id::text, '-', ''), 1, 6);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_profiles_username_policy ON public.profiles;
CREATE TRIGGER tr_profiles_username_policy
  BEFORE INSERT OR UPDATE OF username ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_username_policy();
