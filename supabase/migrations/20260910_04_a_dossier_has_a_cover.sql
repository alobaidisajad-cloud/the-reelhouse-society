-- ═══════════════════════════════════════════════════════════════════════════
-- A DOSSIER'S COVER — the one column the essay's head was already waiting for.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `EssayHead` has drawn a cover since the day it was written: a 176pt band of
-- the film's backdrop, bled to the page edges, under a three-stop gradient that
-- hands off to the ground so the DOSSIER label sits on ink rather than on an
-- image. It reads `film.backdropPath`.
--
-- Nothing has ever set it. `toFilm()` builds `{ title, director, posterPath }`
-- and stops, because there was no column to build it from — a filing records
-- `subject_image`, which is the POSTER, and a poster is 2:3. Stretched across a
-- 176pt band it is a crop of somebody's chin.
--
-- So the whole feature was one column short, and the essay has been running
-- without the thing that makes it read like a feature rather than a post.
--
-- ── WHY NOT REUSE subject_image ────────────────────────────────────────────
-- Because both are wanted, in different places, at the same time: the poster is
-- what the CARD prints beside a filing in the feed and what the archive sets on
-- its plate, and the backdrop is what the essay bleeds behind its title. One
-- column cannot be both, and a filing that swapped one for the other would fix
-- the essay by breaking every card.
--
-- ── THE FOUR GATES A NEW COLUMN GOES THROUGH ───────────────────────────────
--   1. A CEILING. 2048, the same as `subject_image` — these are TMDB URLs and
--      the two are the same kind of thing, so a member cannot post a megabyte
--      of text through an image field.
--   2. COLUMN GRANTS. `authenticated` may write it on their own filing;
--      everyone including `anon` may read it, because the Dispatch is a public
--      paper and the cover is part of what is published.
--   3. The CLIENT sends it and the schema parses it — `subject_backdrop` is in
--      FilingRowSchema, in FILING_CARD_COLUMNS, and in the row the composer
--      writes.
--   4. Nothing PINS it, deliberately: a member may change the film on their own
--      filing, and the cover travels with the film.
--
-- ── AND IT IS NOT IN THE ARCHIVE'S SEARCH ──────────────────────────────────
-- `useDispatchArchive` reads `subject_image` for the film rows it groups. It
-- stays that way: those rows draw a 30x45 poster, not a cover.

BEGIN;

ALTER TABLE public.dispatch_posts
  ADD COLUMN IF NOT EXISTS subject_backdrop text;

-- `IF NOT EXISTS` on the column but not on the constraint: Postgres has no such
-- form for ADD CONSTRAINT, and adding it twice raises rather than silently
-- passing — which is what this DO block turns into a no-op on a second run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'subject_backdrop_ceiling'
       AND conrelid = 'public.dispatch_posts'::regclass
  ) THEN
    ALTER TABLE public.dispatch_posts
      ADD CONSTRAINT subject_backdrop_ceiling
      CHECK (subject_backdrop IS NULL OR char_length(subject_backdrop) <= 2048);
  END IF;
END $$;

COMMENT ON COLUMN public.dispatch_posts.subject_backdrop IS
  'The film''s BACKDROP — the wide still an essay bleeds behind its title. '
  'Separate from subject_image, which is the 2:3 poster the feed card prints; '
  'both are wanted at once and one column cannot be both.';

GRANT SELECT (subject_backdrop) ON public.dispatch_posts TO anon, authenticated;
GRANT INSERT (subject_backdrop), UPDATE (subject_backdrop)
  ON public.dispatch_posts TO authenticated;

COMMIT;

-- ── PROVE IT ───────────────────────────────────────────────────────────────
--   -- the column, the ceiling and the grants
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='dispatch_posts' AND column_name='subject_backdrop';
--
--   SELECT conname FROM pg_constraint
--    WHERE conrelid='public.dispatch_posts'::regclass AND conname='subject_backdrop_ceiling';
--
--   SELECT grantee, privilege_type FROM information_schema.column_privileges
--    WHERE table_name='dispatch_posts' AND column_name='subject_backdrop'
--      AND grantee IN ('anon','authenticated');
--
--   -- and the ceiling actually refuses:
--   BEGIN;
--   UPDATE public.dispatch_posts SET subject_backdrop = repeat('x', 2049)
--    WHERE id = (SELECT id FROM public.dispatch_posts LIMIT 1);   -- expect: violates check
--   ROLLBACK;
