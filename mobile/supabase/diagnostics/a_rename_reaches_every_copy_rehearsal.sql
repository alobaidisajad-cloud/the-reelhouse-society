-- ════════════════════════════════════════════════════════════════════════════
-- a_rename_reaches_every_copy_rehearsal.sql — 20261001_02. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -f mobile/supabase/diagnostics/a_rename_reaches_every_copy_rehearsal.sql
--
-- A member can change their handle; then EVERY member is renamed, and no copy
-- of any handle may keep an old one. Each copy is checked over at least one
-- row: a filing, a dossier, a critique of each, a Lounge reply and a sent
-- notice are made for it. Production runs it by hand; db-integration.yml runs
-- it on the sealed copy (e2e/db/rehearsals.mjs). Read each NOTICE as
-- case|expected|got ; the last line is the verdict, and any miss makes psql
-- exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- What the migration left, and what stays true: no handle is an address, and
-- nobody is told twice that theirs was retired.
DO $$ BEGIN
  PERFORM pg_temp.rh_case('no handle is an email address (of ' || (SELECT count(*) FROM public.profiles) || ')', '0',
    (SELECT count(*)::text FROM public.profiles WHERE username LIKE '%@%'));
  PERFORM pg_temp.rh_case('no member is told twice that their address was retired', '0',
    (SELECT count(*)::text FROM (SELECT user_id FROM public.notifications WHERE type = 'system' AND group_key = 'handle:address-retired'
                                  GROUP BY user_id HAVING count(*) > 1) t));
END $$;

DO $$
DECLARE
  a uuid; b uuid; room uuid; parent uuid; post uuid; dossier uuid; log uuid;
  got text; n integer;
BEGIN
  -- Two members, a salon and a log, so each copy of a handle gets a row.
  a := pg_temp.rh_found('a member in good standing', (SELECT id FROM public.profiles WHERE NOT coalesce(is_banned, false) ORDER BY created_at LIMIT 1));
  b := pg_temp.rh_found('a second member in good standing',
    (SELECT id FROM public.profiles WHERE NOT coalesce(is_banned, false) AND id <> a ORDER BY created_at LIMIT 1));
  room := pg_temp.rh_found('a salon', (SELECT id FROM public.lounges ORDER BY created_at LIMIT 1));
  log := pg_temp.rh_found('a log', (SELECT id FROM public.logs ORDER BY created_at LIMIT 1));
  INSERT INTO public.lounge_messages (lounge_id, user_id, content) VALUES (room, a, 'rehearsal: a word') RETURNING id INTO parent;
  INSERT INTO public.lounge_messages (lounge_id, user_id, content, reply_to_id, reply_to_content, reply_to_username)
  VALUES (room, b, 'rehearsal: an answer', parent, 'rehearsal: a word', (SELECT username FROM public.profiles WHERE id = a));
  INSERT INTO public.notifications (user_id, type, message, from_user_id, from_username)
  VALUES (b, 'system', 'rehearsal notice', a, (SELECT username FROM public.profiles WHERE id = a));
  INSERT INTO public.dispatch_posts (kind, user_id, author_username, body)
  VALUES ('take', a, (SELECT username FROM public.profiles WHERE id = a), 'rehearsal: a take') RETURNING id INTO post;
  INSERT INTO public.dispatch_posts (kind, user_id, author_username, title, body)
  VALUES ('dossier', a, (SELECT username FROM public.profiles WHERE id = a), 'Rehearsal', 'rehearsal: a dossier') RETURNING id INTO dossier;
  INSERT INTO public.dispatch_comments (post_id, user_id, author_username, body)
  VALUES (post, b, (SELECT username FROM public.profiles WHERE id = b), 'rehearsal: a critique'),
         (dossier, b, (SELECT username FROM public.profiles WHERE id = b), 'rehearsal: a comment');
  INSERT INTO public.log_comments (log_id, user_id, username, body)
  VALUES (log, b, (SELECT username FROM public.profiles WHERE id = b), 'rehearsal: a critique');

  -- The house as it is: can a member change their handle at all?
  BEGIN
    UPDATE public.profiles SET username = 'rehearsal_one_rename' WHERE id = a;
    got := 'ok';
  EXCEPTION WHEN OTHERS THEN
    got := SQLSTATE;
  END;
  PERFORM pg_temp.rh_case('a member can change their handle', 'ok', got);
  IF got <> 'ok' THEN RETURN; END IF;

  -- Every member, renamed (by the house's own rules: lower letters, numbers, one _).
  UPDATE public.profiles
     SET username = left(btrim(regexp_replace(regexp_replace(lower(username), '[^a-z0-9_]', '', 'g'), '_+', '_', 'g'), '_'), 20)
                    || '_' || substr(replace(id::text, '-', ''), 1, 6)
   WHERE id <> a;

  SELECT count(*) INTO n FROM public.dispatch_posts x JOIN public.profiles p ON p.id = x.user_id;
  PERFORM pg_temp.rh_need('filing with a writer', n, 1);
  PERFORM pg_temp.rh_case('every filing names its writer as they are now (of ' || n || ')', '0',
    (SELECT count(*)::text FROM public.dispatch_posts x JOIN public.profiles p ON p.id = x.user_id WHERE x.author_username IS DISTINCT FROM p.username));
  SELECT count(*) INTO n FROM public.dispatch_comments x JOIN public.profiles p ON p.id = x.user_id;
  PERFORM pg_temp.rh_need('critique of a filing', n, 1);
  PERFORM pg_temp.rh_case('every critique of a filing (of ' || n || ')', '0',
    (SELECT count(*)::text FROM public.dispatch_comments x JOIN public.profiles p ON p.id = x.user_id WHERE x.author_username IS DISTINCT FROM p.username));
  SELECT count(*) INTO n FROM public.log_comments x JOIN public.profiles p ON p.id = x.user_id;
  PERFORM pg_temp.rh_need('critique of a log', n, 1);
  PERFORM pg_temp.rh_case('every critique of a log (of ' || n || ')', '0',
    (SELECT count(*)::text FROM public.log_comments x JOIN public.profiles p ON p.id = x.user_id WHERE x.username IS DISTINCT FROM p.username));
  SELECT count(*) INTO n FROM public.dispatch_dossiers x JOIN public.profiles p ON p.id = x.user_id;
  PERFORM pg_temp.rh_need('dossier', n, 1);
  PERFORM pg_temp.rh_case('every dossier (of ' || n || ')', '0',
    (SELECT count(*)::text FROM public.dispatch_dossiers x JOIN public.profiles p ON p.id = x.user_id WHERE x.author_username IS DISTINCT FROM p.username));
  SELECT count(*) INTO n FROM public.dossier_comments x JOIN public.profiles p ON p.id = x.user_id;
  PERFORM pg_temp.rh_need('dossier comment', n, 1);
  PERFORM pg_temp.rh_case('every dossier comment (of ' || n || ')', '0',
    (SELECT count(*)::text FROM public.dossier_comments x JOIN public.profiles p ON p.id = x.user_id WHERE x.username IS DISTINCT FROM p.username));
  SELECT count(*) INTO n FROM public.notifications x JOIN public.profiles p ON p.id = x.from_user_id;
  PERFORM pg_temp.rh_need('notice from a member', n, 1);
  PERFORM pg_temp.rh_case('every notice names its sender as they are now (of ' || n || ')', '0',
    (SELECT count(*)::text FROM public.notifications x JOIN public.profiles p ON p.id = x.from_user_id WHERE x.from_username IS DISTINCT FROM p.username));
  SELECT count(*) INTO n FROM public.lounge_messages r JOIN public.lounge_messages m ON m.id = r.reply_to_id;
  PERFORM pg_temp.rh_need('Lounge reply', n, 1);
  PERFORM pg_temp.rh_case('every Lounge reply names whom it answers as they are now (of ' || n || ')', '0',
    (SELECT count(*)::text FROM public.lounge_messages r JOIN public.lounge_messages m ON m.id = r.reply_to_id
       JOIN public.profiles p ON p.id = m.user_id WHERE r.reply_to_username IS DISTINCT FROM p.username));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
