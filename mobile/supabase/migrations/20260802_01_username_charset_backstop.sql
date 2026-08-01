-- ═══════════════════════════════════════════════════════════════════════════════
-- Batch 9 · #36 — the database never checked what a username is made of
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
--
-- ── WHAT WAS ACTUALLY WRONG ───────────────────────────────────────────────────
-- The batch note said enforce_username_policy already handled this server-side.
-- It does not. The live body (read from pg_proc, not from a repo file) checks
-- exactly two things: reserved words, and collisions. It has never looked at the
-- characters. That is why an email address is currently stored as a username.
--
-- The note also blamed handle_new_user's `split_part(NEW.email, '@', 1)` fallback
-- for that email handle. It is not guilty: split_part returns the part BEFORE the
-- '@', so it could only ever have produced 'saleelsaleel555'. The full address
-- arrived through raw_user_meta_data — i.e. someone typed their email into the
-- username box on the WEBSITE, where nothing checked it.
--
-- Four client defects were found and are fixed alongside this migration:
--   1. mobile edit-profile wrote the SANITIZED handle on every save, renaming
--      anyone whose stored handle predates the charset rules
--   2. web signup never ran the validator at all — and its one cleaning step,
--      `.replace(/\\s+/g, '_')`, matches a literal backslash followed by "s",
--      not whitespace, so it did nothing
--   3. web edit-profile re-implemented the rules and allowed CAPITALS, capped
--      length at 20 instead of 30, and checked neither reserved words nor profanity
--   4. handle_new_user is SECURITY DEFINER with no search_path pinned (below)
--
-- This migration is the backstop underneath all four: whatever any client sends,
-- the database now decides what a handle may contain. Gate the table, not the path.
--
-- ── THE RULES, MIRRORED EXACTLY FROM validateUsername.ts ──────────────────────
--   3–30 characters · lowercase a-z, 0-9, underscore only
--   no leading or trailing underscore · no consecutive underscores
--   no reserved words · no profanity
--
-- ── WHY INSERT AND UPDATE BEHAVE DIFFERENTLY (ON PURPOSE) ────────────────────
-- AT SIGNUP it cleans silently. There is no established identity to protect yet,
-- both clients already show the member the cleaned handle, and this matches what
-- the function ALREADY does silently on a collision (appends a suffix). Raising an
-- exception here would surface as "Database error saving new user", which the web
-- catch block mistranslates into "Username is already taken."
--
-- WHEN CHANGING IT LATER it REFUSES with a clear message. Silently altering a
-- handle somebody deliberately chose is the precise bug this batch exists to kill;
-- reintroducing it inside the database would be absurd.
--
-- ── EXISTING MEMBERS ARE NOT TOUCHED ─────────────────────────────────────────
-- The unchanged-handle shortcut at the top runs first, so the five live handles
-- that predate these rules are never re-examined. They keep their names. They are
-- only held to the new rules if they choose a new handle.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1 · pin search_path on the most privileged function in the database
--
-- handle_new_user runs SECURITY DEFINER on every single signup and inserts into
-- public.profiles. Every other DEFINER function here was pinned during batches
-- 5–8; this one was missed. Unpinned, the schema its unqualified names resolve to
-- depends on the caller's search_path. The body is byte-for-byte what is live —
-- only the SET line is added.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role, email, preferences)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    CASE WHEN NEW.raw_user_meta_data->>'role' = 'venue_owner' THEN 'venue_owner' ELSE 'cinephile' END,
    NEW.email,
    '{}'::JSONB
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW();
  RETURN NEW;
END;
$$;


-- 2 · the charset backstop
--
-- Replacing the body is enough — tr_profiles_username_policy is already
-- BEFORE INSERT OR UPDATE ON public.profiles and keeps pointing here.
CREATE OR REPLACE FUNCTION public.enforce_username_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  -- the same twelve patterns as PROFANITY_PATTERNS in validateUsername.ts
  profanity text[] := ARRAY[
    'f+u+c+k','s+h+i+t','a+s+s+h+o+l+e','b+i+t+c+h',
    'd+i+c+k','p+u+s+s+y','c+u+n+t','n+i+g+g',
    'f+a+g+g','r+e+t+a+r+d','w+h+o+r+e','s+l+u+t'
  ];
  v_raw    text;
  v_clean  text;
  v_pat    text;
  v_hex    text;
  v_base   text;
  v_n      integer;
BEGIN
  -- Nothing to police if the handle is not being set. This is what protects every
  -- member whose stored handle predates these rules.
  IF TG_OP = 'UPDATE' AND NEW.username IS NOT DISTINCT FROM OLD.username THEN
    RETURN NEW;
  END IF;

  v_raw := coalesce(NEW.username, '');

  -- Mirror of the sanitize step in validateUsername.ts:
  --   trim -> lowercase -> whitespace to underscore -> strip everything else
  v_clean := regexp_replace(
               regexp_replace(lower(btrim(v_raw)), '\s+', '_', 'g'),
               '[^a-z0-9_]', '', 'g');

  -- ── CHANGING AN EXISTING HANDLE: refuse, never rewrite ──────────────────────
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
    IF v_clean LIKE '\_%' OR v_clean LIKE '%\_' THEN
      RAISE EXCEPTION 'Username cannot start or end with an underscore.' USING ERRCODE = '23514';
    END IF;
    IF v_clean LIKE '%\_\_%' THEN
      RAISE EXCEPTION 'Username cannot have consecutive underscores.' USING ERRCODE = '23514';
    END IF;
    IF v_clean = ANY(reserved) THEN
      RAISE EXCEPTION 'This username is reserved.' USING ERRCODE = '23514';
    END IF;
    FOREACH v_pat IN ARRAY profanity LOOP
      IF v_clean ~ v_pat THEN
        RAISE EXCEPTION 'This username is not allowed.' USING ERRCODE = '23514';
      END IF;
    END LOOP;
    -- A rename must not land on someone else's handle. The old body never checked
    -- this on UPDATE at all; only a unique index stood between two members and the
    -- same name, and it would have surfaced as a raw constraint error.
    IF EXISTS (SELECT 1 FROM public.profiles
                WHERE lower(username) = v_clean AND id <> NEW.id) THEN
      RAISE EXCEPTION 'This username is already taken.' USING ERRCODE = '23505';
    END IF;

    NEW.username := v_clean;
    RETURN NEW;
  END IF;

  -- ── SIGNUP: clean quietly, the way a collision is already handled quietly ────
  v_hex := replace(NEW.id::text, '-', '');   -- 32 hex characters, unique per member

  v_clean := regexp_replace(v_clean, '_+', '_', 'g');   -- collapse doubled underscores
  v_clean := btrim(v_clean, '_');                        -- drop leading/trailing ones
  v_clean := left(v_clean, 30);
  v_clean := btrim(v_clean, '_');                        -- truncation may expose one again

  -- Too short (or emptied entirely, e.g. a handle written in another script):
  -- fall back to a generated handle rather than failing the signup.
  IF length(v_clean) < 3 THEN
    v_clean := 'user_' || substr(v_hex, 1, 6);
  END IF;

  FOREACH v_pat IN ARRAY profanity LOOP
    IF v_clean ~ v_pat THEN
      v_clean := 'user_' || substr(v_hex, 1, 6);
      EXIT;
    END IF;
  END LOOP;

  -- Reserved or taken -> suffix it, truncating to 23 first so the result still
  -- fits in 30 characters. Applied AFTER cleaning, so two different raw handles
  -- that clean down to the same string cannot collide.
  --
  -- ⚠️ THIS RETRIES, and that is not theoretical caution. The old body suffixed
  -- exactly once; if the suffixed handle was ALSO taken the INSERT died on the
  -- unique index, which the web signup catch block mistranslates into "Username
  -- is already taken" — for a name the member never chose. Proven on a replica
  -- with two members whose ids share a prefix. Each attempt takes a different
  -- 6-character window of this member's own uuid, so two members signing up at
  -- the same moment never chase the same candidate.
  v_base := btrim(left(v_clean, 23), '_');
  v_n    := 0;
  WHILE v_clean = ANY(reserved)
        OR EXISTS (SELECT 1 FROM public.profiles
                    WHERE lower(username) = v_clean AND id <> NEW.id)
  LOOP
    v_n := v_n + 1;
    IF v_n > 20 THEN
      -- 20 distinct windows of a random uuid all taken is not reachable in
      -- practice; failing loudly beats looping forever inside a signup.
      RAISE EXCEPTION 'Could not derive an available username.' USING ERRCODE = '23505';
    END IF;
    v_clean := v_base || '_' || substr(v_hex, v_n, 6);
  END LOOP;

  NEW.username := v_clean;
  RETURN NEW;
END;
$$;

COMMIT;

-- ── Verify (run after) ────────────────────────────────────────────────────────
--   -- both must report a pinned search_path:
--   SELECT proname, coalesce(array_to_string(proconfig, ','), 'NOT PINNED')
--     FROM pg_proc WHERE proname IN ('handle_new_user','enforce_username_policy');
--
--   -- must return 0 rows: no live handle breaks the rules any more
--   SELECT username FROM public.profiles
--    WHERE username <> regexp_replace(lower(btrim(username)), '[^a-z0-9_]', '', 'g');
--   -- (expect the four dotted legacy handles, which are deliberately kept)
--
--   In the app: edit only your bio -> your handle is untouched.
--               change your handle to something with a dot -> refused, clearly.
--
-- ── Rollback ──────────────────────────────────────────────────────────────────
-- Restores the previous body exactly (reserved words + collisions, no charset):
--
-- CREATE OR REPLACE FUNCTION public.enforce_username_policy()
-- RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   reserved text[] := ARRAY['admin','administrator','mod','moderator','support','help',
--     'reelhouse','system','root','official','staff','team','bot','null','undefined',
--     'anonymous','anon','deleted','unknown','api','www','mail','email','noreply',
--     'no_reply','settings','login','signup','logout','feed','discover','profile',
--     'edit','delete','create','new','user','users'];
--   v_norm text;
-- BEGIN
--   IF TG_OP = 'UPDATE' AND NEW.username IS NOT DISTINCT FROM OLD.username THEN RETURN NEW; END IF;
--   v_norm := lower(coalesce(NEW.username, ''));
--   IF TG_OP = 'UPDATE' THEN
--     IF v_norm = ANY(reserved) THEN RAISE EXCEPTION 'This username is reserved.' USING ERRCODE = '23514'; END IF;
--     RETURN NEW;
--   END IF;
--   IF v_norm = ANY(reserved)
--      OR EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = v_norm AND id <> NEW.id) THEN
--     NEW.username := NEW.username || '_' || substr(replace(NEW.id::text, '-', ''), 1, 6);
--   END IF;
--   RETURN NEW;
-- END; $$;
