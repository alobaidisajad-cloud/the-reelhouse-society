-- ════════════════════════════════════════════════════════════════════════════
-- 20261115_01 — a block takes the follow requests between two members too.
-- ════════════════════════════════════════════════════════════════════════════
--   A block severed the follows between two members (sever_follows_on_block)
--   and refused new ones (enforce_privacy_on_follow), but a follow request
--   already waiting at either door stayed. The member who blocked could still
--   meet the other at the Notices door, and admitting them ran
--   accept_follow_request, which turned the request into a follow across the
--   block and asked nothing.
--   Now a block (made, or a mute raised to one) takes the requests both ways
--   with the follows; accept_follow_request admits no one a block stands
--   between, and takes such a request from the door instead; and what already
--   stands across a block is taken now. The rehearsal holds each, the members
--   acting as themselves.
-- Undo: mobile/supabase/migrations-down/20261115_01_a_block_takes_the_requests_too.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: a block takes the requests between the two as it took the follows (a_block_takes_the_requests_too_rehearsal.sql)
CREATE OR REPLACE FUNCTION public.sever_follows_on_block() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.type = 'block' THEN
    -- The follows and the requests, both ways: a request left waiting could be admitted later.
    DELETE FROM public.interactions
    WHERE type IN ('follow', 'follow_request')
      AND ((user_id = NEW.blocker_id AND target_user_id = NEW.blocked_id)
        OR (user_id = NEW.blocked_id AND target_user_id = NEW.blocker_id));
  END IF;
  RETURN NEW;
END $$;

-- add-only (3): it only fixes: a request across a block admits no one, and every other request is admitted as before (a_block_takes_the_requests_too_rehearsal.sql)
CREATE OR REPLACE FUNCTION public.accept_follow_request(requester_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_me uuid := auth.uid();
  v_granted integer;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;

  -- A request across a block admits no one: it is taken from the door instead. One can be
  -- waiting there only if it was made in the same moment as the block.
  IF public.a_block_stands_between(requester_id, v_me) THEN
    DELETE FROM public.interactions
     WHERE user_id = requester_id
       AND target_user_id = v_me
       AND type = 'follow_request';
    RETURN;
  END IF;

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

-- What already stands across a block (a request; a follow made in the same moment as the block)
-- is taken now, as a block made today takes it. A follow taken lowers the two counts, as an
-- unfollow does (handle_follow_count_change); a request takes its notice with it
-- (a_request_takes_its_notice).
DELETE FROM public.interactions i
 WHERE i.type IN ('follow', 'follow_request')
   AND EXISTS (
     SELECT 1 FROM public.user_blocks b
      WHERE b.type = 'block'
        AND ((b.blocker_id = i.user_id AND b.blocked_id = i.target_user_id)
          OR (b.blocker_id = i.target_user_id AND b.blocked_id = i.user_id)));
