-- 20260613_flawless_privacy_rls.sql
-- Flawless Privacy Ecosystem & Elite RLS Security

-- 1. DATA MIGRATION: Convert legacy social_visibility to strict boolean
UPDATE public.profiles 
SET is_social_private = TRUE 
WHERE preferences->>'social_visibility' IN ('private', 'followers');

-- Clean the JSONB preferences payload
UPDATE public.profiles 
SET preferences = preferences - 'social_visibility'
WHERE preferences ? 'social_visibility';


-- 2. ELITE RLS CACHE FUNCTION (STABLE for Performance)
CREATE OR REPLACE FUNCTION public.can_view_user_data(target_uid UUID) 
RETURNS BOOLEAN AS $$
DECLARE
    is_private BOOLEAN;
    is_following BOOLEAN;
BEGIN
    -- Owner can always view their own data
    IF auth.uid() = target_uid THEN
        RETURN TRUE;
    END IF;

    -- Check if target is private
    SELECT is_social_private INTO is_private FROM public.profiles WHERE id = target_uid;
    
    -- If public, anyone can view
    IF NOT is_private THEN
        RETURN TRUE;
    END IF;

    -- If private, only approved followers can view
    SELECT EXISTS (
        SELECT 1 FROM public.interactions 
        WHERE type = 'follow' 
        AND user_id = auth.uid() 
        AND target_user_id = target_uid
    ) INTO is_following;

    RETURN is_following;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;


-- 3. SECURE CONTENT (Applying Elite RLS)
-- Update Logs
DROP POLICY IF EXISTS "Logs viewable by everyone" ON public.logs;
CREATE POLICY "Logs viewable by authorized users" ON public.logs
FOR SELECT USING (public.can_view_user_data(user_id));

-- Update Lists
DROP POLICY IF EXISTS "Lists viewable by everyone" ON public.lists;
CREATE POLICY "Lists viewable by authorized users" ON public.lists
FOR SELECT USING (public.can_view_user_data(user_id));

-- Update Watchlists
DROP POLICY IF EXISTS "Watchlists viewable by everyone" ON public.watchlists;
CREATE POLICY "Watchlists viewable by authorized users" ON public.watchlists
FOR SELECT USING (public.can_view_user_data(user_id));

-- Update Log Comments
DROP POLICY IF EXISTS "Log comments viewable by everyone." ON public.log_comments;
CREATE POLICY "Log comments viewable by authorized users." ON public.log_comments
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.logs 
        WHERE id = public.log_comments.log_id 
        AND public.can_view_user_data(user_id)
    )
);

-- Update List Comments
DROP POLICY IF EXISTS "List comments viewable by everyone" ON public.list_comments;
CREATE POLICY "List comments viewable by authorized users" ON public.list_comments
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.lists 
        WHERE id = public.list_comments.list_id 
        AND public.can_view_user_data(user_id)
    )
);


-- 4. SOCIAL GRAPH SECURITY (Applying Elite interactions RLS)
DROP POLICY IF EXISTS "Interactions viewable by everyone" ON public.interactions;
CREATE POLICY "Interactions viewable by authorized users" ON public.interactions
FOR SELECT USING (
    auth.uid() = user_id OR
    auth.uid() = target_user_id OR
    (public.can_view_user_data(user_id) OR public.can_view_user_data(target_user_id))
);


-- 5. THE FOLLOW REQUEST ENGINE (Constraints & Triggers)
-- Update Interaction Constraints
ALTER TABLE public.interactions DROP CONSTRAINT IF EXISTS interactions_type_check;
ALTER TABLE public.interactions ADD CONSTRAINT interactions_type_check 
    CHECK (type IN ('follow', 'endorse_log', 'follow_request'));

-- Update Notification Constraints
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
    CHECK (type IN ('follow', 'endorse', 'comment', 'annotate', 'retransmit', 'system', 'reaction', 'follow_request', 'follow_accept'));

-- Update handle_interaction_notification Trigger
CREATE OR REPLACE FUNCTION public.handle_interaction_notification()
RETURNS TRIGGER AS $$
DECLARE
  _from_username TEXT;
  _log_title TEXT;
BEGIN
  SELECT username INTO _from_username FROM public.profiles WHERE id = NEW.user_id;

  -- 1. FOLLOW NOTIFICATION
  IF NEW.type = 'follow' AND NEW.target_user_id IS NOT NULL THEN
    IF NEW.user_id != NEW.target_user_id THEN
      INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
      VALUES (NEW.target_user_id, 'follow', _from_username, NEW.user_id, '@' || UPPER(_from_username) || ' is now following you.');
      
      UPDATE public.profiles SET followers_count = followers_count + 1 WHERE id = NEW.target_user_id;
      UPDATE public.profiles SET following_count = following_count + 1 WHERE id = NEW.user_id;
    END IF;
  END IF;

  -- 1.5 FOLLOW REQUEST NOTIFICATION
  IF NEW.type = 'follow_request' AND NEW.target_user_id IS NOT NULL THEN
    IF NEW.user_id != NEW.target_user_id THEN
      INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
      VALUES (NEW.target_user_id, 'follow_request', _from_username, NEW.user_id, 'requested to follow your archive.');
    END IF;
  END IF;

  -- 2. LOG REACTION/ENDORSEMENT NOTIFICATION
  IF (NEW.type = 'endorse_log' OR NEW.type LIKE 'react_%') AND NEW.target_log_id IS NOT NULL THEN
    SELECT user_id, film_title INTO NEW.target_user_id, _log_title FROM public.logs WHERE id = NEW.target_log_id;
    IF NEW.target_user_id IS NOT NULL AND NEW.user_id != NEW.target_user_id THEN
      INSERT INTO public.notifications (user_id, type, from_username, from_user_id, related_log_id, message)
      VALUES (NEW.target_user_id, 'reaction', _from_username, NEW.user_id, NEW.target_log_id, '@' || UPPER(_from_username) || ' certified your log for ' || _log_title || '.');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. ATOMIC RPCS
CREATE OR REPLACE FUNCTION public.accept_follow_request_by_username(p_requester_username TEXT) 
RETURNS void AS $$
DECLARE
    v_requester_id UUID;
    v_target_username TEXT;
BEGIN
    SELECT id INTO v_requester_id FROM public.profiles WHERE username = p_requester_username;
    SELECT username INTO v_target_username FROM public.profiles WHERE id = auth.uid();
    
    IF v_requester_id IS NOT NULL THEN
        -- Safely update without standard trigger
        UPDATE public.interactions 
        SET type = 'follow' 
        WHERE user_id = v_requester_id AND target_user_id = auth.uid() AND type = 'follow_request';
        
        IF FOUND THEN
            -- Increment counts manually to cover the UPDATE missing the INSERT trigger
            UPDATE public.profiles SET followers_count = followers_count + 1 WHERE id = auth.uid();
            UPDATE public.profiles SET following_count = following_count + 1 WHERE id = v_requester_id;
            
            -- Send Accept Notification back to Requester
            INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
            VALUES (v_requester_id, 'follow_accept', v_target_username, auth.uid(), 'accepted your follow request. You can now view their archive.');
            
            -- Dismiss original request notification
            DELETE FROM public.notifications 
            WHERE user_id = auth.uid() AND type = 'follow_request' AND from_username = p_requester_username;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.decline_follow_request_by_username(p_requester_username TEXT) 
RETURNS void AS $$
DECLARE
    v_requester_id UUID;
BEGIN
    SELECT id INTO v_requester_id FROM public.profiles WHERE username = p_requester_username;
    
    IF v_requester_id IS NOT NULL THEN
        -- Delete the interaction
        DELETE FROM public.interactions 
        WHERE user_id = v_requester_id AND target_user_id = auth.uid() AND type = 'follow_request';
        
        -- The DELETE trigger will run, but handle_interaction_removal only decrements if OLD.type = 'follow',
        -- so follow_request counts are naturally ignored (flawless logic).

        -- Dismiss original request notification
        DELETE FROM public.notifications 
        WHERE user_id = auth.uid() AND type = 'follow_request' AND from_username = p_requester_username;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
