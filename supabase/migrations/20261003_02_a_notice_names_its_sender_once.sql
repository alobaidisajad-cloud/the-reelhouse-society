-- ════════════════════════════════════════════════════════════════════════════
-- 20261003_02 — a notice names its sender once.
-- ════════════════════════════════════════════════════════════════════════════
-- Every reader of a notice prints the sender from from_username, then the
-- message: the notices sheet, the push banner, the website. A request to enter
-- a private salon ALSO wrote the name into the message, in capitals, so the
-- host read "@marguerite @MARGUERITE is asking to enter …"; and a rename
-- updates from_username, never the words, so the copy in the message went
-- stale. Thirteen follow notices from March were written the same way.
--
-- Now the request writes only what was done; the old notices lose their copy
-- of the name; and a notice that names its sender may not begin with "@", so
-- no writer can name them twice again. Who may call the request, and what it
-- does to the guest list, are unchanged.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.request_lounge_membership(p_lounge_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_private boolean; v_creator uuid; v_status text; v_uname text; v_lname text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT is_private, creator_id, name INTO v_private, v_creator, v_lname FROM public.lounges WHERE id = p_lounge_id;
  IF v_private IS NULL THEN RAISE EXCEPTION 'Lounge not found'; END IF;
  SELECT status INTO v_status FROM public.lounge_members WHERE lounge_id = p_lounge_id AND user_id = auth.uid();
  IF v_status = 'banned' THEN RAISE EXCEPTION 'You cannot request this lounge'; END IF;
  IF v_status IN ('approved','pending') THEN RETURN; END IF;
  INSERT INTO public.lounge_members (lounge_id, user_id, status) VALUES (p_lounge_id, auth.uid(), 'pending')
  ON CONFLICT (user_id, lounge_id) DO UPDATE SET status = 'pending'
    WHERE public.lounge_members.status NOT IN ('banned','approved');
  SELECT username INTO v_uname FROM public.profiles WHERE id = auth.uid();
  IF v_creator IS NOT NULL AND v_creator <> auth.uid() THEN
    -- the sender is from_username; every reader prints it before the message
    INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message, related_lounge_id)
    VALUES (v_creator, 'system', v_uname, auth.uid(),
            CASE WHEN v_uname IS NULL THEN 'A member is asking' ELSE 'is asking' END
              || ' to enter ' || COALESCE(v_lname,'your lounge') || '.',
            p_lounge_id);
  END IF;
END $$;

-- The notices written before: "@NAME is now following you." becomes "is now following you."
UPDATE public.notifications
   SET message = substr(message, char_length(from_username) + 3)
 WHERE from_username IS NOT NULL
   AND lower(left(message, char_length(from_username) + 2)) = '@' || lower(from_username) || ' ';

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_sender_named_once
  CHECK (from_username IS NULL OR message NOT LIKE '@%');
