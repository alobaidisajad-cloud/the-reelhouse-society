-- ============================================================
-- REELHOUSE SOCIETY — BACKEND SECURITY PATCH 002
-- Elite Production Hardening for RLS & Triggers
-- Run this in the Supabase SQL Editor to patch existing vulnerabilities.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PRIVILEGE ESCALATION PREVENTION (profiles table)
-- ------------------------------------------------------------
-- If a malicious client tries to execute an UPDATE on their profile to grant 
-- themselves 'admin' or 'auteur' status, this trigger forces the database
-- to ignore their payload and strictly use the existing (OLD) values.

CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Revert any attempts to escalate privileges or spoof followers
  NEW.role = OLD.role;
  NEW.tier = OLD.tier;
  NEW.followers_count = OLD.followers_count;
  NEW.following_count = OLD.following_count;
  NEW.total_logs = OLD.total_logs;
  
  -- The timestamp can update normally
  NEW.updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_profile_security ON public.profiles;
CREATE TRIGGER enforce_profile_security
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.protect_profile_fields();


-- ------------------------------------------------------------
-- 2. PAYLOAD HIJACKING PREVENTION (Strict RLS boundaries)
-- ------------------------------------------------------------
-- Standard UPDATE policies only check the existing row via 'USING'.
-- This forces the update payload to match the user's ID via 'WITH CHECK', 
-- so they cannot "give" their log/list to someone else's ID.

-- LOGS
DROP POLICY IF EXISTS "Users can update their logs." ON public.logs;
CREATE POLICY "Users can update their logs." ON public.logs 
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- LISTS
DROP POLICY IF EXISTS "Users can manage their lists." ON public.lists;
CREATE POLICY "Users can manage their lists." ON public.lists 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- VAULTS
DROP POLICY IF EXISTS "Users can manage their vaults." ON public.vaults;
CREATE POLICY "Users can manage their vaults." ON public.vaults 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- PROGRAMMES
DROP POLICY IF EXISTS "Users can manage their programmes." ON public.programmes;
CREATE POLICY "Users can manage their programmes." ON public.programmes 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- CINEMA REVIEWS
DROP POLICY IF EXISTS "Users can manage their cinema reviews." ON public.cinema_reviews;
CREATE POLICY "Users can manage their cinema reviews." ON public.cinema_reviews 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- DISPATCH DOSSIERS
DROP POLICY IF EXISTS "Users can manage their dossiers." ON public.dispatch_dossiers;
CREATE POLICY "Users can manage their dossiers." ON public.dispatch_dossiers 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ------------------------------------------------------------
-- 3. TRUSTLESS NOTIFICATION ENGINE 
-- ------------------------------------------------------------
-- Delete the client-side INSERT policy. The ONLY way notifications
-- should be created is via secure internal DB triggers.
DROP POLICY IF EXISTS "Authenticated users can insert notifications." ON public.notifications;

-- We still need the backend triggers to ignore RLS internally, so we use SECURITY DEFINER functions.
CREATE OR REPLACE FUNCTION public.handle_interaction_notification()
RETURNS TRIGGER AS $$
DECLARE
  _from_username TEXT;
  _log_title TEXT;
BEGIN
  -- Get the username of the person interacting
  SELECT username INTO _from_username FROM public.profiles WHERE id = NEW.user_id;

  -- 1. FOLLOW NOTIFICATION
  IF NEW.type = 'follow' AND NEW.target_user_id IS NOT NULL THEN
    -- Only send if not following themselves (which UI blocks anyway)
    IF NEW.user_id != NEW.target_user_id THEN
      INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
      VALUES (NEW.target_user_id, 'follow', _from_username, NEW.user_id, '@' || UPPER(_from_username) || ' is now following you.');
      
      -- Update follower counts properly via the trigger while we're here
      UPDATE public.profiles SET followers_count = followers_count + 1 WHERE id = NEW.target_user_id;
      UPDATE public.profiles SET following_count = following_count + 1 WHERE id = NEW.user_id;
    END IF;
  END IF;

  -- 2. LOG REACTION/ENDORSEMENT NOTIFICATION
  IF (NEW.type = 'endorse_log' OR NEW.type LIKE 'react_%') AND NEW.target_log_id IS NOT NULL THEN
    -- Find the log owner and title
    SELECT user_id, film_title INTO NEW.target_user_id, _log_title FROM public.logs WHERE id = NEW.target_log_id;
    IF NEW.target_user_id IS NOT NULL AND NEW.user_id != NEW.target_user_id THEN
      INSERT INTO public.notifications (user_id, type, from_username, from_user_id, related_log_id, message)
      VALUES (NEW.target_user_id, 'reaction', _from_username, NEW.user_id, NEW.target_log_id, '@' || UPPER(_from_username) || ' reacted to your log for ' || _log_title || '.');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Interaction Insert Trigger
DROP TRIGGER IF EXISTS on_interaction_created ON public.interactions;
CREATE TRIGGER on_interaction_created
  AFTER INSERT ON public.interactions
  FOR EACH ROW EXECUTE PROCEDURE public.handle_interaction_notification();


-- ------------------------------------------------------------
-- 4. REVERSE TRIGGER (Handling Unfollows / Un-endorsements)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_interaction_removal()
RETURNS TRIGGER AS $$
BEGIN
  -- 1. UNFOLLOW (Clean up counts)
  IF OLD.type = 'follow' AND OLD.target_user_id IS NOT NULL THEN
    UPDATE public.profiles SET followers_count = GREATEST(0, followers_count - 1) WHERE id = OLD.target_user_id;
    UPDATE public.profiles SET following_count = GREATEST(0, following_count - 1) WHERE id = OLD.user_id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_interaction_deleted ON public.interactions;
CREATE TRIGGER on_interaction_deleted
  AFTER DELETE ON public.interactions
  FOR EACH ROW EXECUTE PROCEDURE public.handle_interaction_removal();
