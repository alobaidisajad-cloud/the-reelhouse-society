-- ════════════════════════════════════════════════════════════════════════════
-- 20261015_01 — a salon's live channel follows the salon's own rules.
-- ════════════════════════════════════════════════════════════════════════════
-- A salon's channel (`lounge-<id>`) carries its new messages, reactions and
-- seats (each row read under its own table's rules), and also who is present
-- and who is typing, which no table rule covers. These rules cover a PRIVATE
-- join of the channel, the kind the app makes from its next build:
--   - receiving it: whoever may read the salon's messages (any signed-in member
--     for an open salon, a seated member for a private one), the rule
--     lounge_messages is read by;
--   - sending presence: a seated member only; no member may send a broadcast
--     on it at all;
--   - typing: only through send_salon_typing, which checks the seat, stamps the
--     sender's own id and handle, and sends at most once per member per salon
--     every 2 seconds;
--   - `global_notifications`: any signed-in member may join; its rows stay
--     filtered by the notifications table's own rules.
-- Undo: mobile/supabase/migrations-down/20261015_01_a_salon_channel_follows_the_salon.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- Who may read a salon's channel: the rule its messages are read by. A topic
-- that is not a salon's is read by no one through this rule.
CREATE FUNCTION public.salon_channel_readable(p_topic text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT CASE
    WHEN p_topic ~ '^lounge-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN EXISTS (
      SELECT 1 FROM public.lounges l
       WHERE l.id = substr(p_topic, 8)::uuid
         AND (l.is_private = false OR EXISTS (
           SELECT 1 FROM public.lounge_members m
            WHERE m.lounge_id = l.id AND m.user_id = auth.uid() AND m.status = 'approved')))
    ELSE false
  END
$$;

-- Who is seated in the salon a channel belongs to: the rule its messages are sent by.
CREATE FUNCTION public.salon_channel_seated(p_topic text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT CASE
    WHEN p_topic ~ '^lounge-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN EXISTS (
      SELECT 1 FROM public.lounge_members m
       WHERE m.lounge_id = substr(p_topic, 8)::uuid AND m.user_id = auth.uid() AND m.status = 'approved')
    ELSE false
  END
$$;

-- add-only (1): no shipped client uses them: functions made here, called by neither TestFlight build 41 nor the website
REVOKE EXECUTE ON FUNCTION public.salon_channel_readable(text), public.salon_channel_seated(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.salon_channel_readable(text), public.salon_channel_seated(text) TO authenticated, service_role;

CREATE POLICY "a salon's readers receive its channel" ON realtime.messages
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (public.salon_channel_readable(realtime.topic()));

CREATE POLICY "a seated member shares their presence" ON realtime.messages
    AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (realtime.messages.extension = 'presence' AND public.salon_channel_seated(realtime.topic()));

CREATE POLICY "members receive the notices channel" ON realtime.messages
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (realtime.topic() = 'global_notifications');

-- When each member last sent typing in each salon. No client reads or writes
-- it: only send_salon_typing, which runs as its owner.
CREATE TABLE public.salon_typing_sent (
    lounge_id uuid NOT NULL REFERENCES public.lounges(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sent_at timestamp with time zone NOT NULL,
    PRIMARY KEY (lounge_id, user_id)
);
ALTER TABLE public.salon_typing_sent ENABLE ROW LEVEL SECURITY;
-- add-only (1): no shipped client uses it: a table made here, read by neither TestFlight build 41 nor the website
REVOKE ALL ON TABLE public.salon_typing_sent FROM anon, authenticated;

-- Typing reaches a salon only through here: the caller must be seated, the
-- message carries the caller's own id and handle, and a second call within
-- 2 seconds sends nothing. True when it sent.
CREATE FUNCTION public.send_salon_typing(p_lounge_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_handle text;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.lounge_members m
     WHERE m.lounge_id = p_lounge_id AND m.user_id = v_uid AND m.status = 'approved'
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.salon_typing_sent AS t (lounge_id, user_id, sent_at)
  VALUES (p_lounge_id, v_uid, clock_timestamp())
  ON CONFLICT (lounge_id, user_id) DO UPDATE SET sent_at = EXCLUDED.sent_at
   WHERE t.sent_at <= EXCLUDED.sent_at - interval '2 seconds';
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT p.username INTO v_handle FROM public.profiles p WHERE p.id = v_uid;
  PERFORM realtime.send(jsonb_build_object('user_id', v_uid, 'username', v_handle), 'typing',
                        'lounge-' || p_lounge_id::text, true);
  RETURN true;
END;
$$;

-- add-only (1): no shipped client uses it: a function made here, called by neither TestFlight build 41 nor the website
REVOKE EXECUTE ON FUNCTION public.send_salon_typing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_salon_typing(uuid) TO authenticated, service_role;
