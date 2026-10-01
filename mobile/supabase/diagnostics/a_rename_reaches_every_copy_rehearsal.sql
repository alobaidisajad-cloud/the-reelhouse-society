-- ════════════════════════════════════════════════════════════════════════════
-- Rehearsal — 20261001_02, a rename reaches every copy. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -v with_fix=1 -f mobile/supabase/diagnostics/a_rename_reaches_every_copy_rehearsal.sql
--
-- Every case prints "case|expected|got". Without with_fix it shows the house
-- as it is (no rename possible); with it, the migration first, then:
-- EVERY member is renamed, and no copy of any handle may keep an old one.
-- Each copy is checked over at least one row (a Lounge reply and a sent
-- notice are made for it), so no case passes for having nothing to check.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\if :{?with_fix}
\ir ../../../supabase/migrations/20261001_02_a_rename_reaches_every_copy.sql
-- What the migration did, before this rehearsal renames anyone itself.
DO $$
DECLARE got text;
BEGIN
  SELECT count(*)::text INTO got FROM public.profiles WHERE username LIKE '%@%';
  RAISE NOTICE '%|%|%', 'no handle is an email address', '0', got;
  SELECT count(*)::text INTO got FROM public.notifications WHERE type = 'system' AND group_key = 'handle:address-retired';
  RAISE NOTICE '%|%|%', 'the member it was is told why, once', '1', got;
  SELECT count(*)::text INTO got FROM public.notifications n JOIN public.profiles p ON p.id = n.user_id
   WHERE n.group_key = 'handle:address-retired' AND position('@' || p.username || '.' IN n.message) > 0;
  RAISE NOTICE '%|%|%', 'and told the handle they hold now', '1', got;
END $$;
\endif

DO $$
DECLARE
  a uuid; b uuid; room uuid; parent uuid;
  got text; n integer;
BEGIN
  -- A reply in the Lounge and a sent notice, between two members, so each copy has a row.
  SELECT id INTO a FROM public.profiles WHERE NOT coalesce(is_banned, false) ORDER BY created_at LIMIT 1;
  SELECT id INTO b FROM public.profiles WHERE NOT coalesce(is_banned, false) AND id <> a ORDER BY created_at LIMIT 1;
  SELECT id INTO room FROM public.lounges ORDER BY created_at LIMIT 1;
  INSERT INTO public.lounge_messages (lounge_id, user_id, content) VALUES (room, a, 'rehearsal: a word') RETURNING id INTO parent;
  INSERT INTO public.lounge_messages (lounge_id, user_id, content, reply_to_id, reply_to_content, reply_to_username)
  VALUES (room, b, 'rehearsal: an answer', parent, 'rehearsal: a word', (SELECT username FROM public.profiles WHERE id = a));
  INSERT INTO public.notifications (user_id, type, message, from_user_id, from_username)
  VALUES (b, 'system', 'rehearsal notice', a, (SELECT username FROM public.profiles WHERE id = a));

  -- The house as it is: can a member change their handle at all?
  BEGIN
    UPDATE public.profiles SET username = 'rehearsal_one_rename' WHERE id = a;
    got := 'ok';
  EXCEPTION WHEN OTHERS THEN
    got := SQLSTATE;
  END;
  RAISE NOTICE '%|%|%', 'a member can change their handle', 'ok', got;
  IF got <> 'ok' THEN RETURN; END IF;

  -- Every member, renamed (by the house's own rules: lower letters, numbers, one _).
  UPDATE public.profiles
     SET username = left(btrim(regexp_replace(regexp_replace(lower(username), '[^a-z0-9_]', '', 'g'), '_+', '_', 'g'), '_'), 20)
                    || '_' || substr(replace(id::text, '-', ''), 1, 6)
   WHERE id <> a;

  SELECT count(*) INTO n FROM public.dispatch_posts x JOIN public.profiles p ON p.id = x.user_id;
  SELECT count(*)::text INTO got FROM public.dispatch_posts x JOIN public.profiles p ON p.id = x.user_id WHERE x.author_username IS DISTINCT FROM p.username;
  RAISE NOTICE '%|%|%', 'every filing names its writer as they are now (of ' || n || ')', '0', got;
  SELECT count(*) INTO n FROM public.dispatch_comments x JOIN public.profiles p ON p.id = x.user_id;
  SELECT count(*)::text INTO got FROM public.dispatch_comments x JOIN public.profiles p ON p.id = x.user_id WHERE x.author_username IS DISTINCT FROM p.username;
  RAISE NOTICE '%|%|%', 'every critique of a filing (of ' || n || ')', '0', got;
  SELECT count(*) INTO n FROM public.log_comments x JOIN public.profiles p ON p.id = x.user_id;
  SELECT count(*)::text INTO got FROM public.log_comments x JOIN public.profiles p ON p.id = x.user_id WHERE x.username IS DISTINCT FROM p.username;
  RAISE NOTICE '%|%|%', 'every critique of a log (of ' || n || ')', '0', got;
  SELECT count(*) INTO n FROM public.dispatch_dossiers x JOIN public.profiles p ON p.id = x.user_id;
  SELECT count(*)::text INTO got FROM public.dispatch_dossiers x JOIN public.profiles p ON p.id = x.user_id WHERE x.author_username IS DISTINCT FROM p.username;
  RAISE NOTICE '%|%|%', 'every dossier (of ' || n || ')', '0', got;
  SELECT count(*) INTO n FROM public.dossier_comments x JOIN public.profiles p ON p.id = x.user_id;
  SELECT count(*)::text INTO got FROM public.dossier_comments x JOIN public.profiles p ON p.id = x.user_id WHERE x.username IS DISTINCT FROM p.username;
  RAISE NOTICE '%|%|%', 'every dossier comment (of ' || n || ')', '0', got;
  SELECT count(*) INTO n FROM public.notifications x JOIN public.profiles p ON p.id = x.from_user_id;
  SELECT count(*)::text INTO got FROM public.notifications x JOIN public.profiles p ON p.id = x.from_user_id WHERE x.from_username IS DISTINCT FROM p.username;
  RAISE NOTICE '%|%|%', 'every notice names its sender as they are now (of ' || n || ')', '0', got;
  SELECT count(*) INTO n FROM public.lounge_messages r JOIN public.lounge_messages m ON m.id = r.reply_to_id;
  SELECT count(*)::text INTO got FROM public.lounge_messages r JOIN public.lounge_messages m ON m.id = r.reply_to_id
    JOIN public.profiles p ON p.id = m.user_id WHERE r.reply_to_username IS DISTINCT FROM p.username;
  RAISE NOTICE '%|%|%', 'every Lounge reply names whom it answers as they are now (of ' || n || ')', '0', got;
END $$;

ROLLBACK;
