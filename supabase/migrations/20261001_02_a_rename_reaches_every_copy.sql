-- ════════════════════════════════════════════════════════════════════════════
-- 20261001_02 — a member may change their handle, and every copy follows
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
-- sync_denormalized_username (AFTER UPDATE OF username ON profiles) updated
-- public.video_reviews, a table that no longer exists: every change of handle
-- failed with 42P01, on the app and the web alike. Nobody could rename.
-- It also missed two copies of a handle: a Lounge reply's quote of whom it
-- answers, and a notice's sender. A rename would have left the old handle on
-- each. (Dossiers and their comments are views over dispatch_posts and
-- dispatch_comments, which it did update.)
--
-- ── WHAT THIS DOES ──────────────────────────────────────────────────────────
-- 1. The trigger function updates every copy that exists, and none that does not.
-- 2. The one member whose handle IS their email address (joined 2026-06-12,
--    before the handle policy's backstop) is given a handle from the part of
--    the address before the @, by the house's rules; their notices are told
--    the new name, and they are told why, once.
--
-- No transaction control here: the rehearsal
-- (mobile/supabase/diagnostics/a_rename_reaches_every_copy_rehearsal.sql)
-- includes this file inside its own transaction.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sync_denormalized_username()
    RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username THEN
    UPDATE public.dispatch_posts SET author_username = NEW.username
     WHERE user_id = NEW.id AND author_username IS DISTINCT FROM NEW.username;
    UPDATE public.dispatch_comments SET author_username = NEW.username
     WHERE user_id = NEW.id AND author_username IS DISTINCT FROM NEW.username;
    UPDATE public.log_comments SET username = NEW.username
     WHERE user_id = NEW.id AND username IS DISTINCT FROM NEW.username;
    UPDATE public.notifications SET from_username = NEW.username
     WHERE from_user_id = NEW.id AND from_username IS DISTINCT FROM NEW.username;
    UPDATE public.lounge_messages r SET reply_to_username = NEW.username
      FROM public.lounge_messages m
     WHERE r.reply_to_id = m.id AND m.user_id = NEW.id
       AND r.reply_to_username IS DISTINCT FROM NEW.username;
  END IF;
  RETURN NULL;  -- AFTER trigger: the return value is ignored
END $$;

-- ── THE HANDLE THAT WAS AN ADDRESS ──────────────────────────────────────────
DO $$
DECLARE
  m        record;
  v_hex    text;
  v_base   text;
  v_new    text;
  v_n      integer := 0;
  reserved text[] := ARRAY[
    'admin','administrator','mod','moderator','support','help',
    'reelhouse','system','root','official','staff','team','bot',
    'null','undefined','anonymous','anon','deleted','unknown',
    'api','www','mail','email','noreply','no_reply',
    'settings','login','signup','logout','feed','discover',
    'profile','edit','delete','create','new','user','users'];
BEGIN
  FOR m IN SELECT p.id, p.username FROM public.profiles p WHERE p.username LIKE '%@%' LOOP
    v_hex  := replace(m.id::text, '-', '');
    v_base := regexp_replace(lower(split_part(m.username, '@', 1)), '[^a-z0-9_]', '', 'g');
    v_base := btrim(regexp_replace(v_base, '_+', '_', 'g'), '_');
    v_base := btrim(left(v_base, 23), '_');
    IF length(v_base) < 3 OR v_base = ANY(reserved) THEN
      v_base := 'member_' || substr(v_hex, 1, 6);
    END IF;
    v_new := v_base;
    WHILE v_new = ANY(reserved)
          OR EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = v_new AND id <> m.id) LOOP
      v_n := v_n + 1;
      v_new := v_base || '_' || substr(v_hex, v_n, 4);
    END LOOP;

    BEGIN
      UPDATE public.profiles SET username = v_new WHERE id = m.id;
    EXCEPTION WHEN check_violation OR unique_violation THEN
      -- The house's own rules refused it (a word it does not allow): a plain one.
      v_new := 'member_' || substr(v_hex, 1, 6);
      UPDATE public.profiles SET username = v_new WHERE id = m.id;
    END;

    -- The old handle, wherever a notice's words carried it.
    UPDATE public.notifications SET message = replace(message, m.username, v_new)
     WHERE position(m.username IN message) > 0;

    INSERT INTO public.notifications (user_id, type, message, group_key)
    VALUES (m.id, 'system',
            'Your handle showed your email address to the house, so it is now @' || v_new
              || '. You may choose another in Settings.',
            'handle:address-retired');
  END LOOP;
END $$;
