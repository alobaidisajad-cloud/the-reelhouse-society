-- Undo of 20261109_03: a critique's notice of a log or a stack names nothing it is on.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: the writers as they were before 20261109_03, which every shipped client read
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
        INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
        VALUES (target_user, 'comment', sender_user, NEW.user_id,
                'left a critique on your log of ' || COALESCE(target_film_title, 'a film') || '.');
    END IF;

    RETURN NEW;
END;
$$;

-- add-only (3): it only fixes: the writers as they were before 20261109_03, which every shipped client read
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
        INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
        VALUES (target_user, 'comment', sender_user, NEW.user_id,
                'left a critique on your stack “' || COALESCE(v_title, 'Untitled') || '”.');
    END IF;

    RETURN NEW;
END;
$$;

UPDATE public.notifications SET group_key = NULL
 WHERE type = 'comment' AND (group_key LIKE 'endorse:log:%' OR group_key LIKE 'endorse:list:%');
