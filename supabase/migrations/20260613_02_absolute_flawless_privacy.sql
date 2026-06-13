-- 1. NOTIFICATIONS ENHANCEMENT
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
    CHECK (type IN ('follow', 'endorse', 'comment', 'annotate', 'retransmit', 'system', 'reaction', 'follow_request', 'follow_accept'));

-- 2. THE PRIVACY INTERCEPTOR (Prevents UI bypass)
CREATE OR REPLACE FUNCTION public.enforce_privacy_on_follow()
RETURNS TRIGGER AS $$
DECLARE
    v_is_private BOOLEAN;
BEGIN
    IF NEW.type = 'follow' THEN
        SELECT is_social_private INTO v_is_private FROM public.profiles WHERE id = NEW.target_user_id;
        IF v_is_private THEN
            -- Automatically downgrade the 'follow' to a 'follow_request' at the database level.
            NEW.type := 'follow_request';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_enforce_privacy_on_follow ON public.interactions;
CREATE TRIGGER tr_enforce_privacy_on_follow
    BEFORE INSERT ON public.interactions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_privacy_on_follow();

-- 3. NOTIFICATION GENERATOR UPDATED FOR REQUESTS
CREATE OR REPLACE FUNCTION public.notify_on_interaction() 
RETURNS TRIGGER AS $$
DECLARE
    target_user UUID;
    sender_user TEXT;
    notif_message TEXT;
BEGIN
    SELECT username INTO sender_user FROM public.profiles WHERE id = NEW.user_id;

    IF NEW.type = 'follow' THEN
        target_user := NEW.target_user_id;
        notif_message := 'started following your frequency.';
        
        IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
            INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
            VALUES (target_user, 'follow', sender_user, NEW.user_id, notif_message);
        END IF;

    ELSIF NEW.type = 'follow_request' THEN
        target_user := NEW.target_user_id;
        notif_message := 'requested to follow you.';
        
        IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
            INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
            VALUES (target_user, 'follow_request', sender_user, NEW.user_id, notif_message);
        END IF;

    ELSIF NEW.type = 'endorse_log' THEN
        SELECT user_id INTO target_user FROM public.logs WHERE id = NEW.target_log_id;
        notif_message := 'certified your dossier 🏆';
        
        IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
            INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
            VALUES (target_user, 'endorse', sender_user, NEW.user_id, notif_message);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. THE AUTO-APPROVAL SWEEP (Bulk Operated for O(1) Time Complexity)
CREATE OR REPLACE FUNCTION public.handle_privacy_switch()
RETURNS TRIGGER AS $$
DECLARE
    v_updated_user_ids UUID[];
    v_count INT;
BEGIN
    -- If switching from Private (true) to Public (false)
    IF OLD.is_social_private = true AND NEW.is_social_private = false THEN
        
        -- 1. Bulk update interactions and capture the affected user_ids
        WITH updated AS (
            UPDATE public.interactions 
            SET type = 'follow' 
            WHERE target_user_id = NEW.id AND type = 'follow_request'
            RETURNING user_id
        )
        SELECT array_agg(user_id), count(*) INTO v_updated_user_ids, v_count
        FROM updated;

        IF v_count > 0 THEN
            -- 2. Increment target user's followers_count atomically in memory
            NEW.followers_count := COALESCE(NEW.followers_count, 0) + v_count;
            
            -- 3. Bulk increment following_count for all requesters
            UPDATE public.profiles 
            SET following_count = COALESCE(following_count, 0) + 1 
            WHERE id = ANY(v_updated_user_ids);
            
            -- 4. Bulk insert acceptance notifications
            INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
            SELECT u_id, 'follow_accept', NEW.username, NEW.id, 'accepted your follow request. You can now view their archive.'
            FROM unnest(v_updated_user_ids) AS u_id;
            
            -- 5. Bulk delete the pending request notifications for the target user
            DELETE FROM public.notifications 
            WHERE user_id = NEW.id AND type = 'follow_request' AND from_user_id = ANY(v_updated_user_ids);
        END IF;
        
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_handle_privacy_switch ON public.profiles;
CREATE TRIGGER tr_handle_privacy_switch
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW 
    WHEN (OLD.is_social_private IS DISTINCT FROM NEW.is_social_private)
    EXECUTE FUNCTION public.handle_privacy_switch();

-- 5. CLEANUP ON REMOVAL (Cancel / Decline)
CREATE OR REPLACE FUNCTION public.handle_interaction_removal()
RETURNS TRIGGER AS $$
BEGIN
  -- 1. UNFOLLOW (Clean up counts safely avoiding NULLs)
  IF OLD.type = 'follow' AND OLD.target_user_id IS NOT NULL THEN
    UPDATE public.profiles SET followers_count = GREATEST(0, COALESCE(followers_count, 0) - 1) WHERE id = OLD.target_user_id;
    UPDATE public.profiles SET following_count = GREATEST(0, COALESCE(following_count, 0) - 1) WHERE id = OLD.user_id;
  END IF;

  -- 2. CANCEL/DECLINE REQUEST (Clean up ghost notification)
  IF OLD.type = 'follow_request' AND OLD.target_user_id IS NOT NULL THEN
    DELETE FROM public.notifications 
    WHERE user_id = OLD.target_user_id AND from_user_id = OLD.user_id AND type = 'follow_request';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. ATOMIC RPCS WITH UUIDs
CREATE OR REPLACE FUNCTION public.accept_follow_request(requester_id UUID) 
RETURNS void AS $$
DECLARE
    v_target_username TEXT;
BEGIN
    SELECT username INTO v_target_username FROM public.profiles WHERE id = auth.uid();
    
    -- Safely update without standard trigger
    UPDATE public.interactions 
    SET type = 'follow' 
    WHERE user_id = requester_id AND target_user_id = auth.uid() AND type = 'follow_request';
    
    IF FOUND THEN
        -- Increment counts manually to cover the UPDATE missing the INSERT trigger
        UPDATE public.profiles SET followers_count = COALESCE(followers_count, 0) + 1 WHERE id = auth.uid();
        UPDATE public.profiles SET following_count = COALESCE(following_count, 0) + 1 WHERE id = requester_id;
        
        -- Send Accept Notification back to Requester
        INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
        VALUES (requester_id, 'follow_accept', v_target_username, auth.uid(), 'accepted your follow request. You can now view their archive.');
        
        -- Dismiss original request notification
        DELETE FROM public.notifications 
        WHERE user_id = auth.uid() AND type = 'follow_request' AND from_user_id = requester_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.decline_follow_request(requester_id UUID) 
RETURNS void AS $$
BEGIN
    -- Delete the interaction. The 'handle_interaction_removal' trigger will cleanly cascade and delete the notification.
    DELETE FROM public.interactions 
    WHERE user_id = requester_id AND target_user_id = auth.uid() AND type = 'follow_request';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
