-- 0002_premium_notifications.sql

-- 1. Clean up notification types Constraint so Web & Mobile both perfectly sync
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
    CHECK (type IN ('follow', 'endorse', 'comment', 'annotate', 'retransmit', 'system', 'reaction'));

-- 2. Trigger Function: Automatically generate notifications for ALL Interactions
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
            INSERT INTO public.notifications (user_id, type, from_username, message)
            VALUES (target_user, 'follow', sender_user, notif_message);
        END IF;

    ELSIF NEW.type = 'endorse_log' THEN
        SELECT user_id INTO target_user FROM public.logs WHERE id = NEW.target_log_id;
        notif_message := 'certified your dossier ✦';
        
        IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
            INSERT INTO public.notifications (user_id, type, from_username, message)
            VALUES (target_user, 'endorse', sender_user, notif_message);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_notify_interaction ON public.interactions;
CREATE TRIGGER tr_notify_interaction
    AFTER INSERT ON public.interactions
    FOR EACH ROW EXECUTE FUNCTION public.notify_on_interaction();


-- 3. Trigger Function: Generate Notifications for Critiques (Log Comments)
CREATE OR REPLACE FUNCTION public.notify_on_log_comment()
RETURNS TRIGGER AS $$
DECLARE
    target_user UUID;
    sender_user TEXT;
    target_film_title TEXT;
BEGIN
    SELECT username INTO sender_user FROM public.profiles WHERE id = NEW.user_id;
    SELECT user_id, film_title INTO target_user, target_film_title FROM public.logs WHERE id = NEW.log_id;

    IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
        INSERT INTO public.notifications (user_id, type, from_username, message)
        VALUES (target_user, 'comment', sender_user, 'added a critique to your log of ' || COALESCE(target_film_title, 'a film'));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_notify_log_comment ON public.log_comments;
CREATE TRIGGER tr_notify_log_comment
    AFTER INSERT ON public.log_comments
    FOR EACH ROW EXECUTE FUNCTION public.notify_on_log_comment();


-- 4. Trigger Function: Generate Notifications for Critiques (List Comments)
CREATE OR REPLACE FUNCTION public.notify_on_list_comment()
RETURNS TRIGGER AS $$
DECLARE
    target_user UUID;
    sender_user TEXT;
BEGIN
    SELECT username INTO sender_user FROM public.profiles WHERE id = NEW.user_id;
    SELECT user_id INTO target_user FROM public.lists WHERE id = NEW.list_id;

    IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
        INSERT INTO public.notifications (user_id, type, from_username, message)
        VALUES (target_user, 'comment', sender_user, 'penned a critique on your curated list ¶');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_notify_list_comment ON public.list_comments;
CREATE TRIGGER tr_notify_list_comment
    AFTER INSERT ON public.list_comments
    FOR EACH ROW EXECUTE FUNCTION public.notify_on_list_comment();
