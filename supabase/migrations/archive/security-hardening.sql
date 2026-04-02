-- ============================================================
-- REELHOUSE — SECURITY HARDENING v1.0
-- Prevents role/tier self-escalation (free premium bypass)
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ============================================================
-- FIX 1: Lock the auth trigger — never trust client metadata
--         for premium roles. Only 'cinephile' and 'venue_owner'
--         are allowed from self-signup. Auteur/Archivist must
--         be granted by the service role (e.g. after payment).
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  _username text;
  _role text;
BEGIN
  _username := coalesce(
    new.raw_user_meta_data->>'username',
    split_part(new.email, '@', 1)
  );

  -- SECURITY: Only allow safe roles from client self-signup.
  -- 'auteur', 'archivist', 'admin' can never be self-assigned.
  _role := CASE
    WHEN new.raw_user_meta_data->>'role' = 'venue_owner' THEN 'venue_owner'
    ELSE 'cinephile'
  END;

  INSERT INTO public.profiles (id, username, role)
  VALUES (new.id, _username, _role)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- FIX 2: Add BEFORE UPDATE trigger to prevent post-login
--         role/tier escalation. When a regular authenticated
--         user updates their profile, role and tier are silently
--         reset to their original values — they can't escalate.
--         The service role (used after payment) bypasses this
--         because auth.uid() is NULL in that context.
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger AS $$
BEGIN
  -- auth.uid() is NULL for service-role operations (admin/payment webhooks)
  -- auth.uid() is set for regular client-side user operations
  IF auth.uid() IS NOT NULL THEN
    -- Regular users: silently block any attempt to change role or tier
    NEW.role := OLD.role;
    NEW.tier := OLD.tier;
  END IF;
  -- Service role calls (e.g. after payment): role/tier update allowed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS prevent_role_escalation ON public.profiles;
CREATE TRIGGER prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();


-- ============================================================
-- FIX 3: Tighten the profiles RLS update policy.
--         The trigger is the main defence; this is belt-and-
--         suspenders. No functional change needed here since
--         the trigger handles it, but keeping the policy clean.
-- ============================================================
DROP POLICY IF EXISTS "Users can update own profile." ON profiles;
CREATE POLICY "Users can update own profile." ON profiles
FOR UPDATE
USING (auth.uid() = id);
-- Note: role/tier protection is enforced by the trigger above,
-- not by this policy. The trigger is more reliable for column-level
-- protection in Postgres RLS.


-- ============================================================
-- FIX 4: Prevent inserting logs with a spoofed user_id.
--         The existing policy is correct but let's be explicit.
-- ============================================================
DROP POLICY IF EXISTS "Users can insert their logs." ON logs;
CREATE POLICY "Users can insert their logs." ON logs
FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- VERIFICATION: Run these queries to confirm setup is working.
-- ============================================================
-- SELECT routine_name FROM information_schema.routines 
--   WHERE routine_name IN ('handle_new_user', 'prevent_role_escalation');

-- SELECT trigger_name FROM information_schema.triggers 
--   WHERE trigger_name IN ('on_auth_user_created', 'prevent_role_escalation');
