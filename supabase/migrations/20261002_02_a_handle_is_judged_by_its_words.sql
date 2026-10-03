-- ════════════════════════════════════════════════════════════════════════════
-- 20261002_02 — a handle is judged by its words, not by the letters inside them.
-- ════════════════════════════════════════════════════════════════════════════
-- The handle filter matched twelve letter patterns anywhere in a handle, so it
-- refused moby_dick, philip_k_dick, dickens_reader, matsushita, shiitake and
-- scunthorpe, and still let n1gger and b1tch through (digits were never read).
--
-- Now one function, handle_is_unwelcome, judges a handle in three tiers:
--   • words no innocent word contains (the slurs, fuck, bitch, whore, asshole):
--     anywhere inside a word of the handle, stretched or written in digits;
--   • shit and cunt, which real words and names contain: only where a word of
--     the handle begins or ends with them;
--   • the rest: only as a whole word ("pussycat" is welcome, "pussy" is not).
-- "dick" is no longer refused: it is a name (Moby Dick, Philip K. Dick).
--
-- enforce_username_policy calls it on a rename and on a new member's handle;
-- nothing else in that function changes. The apps hold the same lists
-- (validateUsername.ts) and a guard keeps them identical to this file.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_is_unwelcome(p_handle text) RETURNS boolean
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH r AS (SELECT translate(lower(coalesce(p_handle, '')), '013457', 'oieast') AS s)
  SELECT r.s ~ 'n+i+g+g+(e+r|a+|u+h)|f+a+g+g*o+t|w+e+t+b+a+c+k|f+u+c+k|b+i+t+c+h|w+h+o+r+e|a+s+s+h+o+l+e'
      OR EXISTS (
           SELECT 1 FROM regexp_split_to_table(r.s, '[^a-z]+') AS w(word)
            WHERE w.word = ANY (ARRAY['pussy', 'pussies', 'slut', 'sluts', 'slutty', 'retard', 'retards', 'retarded', 'kike', 'kikes', 'spic', 'spics', 'chink', 'chinks', 'tranny', 'trannies'])
               OR w.word ~ '^(shit|cunt)'
               OR w.word ~ '(shit|cunt)$')
  FROM r;
$$;

CREATE OR REPLACE FUNCTION public.enforce_username_policy() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  reserved text[] := ARRAY[
    'admin','administrator','mod','moderator','support','help',
    'reelhouse','system','root','official','staff','team','bot',
    'null','undefined','anonymous','anon','deleted','unknown',
    'api','www','mail','email','noreply','no_reply',
    'settings','login','signup','logout','feed','discover',
    'profile','edit','delete','create','new','user','users'
  ];
  v_raw    text;
  v_clean  text;
  v_hex    text;
  v_base   text;
  v_n      integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.username IS NOT DISTINCT FROM OLD.username THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.username = regexp_replace(
           regexp_replace(lower(btrim(coalesce(OLD.username, ''))), '[[:space:]]+', '_', 'g'),
           '[^a-z0-9_]', '', 'g') THEN
    NEW.username := OLD.username;
    RETURN NEW;
  END IF;

  v_raw := coalesce(NEW.username, '');

  v_clean := regexp_replace(
               regexp_replace(lower(btrim(v_raw)), '[[:space:]]+', '_', 'g'),
               '[^a-z0-9_]', '', 'g');

  IF TG_OP = 'UPDATE' THEN
    IF v_clean IS DISTINCT FROM v_raw THEN
      RAISE EXCEPTION 'Usernames may only contain lowercase letters, numbers and underscores.'
        USING ERRCODE = '23514';
    END IF;
    IF length(v_clean) < 3 THEN
      RAISE EXCEPTION 'Username must be at least 3 characters.' USING ERRCODE = '23514';
    END IF;
    IF length(v_clean) > 30 THEN
      RAISE EXCEPTION 'Username must be 30 characters or less.' USING ERRCODE = '23514';
    END IF;
    IF left(v_clean, 1) = '_' OR right(v_clean, 1) = '_' THEN
      RAISE EXCEPTION 'Username cannot start or end with an underscore.' USING ERRCODE = '23514';
    END IF;
    IF position('__' in v_clean) > 0 THEN
      RAISE EXCEPTION 'Username cannot have consecutive underscores.' USING ERRCODE = '23514';
    END IF;
    IF v_clean = ANY(reserved) THEN
      RAISE EXCEPTION 'This username is reserved.' USING ERRCODE = '23514';
    END IF;
    IF public.handle_is_unwelcome(v_clean) THEN
      RAISE EXCEPTION 'This username is not allowed.' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles
                WHERE lower(username) = v_clean AND id <> NEW.id) THEN
      RAISE EXCEPTION 'This username is already taken.' USING ERRCODE = '23505';
    END IF;

    NEW.username := v_clean;
    RETURN NEW;
  END IF;

  v_hex := replace(NEW.id::text, '-', '');

  v_clean := regexp_replace(v_clean, '_+', '_', 'g');
  v_clean := btrim(v_clean, '_');
  v_clean := left(v_clean, 30);
  v_clean := btrim(v_clean, '_');

  IF length(v_clean) < 3 THEN
    v_clean := 'user_' || substr(v_hex, 1, 6);
  END IF;

  IF public.handle_is_unwelcome(v_clean) THEN
    v_clean := 'user_' || substr(v_hex, 1, 6);
  END IF;

  v_base := btrim(left(v_clean, 23), '_');
  v_n    := 0;
  WHILE v_clean = ANY(reserved)
        OR EXISTS (SELECT 1 FROM public.profiles
                    WHERE lower(username) = v_clean AND id <> NEW.id)
  LOOP
    v_n := v_n + 1;
    IF v_n > 20 THEN
      RAISE EXCEPTION 'Could not derive an available username.' USING ERRCODE = '23505';
    END IF;
    v_clean := v_base || '_' || substr(v_hex, v_n, 6);
  END LOOP;

  NEW.username := v_clean;
  RETURN NEW;
END;
$$;
