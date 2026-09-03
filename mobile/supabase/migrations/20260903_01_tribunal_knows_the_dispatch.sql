-- ═══════════════════════════════════════════════════════════════════════════
-- THE TRIBUNAL CANNOT SEE OR REMOVE A FILING
--
-- Step one taught `reports.content_type` two new values — `dispatch_post` and
-- `dispatch_comment` — so a member can now report a filing or a critique. Two
-- server functions decide what happens next, and neither has ever heard of
-- them:
--
--   get_report_evidence        returns { found: false } for an unknown type, so
--                              the case opens with NO EXHIBIT. A moderator is
--                              asked to judge something they cannot read.
--
--   resolve_moderation_report_v2  raises "Cannot remove content of type
--                              dispatch_post". Loud rather than silent, which is
--                              the right failure — but the moderator still
--                              cannot act on the report they were shown.
--
-- Reporting a filing therefore reaches a Tribunal that can do nothing with it.
--
-- ── WHY THIS EXTENDS THE LIVE BODY INSTEAD OF REPLACING IT ─────────────────
-- Both functions exist in this repo, and this repo has disagreed with what is
-- actually deployed THREE times in this project. Pasting the repo's version
-- would silently discard whatever production has that the repo does not.
--
-- So the migration READS the live definition, finds an anchor inside it, splices
-- the two new branches in, and re-executes it. If the anchor is not there — the
-- live body is not the one this was written against — it RAISES and the whole
-- transaction rolls back rather than guessing. And it checks afterwards that the
-- branches really are in the stored body, because a string operation that
-- silently did nothing is exactly how a "fix" gets committed and never applies.
--
-- Runs inside ONE transaction. If any statement fails, nothing happens at all.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── 1 · THE EXHIBIT ────────────────────────────────────────────────────────
-- A filing's body is `body` for the four short kinds and `full_content` for a
-- dossier, so the exhibit shows whichever is there. The route is the reader's
-- real address, and a critique's route is its POST's — a moderator needs the
-- argument around a line, not the line alone.
DO $evidence$
DECLARE def text; at int; ins text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.get_report_evidence(uuid)');
  IF def IS NULL THEN
    RAISE EXCEPTION 'get_report_evidence(uuid) not found — stop and look';
  END IF;
  IF position('dispatch_post' in def) > 0 THEN
    RAISE NOTICE 'get_report_evidence already knows the Dispatch — leaving it alone';
  ELSE
    -- Anchored on the graceful-miss branch, which is the last thing in the CASE
    -- and the one distinctive line in the function.
    at := position('ELSE' in def);
    IF at = 0 THEN
      RAISE EXCEPTION 'no ELSE branch in get_report_evidence — the live body is not the one this migration expects';
    END IF;

    ins := E'  ELSIF v_type = ''dispatch_post'' THEN\n'
        || E'    SELECT coalesce(title, left(body, 200)), coalesce(full_content, body), ''/dispatch/'' || id::text\n'
        || E'      INTO v_title, v_body, v_route FROM dispatch_posts WHERE id = v_content_id;\n\n'
        || E'  ELSIF v_type = ''dispatch_comment'' THEN\n'
        || E'    SELECT body, ''/dispatch/'' || post_id::text\n'
        || E'      INTO v_body, v_route FROM dispatch_comments WHERE id = v_content_id;\n\n';

    def := left(def, at - 1) || ins || substr(def, at);
    EXECUTE def;
  END IF;
END $evidence$;

-- ── 2 · THE ACT ────────────────────────────────────────────────────────────
-- A DELETE on dispatch_posts does NOT delete it: the `no_hard_delete` trigger
-- turns it into an ending, so the text goes and the critiques other members
-- wrote underneath it stay. That is exactly what removing a filing should mean,
-- and it is why this branch is a plain DELETE rather than a special case — the
-- rule lives on the table, so every path gets it.
--
-- A critique IS deleted outright. There is nothing underneath it to preserve.
DO $act$
DECLARE def text; at int; ins text; ends int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p
   WHERE p.oid = to_regprocedure(
     'public.resolve_moderation_report_v2(uuid, text, uuid, text, integer, boolean)');
  IF def IS NULL THEN
    RAISE EXCEPTION 'resolve_moderation_report_v2 not found at the expected signature — stop and look';
  END IF;

  IF position('dispatch_post' in def) > 0 THEN
    RAISE NOTICE 'resolve_moderation_report_v2 already knows the Dispatch — leaving it alone';
  ELSE
    at := position('WHEN ''dossier_comment''' in def);
    IF at = 0 THEN
      RAISE EXCEPTION 'no dossier_comment branch in resolve_moderation_report_v2 — the live body is not the one this migration expects';
    END IF;
    -- Insert AFTER that branch's statement, so the new WHENs sit inside the same
    -- CASE rather than before it.
    ends := position(';' in substr(def, at));
    IF ends = 0 THEN
      RAISE EXCEPTION 'could not find the end of the dossier_comment branch';
    END IF;

    ins := E'\n        WHEN ''dispatch_post''    THEN DELETE FROM dispatch_posts    WHERE id = v_content_id;'
        || E'\n        WHEN ''dispatch_comment'' THEN DELETE FROM dispatch_comments WHERE id = v_content_id;';

    def := left(def, at + ends - 1) || ins || substr(def, at + ends);
    EXECUTE def;
  END IF;
END $act$;

-- ── 3 · AND PROVE IT LANDED ────────────────────────────────────────────────
-- A splice that matched nothing would have left both functions exactly as they
-- were, and the NOTICEs above would have scrolled past. This is the check that
-- makes the migration's claim true rather than merely attempted.
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
END $verify$;

COMMIT;
