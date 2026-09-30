-- ════════════════════════════════════════════════════════════════════════════
-- withdrawn_filing_rehearsal.sql — is a withdrawn filing over?
-- ════════════════════════════════════════════════════════════════════════════
-- Runs against LIVE rules as two real members, inside one transaction that
-- ROLLS BACK. Nothing is kept: every filing here is made up (fixed ids), and
-- every write, vote, certification and notice is undone with it.
--
--   psql "$SUPABASE_DB_URL" -X -q -t -A -v with_fix=1 -f mobile/supabase/diagnostics/withdrawn_filing_rehearsal.sql
--
-- `with_fix=1` applies 20260930_02 first, inside the same transaction. Without
-- it, the cases below say NO: the cover and the link survive a withdrawal, a
-- withdrawn ballot takes a vote, a withdrawn filing takes a certification, a
-- withdrawn ballot is frozen (and its voters told), and there is no single
-- erase to refuse. Read each NOTICE as  case | expected | got.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\if :{?with_fix}
\ir ../../../supabase/migrations/20260930_02_a_withdrawn_filing_is_over.sql
\endif

-- Filed before anyone is anyone: auth.uid() is null here, so no tier gate asks.
SELECT set_config('request.jwt.claims', '', true);

CREATE TEMP TABLE rehearsal_members ON COMMIT DROP AS
  SELECT id, row_number() OVER (ORDER BY created_at) AS n FROM auth.users ORDER BY created_at LIMIT 2;
GRANT SELECT ON rehearsal_members TO authenticated;

-- Fixtures, all by member 1. The every-field wire and take are what the erase
-- must empty; the ballots and the plain take are what the doors must answer.
INSERT INTO public.dispatch_posts
  (id, kind, user_id, author_username, title, body, full_content, subject_kind, subject_id, subject_title,
   subject_image, subject_backdrop, source, source_url, spoiler_label, options, closes_at)
SELECT v.id::uuid, v.kind, m.id, 'rehearsal', v.title, 'Words.', v.essay, 'film', 11, 'Sunrise',
       '/still.jpg', '/cover.jpg', v.source, v.url, v.spoiler, v.options::jsonb, v.closes::timestamptz
  FROM rehearsal_members m,
       (VALUES
         ('0f11e0de-0000-4000-8000-000000000001', 'wire',   'A title', NULL,     'Variety', 'https://example.com/w', 'Ending', NULL, NULL),
         ('0f11e0de-0000-4000-8000-000000000002', 'take',   NULL,      NULL,     NULL,      'https://example.com/t', 'Ending', NULL, NULL),
         ('0f11e0de-0000-4000-8000-000000000003', 'ballot', 'Which?',  NULL,     NULL,      NULL, NULL, '[{"id":1},{"id":2}]', '2999-01-01'),
         ('0f11e0de-0000-4000-8000-000000000004', 'ballot', 'Past?',   NULL,     NULL,      NULL, NULL, '[{"id":1},{"id":2}]', '2000-01-01'),
         ('0f11e0de-0000-4000-8000-000000000005', 'take',   NULL,      NULL,     NULL,      NULL, NULL, NULL, NULL),
         ('0f11e0de-0000-4000-8000-000000000006', 'ballot', 'Open?',   NULL,     NULL,      NULL, NULL, '[{"id":1},{"id":2}]', '2999-01-01'),
         ('0f11e0de-0000-4000-8000-000000000007', 'ballot', 'Done?',   NULL,     NULL,      NULL, NULL, '[{"id":1},{"id":2}]', '2000-01-01')
       ) AS v(id, kind, title, essay, source, url, spoiler, options, closes)
 WHERE m.n = 1;

-- A critique under the filing that will be withdrawn: it survives, and may still be certified.
INSERT INTO public.dispatch_comments (id, post_id, user_id, author_username, body)
SELECT '0f11e0de-0000-4000-8000-0000000000c1', '0f11e0de-0000-4000-8000-000000000001', id, 'rehearsal', 'A reply.'
  FROM rehearsal_members WHERE n = 1;

-- The house removes the take: the Tribunal's path, a DELETE the trigger turns
-- into an end. Run as the owner, the way resolve_moderation_report_v2 runs it,
-- with the moderator (member 2) as the caller.
DO $$ BEGIN
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', (SELECT id FROM rehearsal_members WHERE n = 2)), true);
END $$;
DELETE FROM public.dispatch_posts WHERE id = '0f11e0de-0000-4000-8000-000000000002';

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  a uuid := (SELECT id FROM rehearsal_members WHERE n = 1);
  b uuid := (SELECT id FROM rehearsal_members WHERE n = 2);
  as_member CONSTANT text := '{"sub":"%s","role":"authenticated"}';
  erased CONSTANT text[] := ARRAY['body','full_content','title','subject_image','subject_backdrop',
                                  'source','source_url','spoiler_label'];
  got text;
BEGIN
  -- ── the author withdraws the wire and both ballots ──────────────────────
  PERFORM set_config('request.jwt.claims', format(as_member, a), true);
  PERFORM public.end_filing('0f11e0de-0000-4000-8000-000000000001', 'author');
  PERFORM public.end_filing('0f11e0de-0000-4000-8000-000000000003', 'author');
  PERFORM public.end_filing('0f11e0de-0000-4000-8000-000000000004', 'author');

  SELECT coalesce(string_agg(e.key, ',' ORDER BY e.key), '') INTO got
    FROM public.dispatch_posts p, jsonb_each(to_jsonb(p)) e
   WHERE p.id = '0f11e0de-0000-4000-8000-000000000001'
     AND e.key = ANY (erased) AND e.value NOT IN ('null'::jsonb, '""'::jsonb);
  RAISE NOTICE '%|%|%', 'withdrawn by its author: nothing of its words is left', '', got;

  SELECT coalesce(string_agg(e.key, ',' ORDER BY e.key), '') || '/' || max(p.ended_by) INTO got
    FROM public.dispatch_posts p
    LEFT JOIN LATERAL jsonb_each(to_jsonb(p)) e
      ON e.key = ANY (erased) AND e.value NOT IN ('null'::jsonb, '""'::jsonb)
   WHERE p.id = '0f11e0de-0000-4000-8000-000000000002';
  RAISE NOTICE '%|%|%', 'removed by the house: the same erase', '/house', got;

  -- ── member 2 tries to act on what was withdrawn ─────────────────────────
  PERFORM set_config('request.jwt.claims', format(as_member, b), true);

  got := 'counted';
  BEGIN
    INSERT INTO public.dispatch_votes (post_id, user_id, option_index)
    VALUES ('0f11e0de-0000-4000-8000-000000000003', b, 0);
  EXCEPTION WHEN insufficient_privilege THEN got := 'refused';
  END;
  RAISE NOTICE '%|%|%', 'a vote on a withdrawn ballot', 'refused', got;

  got := 'counted';
  BEGIN
    INSERT INTO public.dispatch_certifications (user_id, post_id)
    VALUES (b, '0f11e0de-0000-4000-8000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN got := 'refused';
  END;
  RAISE NOTICE '%|%|%', 'certifying a withdrawn filing', 'refused', got;

  -- ── and what is still open stays open (the doors can say YES) ────────────
  got := 'counted';
  BEGIN
    INSERT INTO public.dispatch_certifications (user_id, comment_id)
    VALUES (b, '0f11e0de-0000-4000-8000-0000000000c1');
  EXCEPTION WHEN insufficient_privilege THEN got := 'refused';
  END;
  RAISE NOTICE '%|%|%', 'a critique under the tombstone may still be certified', 'counted', got;

  got := 'counted';
  BEGIN
    INSERT INTO public.dispatch_certifications (user_id, post_id)
    VALUES (b, '0f11e0de-0000-4000-8000-000000000005');
  EXCEPTION WHEN insufficient_privilege THEN got := 'refused';
  END;
  RAISE NOTICE '%|%|%', 'a standing filing may be certified', 'counted', got;

  got := 'counted';
  BEGIN
    INSERT INTO public.dispatch_votes (post_id, user_id, option_index)
    VALUES ('0f11e0de-0000-4000-8000-000000000006', b, 1);
  EXCEPTION WHEN insufficient_privilege THEN got := 'refused';
  END;
  RAISE NOTICE '%|%|%', 'a vote on an open ballot', 'counted', got;

  -- ── the erase is the house's alone ──────────────────────────────────────
  got := 'called';
  BEGIN
    PERFORM public.dispatch_empty_filing('0f11e0de-0000-4000-8000-000000000005', 'author');
  EXCEPTION
    WHEN insufficient_privilege THEN got := 'refused';
    WHEN undefined_function     THEN got := 'no single erase';
  END;
  RAISE NOTICE '%|%|%', 'a member may not call the erase', 'refused', got;
END $$;

-- ── the freeze: a withdrawn ballot does not close ─────────────────────────
RESET ROLE;
DO $$
DECLARE got text;
BEGIN
  PERFORM public.freeze_closed_ballots();   -- as the nightly job runs it: the owner

  SELECT CASE WHEN frozen_totals IS NULL THEN 'not frozen' ELSE 'frozen' END INTO got
    FROM public.dispatch_posts WHERE id = '0f11e0de-0000-4000-8000-000000000004';
  RAISE NOTICE '%|%|%', 'a withdrawn ballot past its date', 'not frozen', got;

  SELECT CASE WHEN frozen_totals IS NULL THEN 'not frozen' ELSE 'frozen' END INTO got
    FROM public.dispatch_posts WHERE id = '0f11e0de-0000-4000-8000-000000000007';
  RAISE NOTICE '%|%|%', 'a standing ballot past its date', 'frozen', got;

  -- Every filing ended before today, emptied too (the live rows, not fixtures).
  SELECT count(*)::text INTO got FROM public.dispatch_posts
   WHERE ended_at IS NOT NULL AND id::text NOT LIKE '0f11e0de-%'
     AND (subject_backdrop IS NOT NULL OR source_url IS NOT NULL);
  RAISE NOTICE '%|%|%', 'filings ended before today keep no cover or link', '0', got;
END $$;
ROLLBACK;
