-- salon_quotes_check.sql — read-only: how many salon rows break the rules car 08 makes.
-- Counts only; no member's words are printed.
--   node mobile/supabase/diagnostics/read-only.cjs salon_quotes_check.sql
SELECT 'reactions whose salon is not their message''s', count(*)
  FROM public.lounge_message_reactions r JOIN public.lounge_messages m ON m.id = r.message_id
 WHERE m.lounge_id IS DISTINCT FROM r.lounge_id;
SELECT 'replies to a message of another salon', count(*)
  FROM public.lounge_messages m JOIN public.lounge_messages q ON q.id = m.reply_to_id
 WHERE q.lounge_id IS DISTINCT FROM m.lounge_id;
SELECT 'replies to a message no longer kept', count(*)
  FROM public.lounge_messages m LEFT JOIN public.lounge_messages q ON q.id = m.reply_to_id
 WHERE m.reply_to_id IS NOT NULL AND q.id IS NULL;
SELECT 'replies whose quote is not their message''s words', count(*)
  FROM public.lounge_messages m JOIN public.lounge_messages q ON q.id = m.reply_to_id
 WHERE m.reply_to_content IS DISTINCT FROM q.content;
SELECT 'replies whose quote is not their message''s words, the message taken down', count(*)
  FROM public.lounge_messages m JOIN public.lounge_messages q ON q.id = m.reply_to_id
 WHERE m.reply_to_content IS DISTINCT FROM q.content AND q.deleted_at IS NOT NULL;
SELECT 'replies whose name is not their message''s writer''s', count(*)
  FROM public.lounge_messages m JOIN public.lounge_messages q ON q.id = m.reply_to_id
  LEFT JOIN public.profiles p ON p.id = q.user_id
 WHERE m.reply_to_username IS DISTINCT FROM p.username;
SELECT 'quotes with no message replied to', count(*)
  FROM public.lounge_messages WHERE reply_to_id IS NULL AND (reply_to_content IS NOT NULL OR reply_to_username IS NOT NULL);
SELECT 'replies in all', count(*) FROM public.lounge_messages WHERE reply_to_id IS NOT NULL;
SELECT 'messages taken down in all', count(*) FROM public.lounge_messages WHERE deleted_at IS NOT NULL;
SELECT 'requests to follow', count(*) FROM public.interactions WHERE type = 'follow_request';
