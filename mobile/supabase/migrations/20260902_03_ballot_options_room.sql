-- ═══════════════════════════════════════════════════════════════════════════
-- THE DISPATCH · A BALLOT WITH SIX REAL FILMS IN IT
--
-- `options_ceiling` was set to 1200 bytes on the serialised jsonb array. That
-- number was chosen when a ballot option was imagined as a line of text. It is
-- not: the picker says "Two to six FILMS", so each option carries a film's id,
-- its title and its poster path.
--
-- Measured rather than guessed — dispatchFieldCaps.test.ts builds the worst
-- honest ballot and serialises it:
--
--   six options × {film_id, title (150), poster_path} = 1399 bytes
--
-- So the fence was already below a ballot a member could really file, and the
-- refusal would have arrived as a constraint error after they pressed FILE.
-- Six options at the app's cap of 200 characters is about 1720; 4000 leaves the
-- title room to grow without another migration, and is still far below anything
-- that could be used to bloat a row.
--
-- The app cap moves with it, in the same change: MAX_LENGTHS.ballotOption 150 →
-- 200. The test reconciles the two, so neither can move alone again.
--
-- Runs inside ONE transaction. If any statement fails, nothing happens at all.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.dispatch_posts') IS NULL THEN
    RAISE EXCEPTION 'dispatch_posts is missing — run step one first';
  END IF;
END $preflight$;

ALTER TABLE public.dispatch_posts DROP CONSTRAINT IF EXISTS options_ceiling;
ALTER TABLE public.dispatch_posts
  ADD CONSTRAINT options_ceiling
  CHECK (options IS NULL OR char_length(options::text) <= 4000);

-- ═══════════════════════════════════════════════════════════════════════════
-- AND ONE INDEX THAT WAS NEVER DOING ANYTHING
--
-- `check-backend-live.mjs` reports dispatch_votes_post as redundant, and it is:
-- dispatch_votes already carries UNIQUE (post_id, user_id), whose LEADING column
-- is post_id — so every lookup the single-column index could serve, the unique
-- one serves already. What it does do is cost a second write on every vote cast.
--
-- Dropped on STRUCTURAL coverage, not on a scan count. Batch 30 proved scan
-- counts lie in both directions: a 32-row table ignored a good index and a
-- 54-row table used a bad one, so "nobody has scanned it" is a fact about
-- today's data, while "another index begins with the same column" is a fact
-- about the index.
--
-- Its two neighbours are NOT dropped, and the difference is the point:
--   · dispatch_saves_post — the primary key is (user_id, post_id), so post_id is
--     the SECOND column and a lookup by post_id alone is not covered.
--   · dispatch_cert_user  — the composite it resembles is PARTIAL
--     (WHERE post_id IS NOT NULL), so it cannot answer for a certification on a
--     critique, where post_id is null.
-- ═══════════════════════════════════════════════════════════════════════════

-- Re-derived here rather than trusted: the drop happens only if an index really
-- does exist whose leading column is post_id and which is neither partial nor
-- the one being dropped. If step one is ever changed so that unique key goes
-- away, this quietly does nothing instead of removing the last index.
DO $$
DECLARE covered boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
     WHERE i.indrelid = 'public.dispatch_votes'::regclass
       AND c.relname <> 'dispatch_votes_post'
       AND i.indpred IS NULL
       AND i.indkey[0] = (SELECT attnum FROM pg_attribute
                           WHERE attrelid = 'public.dispatch_votes'::regclass
                             AND attname = 'post_id')
  ) INTO covered;

  IF covered THEN
    DROP INDEX IF EXISTS public.dispatch_votes_post;
  ELSE
    RAISE NOTICE 'dispatch_votes_post kept — nothing else leads with post_id';
  END IF;
END $$;

COMMIT;
