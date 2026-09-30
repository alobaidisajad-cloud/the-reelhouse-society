-- ════════════════════════════════════════════════════════════════════════════
-- 20260930_02 — a withdrawn filing is over: its words are gone, and nothing
--               more can be done to it
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── WHAT WAS THERE ────────────────────────────────────────────────────────
-- Ending a filing (the author withdrawing it, or the house removing it) keeps
-- the row, so the critiques under it survive, and empties it: "a tombstone
-- that only hides the text on screen is a lie" (20260902_01). The emptying was
-- written out TWICE, once in end_filing and once in the no_hard_delete trigger
-- (the Tribunal's path), and both lists predate two columns:
--
--   subject_backdrop  the cover a member chose for the filing (20260910)
--   source_url        the link under a wire (its `source` WAS emptied)
--
-- So a withdrawn filing's cover and link stayed in the row, readable by anyone
-- holding the anon key (both columns are granted to anon), while the app drew
-- "This filing was withdrawn by its author."
--
-- And a withdrawn filing was not over. Through the API:
--   · a withdrawn ballot still took votes until its closing date
--     (votes_still_open checked only closes_at);
--   · a withdrawn filing could still be certified, which counts, and sends its
--     author "… certified your take." about a filing they took down
--     (no policy on certifications looked at the filing at all);
--   · when a withdrawn ballot's date passed, freeze_closed_ballots froze it and
--     told every voter "A ballot you voted in has closed." — then opened a
--     tombstone.
-- Critiques were already refused on an ended filing (critiques_open_post);
-- these now answer the same way.
--
-- ── WHAT REPLACES IT ──────────────────────────────────────────────────────
-- ONE erase, dispatch_empty_filing, called by both paths. Which columns it
-- empties is decided once, here, and every column of dispatch_posts is either
-- in its list or named as kept — src/utils/__tests__/aWithdrawnFilingKeepsNothing
-- .test.ts reads the snapshot and fails when a column is added without that
-- decision. Kept, on purpose:
--   the room itself     id, kind, user_id, author_username, created_at, …
--   what it was about   subject_kind/id/title/sub — the catalogue's facts
--   the ballot's films  options (catalogue films), closes_at
--   the series          series_id/title, part_number: the SeriesPicker counts
--                       ended parts, so the next part is not numbered again
--
-- Rows already ended are emptied the same way below.
--
-- No transaction control here: the rehearsal (mobile/supabase/diagnostics/
-- withdrawn_filing_rehearsal.sql) includes this file inside its own
-- transaction.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.dispatch_empty_filing(p_post uuid, p_by text) RETURNS void
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
  UPDATE public.dispatch_posts
     SET body = '', full_content = NULL, title = NULL,
         subject_image = NULL, subject_backdrop = NULL,
         source = NULL, source_url = NULL, spoiler_label = NULL,
         ended_at = now(), ended_by = p_by
   WHERE id = p_post AND ended_at IS NULL;
$$;

COMMENT ON FUNCTION public.dispatch_empty_filing(uuid, text) IS
  'The one erase of a filing that ends. Called by end_filing and the no_hard_delete trigger (both SECURITY DEFINER); no role may call it directly.';

REVOKE ALL ON FUNCTION public.dispatch_empty_filing(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_empty_filing(uuid, text) FROM anon, authenticated;


CREATE OR REPLACE FUNCTION public.end_filing(p_post uuid, p_by text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF p_by NOT IN ('author','house') THEN RAISE EXCEPTION 'bad ended_by'; END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'P0001';
  END IF;

  IF p_by = 'author' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.dispatch_posts
       WHERE id = p_post AND user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'not yours' USING ERRCODE = '42501';
    END IF;
  ELSE
    -- 'house'. The same admin predicate the Tribunal uses, so there is one
    -- answer in this database to "is this the house" rather than two.
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid() AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'not the house' USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM public.dispatch_empty_filing(p_post, p_by);
END $$;


CREATE OR REPLACE FUNCTION public.dispatch_no_hard_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF coalesce(current_setting('dispatch.allow_hard_delete', true), '') = 'on' THEN
    RETURN OLD;
  END IF;

  -- already ended: nothing to erase, and nothing to delete either
  IF OLD.ended_at IS NOT NULL THEN RETURN NULL; END IF;

  PERFORM public.dispatch_empty_filing(
    OLD.id,
    CASE WHEN OLD.user_id IS NOT DISTINCT FROM auth.uid() THEN 'author' ELSE 'house' END);

  RETURN NULL;   -- the delete does not happen
END $$;


-- Filings already ended keep nothing either.
UPDATE public.dispatch_posts
   SET subject_backdrop = NULL, source_url = NULL
 WHERE ended_at IS NOT NULL
   AND (subject_backdrop IS NOT NULL OR source_url IS NOT NULL);


-- A withdrawn ballot takes no more votes.
ALTER POLICY votes_still_open ON public.dispatch_votes
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.dispatch_posts p
     WHERE p.id = dispatch_votes.post_id
       AND p.closes_at > now()
       AND p.ended_at IS NULL));

-- A withdrawn (or withheld) filing is certified no more — the same door the
-- critiques have (critiques_open_post). A certification of a CRITIQUE carries
-- no post_id (one_target) and is not this door's business: the critiques under
-- a tombstone survive, which is the reason ending is not deleting. Taking a
-- certification back is not touched either: that is a DELETE, and a member may
-- always withdraw their own act.
DROP POLICY IF EXISTS certs_open_post ON public.dispatch_certifications;
CREATE POLICY certs_open_post ON public.dispatch_certifications
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (post_id IS NULL OR EXISTS (
    SELECT 1 FROM public.dispatch_posts p
     WHERE p.id = dispatch_certifications.post_id
       AND p.ended_at IS NULL
       AND p.withheld_at IS NULL));


-- A withdrawn ballot does not close: nobody is told a ballot they can no
-- longer see has a result.
CREATE OR REPLACE FUNCTION public.freeze_closed_ballots() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE n integer;
BEGIN
  WITH tallied AS (
    SELECT p.id,
           jsonb_build_object(
             -- sum(v.n), not count(v.id): `v` is already GROUPED BY option, so
             -- it has no id to count and one row per option rather than one per
             -- vote. Counting its rows would have recorded "2 ballots cast" for
             -- a ballot with two options and two hundred voters — a permanent,
             -- plausible, wrong number, written once and never recomputed.
             'total', coalesce(sum(v.n), 0),
             'counts', coalesce(jsonb_object_agg(v.option_index, v.n)
                                FILTER (WHERE v.option_index IS NOT NULL), '{}'::jsonb),
             'frozen_at', now()
           ) AS totals
      FROM public.dispatch_posts p
      LEFT JOIN (
        SELECT post_id, option_index, count(*) AS n
          FROM public.dispatch_votes GROUP BY post_id, option_index
      ) v ON v.post_id = p.id
     WHERE p.kind = 'ballot'
       AND p.closes_at <= now()
       AND p.frozen_totals IS NULL
       AND p.ended_at IS NULL
     GROUP BY p.id
  )
  UPDATE public.dispatch_posts p
     SET frozen_totals = t.totals
    FROM tallied t
   WHERE p.id = t.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
