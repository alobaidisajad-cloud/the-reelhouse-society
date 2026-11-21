-- Undo of 20261122_02: a critique deleted takes its notice with it, undone; the cars after it are undone first.
-- The notices of critiques already deleted, which the car took, are not put back: their critiques are gone.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: the undo takes the take-back off each critique table
DROP TRIGGER IF EXISTS a_critique_takes_its_notice ON public.log_comments;
DROP TRIGGER IF EXISTS a_critique_takes_its_notice ON public.list_comments;
DROP TRIGGER IF EXISTS a_critique_takes_its_notice ON public.dispatch_comments;
-- add-only (1): no shipped client uses it: the trigger's function this car made
DROP FUNCTION IF EXISTS public.a_critique_takes_its_notice();

-- The writers as the snapshot holds them, the notice naming no critique.
-- add-only (3): it only fixes: the undo puts back the snapshot's definitions whole
CREATE OR REPLACE FUNCTION public.notify_on_list_comment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    target_user UUID;
    sender_user TEXT;
    v_title TEXT;
BEGIN
    SELECT username INTO sender_user FROM public.profiles WHERE id = NEW.user_id;
    SELECT user_id, title INTO target_user, v_title FROM public.lists WHERE id = NEW.list_id;

    IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
        INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message, group_key)
        VALUES (target_user, 'comment', sender_user, NEW.user_id,
                'left a critique on your stack “' || COALESCE(v_title, 'Untitled') || '”.',
                'endorse:list:' || NEW.list_id);
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_log_comment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    target_user UUID;
    sender_user TEXT;
    target_film_title TEXT;
BEGIN
    SELECT username INTO sender_user FROM public.profiles WHERE id = NEW.user_id;
    SELECT user_id, film_title INTO target_user, target_film_title FROM public.logs WHERE id = NEW.log_id;

    IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
        INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message, group_key)
        VALUES (target_user, 'comment', sender_user, NEW.user_id,
                'left a critique on your log of ' || COALESCE(target_film_title, 'a film') || '.',
                'endorse:log:' || NEW.log_id);
    END IF;

    RETURN NEW;
END;
$$;
