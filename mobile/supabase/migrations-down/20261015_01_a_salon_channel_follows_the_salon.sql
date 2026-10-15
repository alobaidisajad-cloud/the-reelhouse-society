-- The undo of 20261015_01: the salon channel's rules, the typing function and
-- its table, and the two rule functions, gone.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DROP FUNCTION public.send_salon_typing(uuid);
DROP TABLE public.salon_typing_sent;
DROP POLICY "members receive the notices channel" ON realtime.messages;
DROP POLICY "a seated member shares their presence" ON realtime.messages;
DROP POLICY "a salon's readers receive its channel" ON realtime.messages;
DROP FUNCTION public.salon_channel_seated(text);
DROP FUNCTION public.salon_channel_readable(text);
