-- ═══════════════════════════════════════════════════════════════════════════
-- THE TRIBUNAL CANNOT SEE OR REMOVE A FILING
--
-- Step one taught `reports.content_type` two new values — `dispatch_post` and
-- `dispatch_comment` — so a member can now report a filing or a critique. Two
-- server functions decide what happens next, and neither has ever heard of
-- them:
--
--   get_report_evidence           returns { found: false } for an unknown type,
--                                 so the case opens with NO EXHIBIT. A moderator
--                                 is asked to judge something they cannot read.
--
--   resolve_moderation_report_v2  raises "Cannot remove content of type
--                                 dispatch_post". Loud rather than silent, which
--                                 is the right failure — and still a moderator
--                                 who cannot act on the report in front of them.
--
-- Reporting a filing therefore reaches a Tribunal that can do nothing with it.
--
-- ── WHY THIS EXTENDS THE LIVE BODY INSTEAD OF REPLACING IT ─────────────────
-- Both functions exist in this repo, and this repo has disagreed with what is
-- actually deployed THREE times in this project. Pasting the repo's version
-- would silently discard whatever production has that the repo does not.
--
-- So the migration READS the live definition, finds an anchor inside it, splices
-- the new branches in, and re-executes it.
--
-- ── AND WHY THE ANCHOR IS A STRING LITERAL, NOT A KEYWORD ──────────────────
-- The first draft anchored the evidence function on its `ELSE`. That is the one
-- mistake here that a rollback could not have saved: an ELSIF spliced before the
-- WRONG `ELSE` attaches to a different IF chain, and the result can COMPILE and
-- be quietly wrong — a moderator shown the wrong exhibit rather than an error.
--
-- Both anchors are now `'dossier_comment'`, the quoted literal. Its spelling is
-- fixed by the DATA rather than by whoever wrote the function, so it cannot
-- differ in case or whitespace between the repo and production. It must appear
-- EXACTLY ONCE — if it appears twice the function is not shaped the way this
-- migration understands, and guessing which one to splice after is exactly the
-- kind of guess that produces a plausible wrong answer.
--
-- Everything else is refusal rather than repair: no anchor, wrong count, or a
-- body that will not compile, and the whole transaction rolls back untouched.
--
-- Runs inside ONE transaction. If any statement fails, nothing happens at all.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- A body that does not parse must be REFUSED, not stored to fail later at the
-- first call. This is on by default; setting it makes the migration's safety
-- independent of the server's configuration rather than assuming it.
SET LOCAL check_function_bodies = on;

/**
 * Splice one or more branches into a live function, after the branch that
 * handles `dossier_comment`.
 *
 * Written once because both functions need exactly this and two copies is two
 * chances for one of them to skip a guard.
 */
CREATE OR REPLACE FUNCTION pg_temp.splice_after_dossier_comment(
  p_signature text, p_insert text
) RETURNS text
LANGUAGE plpgsql
-- Pinned like every other function this project has written since batch 29.
--
-- The risk here is genuinely nil — it lives in pg_temp, it is not SECURITY
-- DEFINER so it runs as whoever ran the migration, and everything it calls is a
-- pg_catalog builtin that pg_temp cannot shadow. It is pinned anyway, because
-- `searchPathHardening.test.ts` enumerates every function from batch 29 onward
-- and an exemption for "this one is obviously safe" is how the rule stops being
-- checkable. The guard found this within a minute of the file existing, which is
-- the argument for the rule being absolute.
SET search_path = public, pg_temp
AS $splice$
DECLARE
  def text;
  anchor constant text := '''dossier_comment''';
  hits int;
  at int;
  ends int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p WHERE p.oid = to_regprocedure(p_signature);
  IF def IS NULL THEN
    RAISE EXCEPTION '% not found — stop and look', p_signature;
  END IF;

  -- Already done. Idempotent by the thing itself rather than by a flag.
  IF position('dispatch_post' in def) > 0 THEN
    RETURN 'already knows the Dispatch';
  END IF;

  hits := array_length(string_to_array(def, anchor), 1) - 1;
  IF hits <> 1 THEN
    -- `%` and not `%s`: RAISE uses bare % for its placeholders, so a %s prints
    -- the value followed by a stray "s" and the message reads like a typo at
    -- exactly the moment somebody needs to trust it.
    RAISE EXCEPTION
      '% has % occurrence(s) of % — expected exactly 1. The live body is not the shape this migration understands; stop and look rather than guess.',
      p_signature, hits, anchor;
  END IF;

  at := position(anchor in def);
  -- The end of that branch's statement. If a semicolon appears earlier than the
  -- terminator — inside a comment, say — the splice lands mid-statement and the
  -- body fails to compile, which rolls the whole thing back.
  ends := position(';' in substr(def, at));
  IF ends = 0 THEN
    RAISE EXCEPTION '% — could not find the end of the dossier_comment branch', p_signature;
  END IF;

  def := left(def, at + ends - 1) || p_insert || substr(def, at + ends);
  EXECUTE def;
  RETURN 'spliced';
END $splice$;

-- ── 1 · THE EXHIBIT ────────────────────────────────────────────────────────
-- A filing's text is `body` for the four short kinds and `full_content` for a
-- dossier, so the exhibit shows whichever is there.
--
-- `title` is passed through as it stands — NULL for a take, a seeking and a
-- wire, because those genuinely have no headline. Putting the first 200
-- characters of the body there instead would print the same words twice in the
-- moderator's view and invent a title for something that has none; the evidence
-- panel already draws a body with no title, which is how a log_comment appears.
--
-- A critique's route is its POST's: a moderator needs the argument around a
-- line, not the line on its own.
DO $evidence$
DECLARE result text;
BEGIN
  SELECT pg_temp.splice_after_dossier_comment(
    'public.get_report_evidence(uuid)',
    E'\n\n  ELSIF v_type = ''dispatch_post'' THEN\n'
    || E'    SELECT title, coalesce(full_content, body), ''/dispatch/'' || id::text\n'
    || E'      INTO v_title, v_body, v_route FROM dispatch_posts WHERE id = v_content_id;\n\n'
    || E'  ELSIF v_type = ''dispatch_comment'' THEN\n'
    || E'    SELECT body, ''/dispatch/'' || post_id::text\n'
    || E'      INTO v_body, v_route FROM dispatch_comments WHERE id = v_content_id;'
  ) INTO result;
  RAISE NOTICE 'get_report_evidence: %', result;
END $evidence$;

-- ── 2 · THE ACT ────────────────────────────────────────────────────────────
-- A DELETE on dispatch_posts does NOT delete it: the `no_hard_delete` trigger
-- turns it into an ending, so the text goes and the critiques other members
-- wrote underneath it stay. That is exactly what removing a filing should mean,
-- and it is why this branch is a plain DELETE rather than a special case — the
-- rule lives on the TABLE, so every path gets it without knowing about it.
--
-- The trigger stamps `ended_by = 'house'` here, because the moderator is not the
-- author. That is the difference between the two tombstones the reader draws.
--
-- A critique IS deleted outright. There is nothing underneath it to preserve.
DO $act$
DECLARE result text;
BEGIN
  SELECT pg_temp.splice_after_dossier_comment(
    'public.resolve_moderation_report_v2(uuid, text, uuid, text, integer, boolean)',
    E'\n        WHEN ''dispatch_post''    THEN DELETE FROM dispatch_posts    WHERE id = v_content_id;'
    || E'\n        WHEN ''dispatch_comment'' THEN DELETE FROM dispatch_comments WHERE id = v_content_id;'
  ) INTO result;
  RAISE NOTICE 'resolve_moderation_report_v2: %', result;
END $act$;

-- ── 3 · AND PROVE IT LANDED ────────────────────────────────────────────────
-- A splice that matched nothing would have left both functions exactly as they
-- were, and the NOTICEs above would have scrolled past unread. This is what
-- makes the migration's claim true rather than merely attempted: it re-reads
-- what is now STORED, not what was executed.
DO $verify$
DECLARE a text; b text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO a FROM pg_proc
   WHERE oid = to_regprocedure('public.get_report_evidence(uuid)');
  SELECT pg_get_functiondef(oid) INTO b FROM pg_proc
   WHERE oid = to_regprocedure(
     'public.resolve_moderation_report_v2(uuid, text, uuid, text, integer, boolean)');

  IF position('dispatch_post' in a) = 0 OR position('dispatch_comment' in a) = 0 THEN
    RAISE EXCEPTION 'get_report_evidence still cannot see a filing';
  END IF;
  IF position('dispatch_post' in b) = 0 OR position('dispatch_comment' in b) = 0 THEN
    RAISE EXCEPTION 'resolve_moderation_report_v2 still cannot remove a filing';
  END IF;

  -- And the branches went into the right function each: the evidence function
  -- reads, the resolver deletes. A splice that put the DELETE into the reader
  -- would satisfy the checks above and be nonsense.
  IF position('FROM dispatch_posts' in a) = 0 THEN
    RAISE EXCEPTION 'get_report_evidence does not read dispatch_posts — the splice went somewhere wrong';
  END IF;
  IF position('DELETE FROM dispatch_posts' in b) = 0 THEN
    RAISE EXCEPTION 'resolve_moderation_report_v2 does not delete from dispatch_posts — the splice went somewhere wrong';
  END IF;
END $verify$;

COMMIT;
