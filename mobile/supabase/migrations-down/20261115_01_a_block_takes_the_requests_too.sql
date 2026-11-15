-- Undo of 20261115_01: a block takes the follows alone again, and a request is admitted without
-- asking about a block. The rows the migration took across a block are not put back: they were
-- across a block, and no client relies on them.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: the function as it was before 20261115_01
CREATE OR REPLACE FUNCTION public.sever_follows_on_block() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.type = 'block' THEN
    DELETE FROM public.interactions
    WHERE type = 'follow'
      AND ((user_id = NEW.blocker_id AND target_user_id = NEW.blocked_id)
        OR (user_id = NEW.blocked_id AND target_user_id = NEW.blocker_id));
  END IF;
  RETURN NEW;
END $$;

-- add-only (3): it only fixes: the function as it was before 20261115_01
CREATE OR REPLACE FUNCTION public.accept_follow_request(requester_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_me uuid := auth.uid();
  v_granted integer;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;

  -- Convert follow_request → follow
  UPDATE public.interactions
     SET type = 'follow'
   WHERE user_id = requester_id
     AND target_user_id = v_me
     AND type = 'follow_request';
  GET DIAGNOSTICS v_granted = ROW_COUNT;
  IF v_granted = 0 THEN RETURN; END IF;

  -- the follow count trigger counts inserts and deletes; a granted request is an update, so it is counted here
  UPDATE public.profiles SET followers_count = COALESCE(followers_count, 0) + 1 WHERE id = v_me;
  UPDATE public.profiles SET following_count = COALESCE(following_count, 0) + 1 WHERE id = requester_id;

  INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
  SELECT requester_id, 'follow_accept', p.username, v_me, 'accepted your follow request. You can now view their archive.'
    FROM public.profiles p WHERE p.id = v_me;
END;
$$;
