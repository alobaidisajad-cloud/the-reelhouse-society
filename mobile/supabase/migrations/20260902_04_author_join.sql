-- ═══════════════════════════════════════════════════════════════════════════
-- THE DISPATCH · THE BYLINE CANNOT REACH ITS AUTHOR
--
-- A filing's byline carries four things about the member who wrote it: their
-- name, their member number, their tier — which paints the ring brass for an
-- Archivist and crimson for an Auteur — and their portrait. Three of those four
-- live on `profiles`, and this app reads them the way every other feed does, by
-- embedding the author in the same request:
--
--   .select('…, profiles!lounge_messages_user_id_fkey(username, avatar_url)')
--
-- PostgREST can only do that across a declared FOREIGN KEY. The old tables had
-- one: `dispatch_dossiers.user_id` and `dossier_comments.user_id` both
-- referenced `public.profiles` (20260810_02_deletion_integrity). Step one made
-- the new columns reference `auth.users` instead — defensible in isolation, and
-- it quietly removed the join every byline in the app is built on.
--
-- Without this, drawing a feed of twenty filings means twenty-one round trips,
-- or a byline with no ring and no portrait. Neither is the page we drew.
--
-- ── WHY BOTH KEYS, AND NOT A SWAP ──────────────────────────────────────────
-- The auth.users key stays. `profiles.id` already references `auth.users(id)`
-- ON DELETE CASCADE, so the two never disagree: deleting the account removes
-- the profile, which sets this column NULL, and the auth key would have set it
-- NULL anyway. Keeping both means the column is correct whether a member is
-- removed through auth or through their profile row, and the second key costs
-- one index lookup on a delete that already touches the row.
--
-- Named explicitly, because the NAME is the API: PostgREST addresses the
-- relationship by constraint name, so a generated name would be a hidden
-- dependency that a later migration could rename without anyone noticing.
--
-- Both columns are already indexed for this — dispatch_posts_author leads with
-- user_id, dispatch_comments_user is exactly it — so the cascade a deletion
-- performs stays an index scan rather than the sequential scan that made
-- account deletion 143 times slower in batch 30.
--
-- Runs inside ONE transaction. If any statement fails, nothing happens at all.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.dispatch_posts') IS NULL THEN
    RAISE EXCEPTION 'dispatch_posts is missing — run step one first';
  END IF;
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'profiles is missing — stop and look';
  END IF;
  -- A filing whose author has no profile row would be refused by the new key.
  -- There should be none; if there are, this says so instead of failing on a
  -- constraint violation that names a number rather than a cause.
  IF EXISTS (
    SELECT 1 FROM public.dispatch_posts p
     WHERE p.user_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = p.user_id)
  ) THEN
    RAISE EXCEPTION 'some filings have an author with no profile row — look before adding the key';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.dispatch_comments c
     WHERE c.user_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = c.user_id)
  ) THEN
    RAISE EXCEPTION 'some critiques have an author with no profile row — look before adding the key';
  END IF;
END $preflight$;

ALTER TABLE public.dispatch_posts
  DROP CONSTRAINT IF EXISTS dispatch_posts_profile_fkey;
ALTER TABLE public.dispatch_posts
  ADD CONSTRAINT dispatch_posts_profile_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.dispatch_comments
  DROP CONSTRAINT IF EXISTS dispatch_comments_profile_fkey;
ALTER TABLE public.dispatch_comments
  ADD CONSTRAINT dispatch_comments_profile_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMIT;
