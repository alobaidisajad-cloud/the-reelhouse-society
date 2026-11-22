-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_02 — a critique deleted takes its notice with it.
-- ════════════════════════════════════════════════════════════════════════════
--   A critique on a member's record, stack or filing writes that member a notice ("left a critique on
--   your log of …"). A follow, a certification and a salon request each take their notice back when
--   they are undone (round 12), but nothing took a critique's back: deleted, its notice stayed under
--   the bell for good, a door to words that were gone, and a critique, delete, critique loop left one
--   more each time (the kinds pass, stage C, kind 14: a side effect not symmetric).
--   Now each critique's notice names the critique (metadata comment_id, as a filing's critique notice
--   already does), and a_critique_takes_its_notice deletes the notices naming a deleted critique. A
--   notice written before it named its critique is taken when its member has no critique left on that
--   piece; and the notices already orphaned (their member's every critique there gone) are taken now.
--   The notice's words, the push and who reads it are as before.
-- Undo: mobile/supabase/migrations-down/20261122_02_a_critique_takes_its_notice.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- As the snapshot holds them, each notice now naming its critique.
-- add-only (3): it only fixes: the notice is written as before, with the critique's id in its metadata, which no shipped client reads for a critique notice (TestFlight build 41: comment_id is read for certifications only; the website reads no metadata)
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
        INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message, group_key, metadata)
        VALUES (target_user, 'comment', sender_user, NEW.user_id,
                'left a critique on your stack “' || COALESCE(v_title, 'Untitled') || '”.',
                'endorse:list:' || NEW.list_id,
                jsonb_build_object('comment_id', NEW.id));
    END IF;

    RETURN NEW;
END;
$$;

-- add-only (3): it only fixes: as above, for a record's critique
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
        INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message, group_key, metadata)
        VALUES (target_user, 'comment', sender_user, NEW.user_id,
                'left a critique on your log of ' || COALESCE(target_film_title, 'a film') || '.',
                'endorse:log:' || NEW.log_id,
                jsonb_build_object('comment_id', NEW.id));
    END IF;

    RETURN NEW;
END;
$$;

-- add-only (1): no shipped client uses it: a trigger's function this piece makes, dropped first so it is made new (no grant it did not ask for), called by no client
DROP FUNCTION IF EXISTS public.a_critique_takes_its_notice();
CREATE FUNCTION public.a_critique_takes_its_notice() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_group text;
  v_left  boolean;
BEGIN
  -- The piece the critique was on, as its notice's group names it, and whether its member has
  -- another critique there still.
  IF TG_TABLE_NAME = 'log_comments' THEN
    v_group := 'endorse:log:' || OLD.log_id;
    v_left := EXISTS (SELECT 1 FROM public.log_comments WHERE log_id = OLD.log_id AND user_id = OLD.user_id);
  ELSIF TG_TABLE_NAME = 'list_comments' THEN
    v_group := 'endorse:list:' || OLD.list_id;
    v_left := EXISTS (SELECT 1 FROM public.list_comments WHERE list_id = OLD.list_id AND user_id = OLD.user_id);
  ELSIF TG_TABLE_NAME = 'dispatch_comments' THEN
    v_group := 'endorse:post:' || OLD.post_id;
    v_left := EXISTS (SELECT 1 FROM public.dispatch_comments WHERE post_id = OLD.post_id AND user_id = OLD.user_id);
  ELSE
    RETURN NULL;
  END IF;

  -- The notices naming this critique: its own, and the answer's (a filing's critique taken as its answer).
  DELETE FROM public.notifications
   WHERE from_user_id = OLD.user_id
     AND type = 'comment'
     AND group_key = v_group
     AND metadata ->> 'comment_id' = OLD.id::text;

  -- A notice written before notices named their critique: taken once its member has none left there.
  IF NOT v_left THEN
    DELETE FROM public.notifications
     WHERE from_user_id = OLD.user_id
       AND type = 'comment'
       AND group_key = v_group
       AND NOT (coalesce(metadata, '{}'::jsonb) ? 'comment_id');
  END IF;
  RETURN NULL;
END $$;
-- add-only (1): no shipped client uses it: a trigger's function this piece makes, called by no client
REVOKE ALL ON FUNCTION public.a_critique_takes_its_notice() FROM PUBLIC, anon, authenticated;

-- The notices already orphaned: a critique notice whose member has no critique left on its piece
-- (a filing's critique notice by the critique it names), each critique found by its index, in one
-- pass over the notices. It runs before the triggers are made: making a trigger holds its table
-- against every critique written or deleted until the car commits, so nothing slow may come after.
-- add-only (3): it only fixes: takes only notices whose critique is gone, read by member and piece
DELETE FROM public.notifications n
 WHERE n.type = 'comment'
   AND n.from_user_id IS NOT NULL
   AND ((n.group_key LIKE 'endorse:log:%'
         AND NOT EXISTS (SELECT 1 FROM public.log_comments c
                          WHERE c.log_id = CASE WHEN substr(n.group_key, 13) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN substr(n.group_key, 13)::uuid END
                            AND c.user_id = n.from_user_id))
     OR (n.group_key LIKE 'endorse:list:%'
         AND NOT EXISTS (SELECT 1 FROM public.list_comments c
                          WHERE c.list_id = CASE WHEN substr(n.group_key, 14) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN substr(n.group_key, 14)::uuid END
                            AND c.user_id = n.from_user_id))
     OR (n.group_key LIKE 'endorse:post:%'
         AND n.metadata ? 'comment_id'
         AND NOT EXISTS (SELECT 1 FROM public.dispatch_comments c
                          WHERE c.id = CASE WHEN n.metadata ->> 'comment_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (n.metadata ->> 'comment_id')::uuid END)));

-- add-only (3): it only fixes: a critique is deleted as before, its notice with it
CREATE OR REPLACE TRIGGER a_critique_takes_its_notice
  AFTER DELETE ON public.log_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.a_critique_takes_its_notice();
CREATE OR REPLACE TRIGGER a_critique_takes_its_notice
  AFTER DELETE ON public.list_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.a_critique_takes_its_notice();
CREATE OR REPLACE TRIGGER a_critique_takes_its_notice
  AFTER DELETE ON public.dispatch_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.a_critique_takes_its_notice();
