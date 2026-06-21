-- ReelHouse Security Hardening: Enforce Role Immutability
-- This trigger prevents authenticated users from elevating or modifying their own role.

CREATE OR REPLACE FUNCTION check_role_update()
RETURNS trigger AS $$
BEGIN
  -- If the role column is being changed...
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Block the update if the request is coming from a standard authenticated user
    IF auth.role() = 'authenticated' THEN
      RAISE EXCEPTION 'Security Violation: Users cannot update their own role via the client API.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_profiles_prevent_role_update ON public.profiles;

CREATE TRIGGER tr_profiles_prevent_role_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION check_role_update();
