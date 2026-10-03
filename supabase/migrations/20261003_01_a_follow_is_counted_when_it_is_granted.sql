-- ════════════════════════════════════════════════════════════════════════════
-- 20261003_01 — a follow is counted when it is granted, and a request's notice
-- ends with the request.
-- ════════════════════════════════════════════════════════════════════════════
-- accept_follow_request added one to the member's followers and one to the
-- requester's following WHETHER OR NOT there was a request to accept, and any
-- visitor could call it: signed out, three calls moved a member's "following"
-- by three (rehearsed on production, rolled back). Now it needs a member, and
-- the counts move only when a request was turned into a follow.
--
-- An accepted request told the requester nothing, though turning a profile
-- public tells every requester "accepted your follow request". Now a single
-- acceptance says the same.
--
-- The host's "at your door" notice outlived its request: accepted, declined,
-- declined all at once, or withdrawn, it stayed unread under the bell. Now the
-- notice ends with the request, on every path, by one trigger.
--
-- The three request functions are for members only: a visitor has no door.
-- ════════════════════════════════════════════════════════════════════════════

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

CREATE OR REPLACE FUNCTION public.decline_follow_request(requester_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.interactions
   WHERE user_id = requester_id
     AND target_user_id = auth.uid()
     AND type = 'follow_request';
END;
$$;

-- The notice of a request ends with the request: granted, declined, or withdrawn.
CREATE OR REPLACE FUNCTION public.a_request_takes_its_notice() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  DELETE FROM public.notifications
   WHERE user_id = OLD.target_user_id
     AND type = 'follow_request'
     AND from_user_id = OLD.user_id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.a_request_takes_its_notice() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a_request_takes_its_notice ON public.interactions;
CREATE TRIGGER a_request_takes_its_notice
  AFTER DELETE OR UPDATE OF type ON public.interactions
  FOR EACH ROW
  WHEN (OLD.type = 'follow_request')
  EXECUTE FUNCTION public.a_request_takes_its_notice();

-- Notices of requests that have already ended.
DELETE FROM public.notifications n
 WHERE n.type = 'follow_request'
   AND NOT EXISTS (SELECT 1 FROM public.interactions i
                    WHERE i.user_id = n.from_user_id
                      AND i.target_user_id = n.user_id
                      AND i.type = 'follow_request');

REVOKE ALL ON FUNCTION public.accept_follow_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decline_follow_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decline_all_follow_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_follow_request(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decline_follow_request(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decline_all_follow_requests() TO authenticated, service_role;
