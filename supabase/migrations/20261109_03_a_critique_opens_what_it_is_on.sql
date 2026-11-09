-- ════════════════════════════════════════════════════════════════════════════
-- 20261109_03 — a critique's notice opens what the critique is on.
-- ════════════════════════════════════════════════════════════════════════════
--   A notice opens where noticeRoute says (mobile/src/utils/noticeRoute.ts),
--   from the notices sheet and from a tapped push alike: what the notice is
--   about (its group_key), then its film, then its sender. A critique of a
--   Dispatch filing names its filing (endorse:post:<id>); a critique of a log
--   or of a stack named nothing, so "A New Critique" opened the critic's file
--   and never the critique. Both writers now name what was critiqued, as the
--   certification of the same log or stack does (endorse:log:<id>,
--   endorse:list:<id>). Only a certification is grouped by its key (every
--   client's getGroupKey reads type 'endorse' alone, TestFlight build 41's
--   too), so a critique never folds into "3 members certified your log"; the
--   website reads no group_key.
--   The critiques' notices already written are given their key: each matched
--   to its critique by its critic, the owner it was sent to and its time (the
--   trigger writes the notice in the critique's own transaction, so both are
--   dated by the same now()). A notice with no critique left to match keeps
--   no key, and opens its sender's file as before.
-- Rehearsal: mobile/supabase/diagnostics/a_critique_opens_what_it_is_on_rehearsal.sql
-- Undo: mobile/supabase/migrations-down/20261109_03_a_critique_opens_what_it_is_on.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- As live, with what was critiqued named.
-- add-only (3): it only fixes: the notice gains the key its certification already carries; every shipped client opens it on the log (the app's and build 41's noticeRoute: groupRoute before the sender) or ignores it (the website); a member's critique of a log replayed as the member in a_critique_opens_what_it_is_on_rehearsal.sql
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

-- add-only (3): it only fixes: the notice gains the key its certification already carries; every shipped client opens it on the stack (the app's and build 41's noticeRoute: groupRoute before the sender) or ignores it (the website); a member's critique of a stack replayed as the member in a_critique_opens_what_it_is_on_rehearsal.sql
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

-- The critiques' notices already written, each matched to its critique.
UPDATE public.notifications n SET group_key = 'endorse:log:' || c.log_id
  FROM public.log_comments c JOIN public.logs l ON l.id = c.log_id
 WHERE n.type = 'comment' AND n.group_key IS NULL
   AND n.message LIKE 'left a critique on your log of %'
   AND n.from_user_id = c.user_id AND n.user_id = l.user_id AND n.created_at = c.created_at;

UPDATE public.notifications n SET group_key = 'endorse:list:' || c.list_id
  FROM public.list_comments c JOIN public.lists l ON l.id = c.list_id
 WHERE n.type = 'comment' AND n.group_key IS NULL
   AND n.message LIKE 'left a critique on your stack %'
   AND n.from_user_id = c.user_id AND n.user_id = l.user_id AND n.created_at = c.created_at;
