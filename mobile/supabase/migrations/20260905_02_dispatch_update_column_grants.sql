-- ═══════════════════════════════════════════════════════════════════════════
-- AN AUTHOR COULD REWRITE ANY COLUMN ON THEIR OWN ROW
--
-- Found 2026-09-05 while checking whether it was safe to offer an AMEND act.
-- It is not, yet — and the holes are already open, because the grants exist
-- whether or not the app has a button. Anyone with the app key and a session
-- can do all of this today with one request.
--
-- ⚠️ RLS IS ROW-LEVEL. IT NEVER SAYS WHICH COLUMNS.
-- `posts_update_own` and `critiques_update_own` are USING (user_id =
-- auth.uid()) — which row, never which field. With a table-wide UPDATE grant
-- behind them, "you may edit your own filing" means "you may rewrite every
-- column of your own filing".
--
-- Proved as the real author, in rolled-back transactions, each with a control
-- that had to pass first:
--
--   certify_count  -> 99999      a member tops the CERTIFIED ordering at will
--   created_at     -> 2036       a filing pinned to the head of LATEST for ten
--                                years
--   critique certify_count -> 4242
--   critique created_at    -> 2031
--   critique post_id       -> somebody else's filing
--
-- That last one is the worst: a member can take their own critique and attach
-- it under any other member's filing.
--
-- ── AND EDITING REACHED THINGS IT SHOULD NOT ───────────────────────────────
-- The same probe found an author could edit a filing that is WITHHELD — under
-- Tribunal review — swapping the evidence while the house is looking at it, and
-- could put words back into one the house had already ENDED.
--
-- ── THE FIX ────────────────────────────────────────────────────────────────
-- Column grants, which Postgres enforces itself, listing exactly what the app
-- writes and nothing else:
--
--   dispatch_posts     title, body, full_content, source, source_url,
--                      spoiler_label, series_title, answer_id,
--                      edited_at, updated_at
--   dispatch_comments  body, edited_at
--
-- taken from `toUpdateRow`, `takeAnswer`, `amendCritique` and the offline
-- queue's replay of each. Anything outside that list is now refused by the
-- database rather than by nobody.
--
-- Triggers and SECURITY DEFINER functions are unaffected: they run as the table
-- owner, and column grants do not apply to them. `end_filing` still ends,
-- `freeze_closed_ballots` still counts, the Tribunal still withholds.
--
-- anon's UPDATE and DELETE are revoked outright. RLS already gave anon no
-- policy on either table, so nothing could use them — but a grant nobody can
-- reach is one policy mistake away from a grant anybody can.
--
-- ── SAFE TO RUN TWICE ──────────────────────────────────────────────────────
-- REVOKE and GRANT are idempotent; ALTER POLICY restates the whole rule. Dry-
-- run against production twice inside one rolled-back transaction. The whole
-- thing is one transaction with post-conditions that RAISE, so it cannot
-- half-apply and cannot report success while doing nothing.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── PRE-FLIGHT ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='dispatch_posts' AND policyname='posts_update_own') THEN
    RAISE EXCEPTION 'policy posts_update_own is missing — nothing to alter';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='dispatch_comments' AND policyname='critiques_update_own') THEN
    RAISE EXCEPTION 'policy critiques_update_own is missing — nothing to alter';
  END IF;
END $$;

-- ── ONE: WHICH COLUMNS ─────────────────────────────────────────────────────
REVOKE UPDATE ON public.dispatch_posts    FROM authenticated, anon;
REVOKE UPDATE ON public.dispatch_comments FROM authenticated, anon;
REVOKE DELETE ON public.dispatch_posts    FROM anon;
REVOKE DELETE ON public.dispatch_comments FROM anon;
REVOKE INSERT ON public.dispatch_posts    FROM anon;
REVOKE INSERT ON public.dispatch_comments FROM anon;

GRANT UPDATE (
  title, body, full_content, source, source_url,
  spoiler_label, series_title, answer_id, edited_at, updated_at
) ON public.dispatch_posts TO authenticated;

GRANT UPDATE (body, edited_at) ON public.dispatch_comments TO authenticated;

-- ── TWO: WHICH ROWS ────────────────────────────────────────────────────────
-- ALTER, never DROP + CREATE: a dropped policy leaves the table open for the
-- moment between the two statements.
--
-- A filing under review or already ended is not the author's to change. The
-- Tribunal sets `withheld_at`; `end_filing` sets `ended_at`. Both run as the
-- owner and are unaffected by this.
ALTER POLICY posts_update_own ON public.dispatch_posts
  TO authenticated
  USING (user_id = auth.uid() AND withheld_at IS NULL AND ended_at IS NULL)
  WITH CHECK (user_id = auth.uid());

-- A critique under a filing that has been withheld or ended is in the same
-- position: the argument is closed and its words are part of the record.
ALTER POLICY critiques_update_own ON public.dispatch_comments
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.dispatch_posts p
       WHERE p.id = dispatch_comments.post_id
         AND p.withheld_at IS NULL
         AND p.ended_at IS NULL
    )
  )
  WITH CHECK (user_id = auth.uid());

-- ── POST-CONDITIONS ────────────────────────────────────────────────────────
DO $$
DECLARE v_cols text; v_using text; n integer;
BEGIN
  -- No table-wide UPDATE left on either table, for either role.
  SELECT count(*) INTO n
    FROM information_schema.role_table_grants
   WHERE table_schema='public' AND privilege_type='UPDATE'
     AND table_name IN ('dispatch_posts','dispatch_comments')
     AND grantee IN ('anon','authenticated');
  IF n > 0 THEN
    RAISE EXCEPTION 'a table-wide UPDATE grant survives (% rows)', n;
  END IF;

  -- The counts and the clock are no longer writable by a member.
  SELECT string_agg(column_name, ',' ORDER BY column_name) INTO v_cols
    FROM information_schema.column_privileges
   WHERE table_schema='public' AND table_name='dispatch_posts'
     AND grantee='authenticated' AND privilege_type='UPDATE'
     AND column_name IN ('certify_count','comment_count','created_at','user_id','kind',
                         'is_published','withheld_at','ended_at','ended_by');
  IF v_cols IS NOT NULL THEN
    RAISE EXCEPTION 'a member can still write: %', v_cols;
  END IF;

  SELECT string_agg(column_name, ',' ORDER BY column_name) INTO v_cols
    FROM information_schema.column_privileges
   WHERE table_schema='public' AND table_name='dispatch_comments'
     AND grantee='authenticated' AND privilege_type='UPDATE'
     AND column_name IN ('certify_count','created_at','user_id','post_id');
  IF v_cols IS NOT NULL THEN
    RAISE EXCEPTION 'a member can still write on a critique: %', v_cols;
  END IF;

  -- And what the app DOES need is still granted.
  SELECT count(*) INTO n
    FROM information_schema.column_privileges
   WHERE table_schema='public' AND table_name='dispatch_posts'
     AND grantee='authenticated' AND privilege_type='UPDATE'
     AND column_name IN ('title','body','full_content','source','source_url',
                         'spoiler_label','series_title','answer_id','edited_at','updated_at');
  IF n <> 10 THEN
    RAISE EXCEPTION 'the ten columns amend and takeAnswer write are not all granted (got %)', n;
  END IF;

  SELECT count(*) INTO n
    FROM information_schema.column_privileges
   WHERE table_schema='public' AND table_name='dispatch_comments'
     AND grantee='authenticated' AND privilege_type='UPDATE'
     AND column_name IN ('body','edited_at');
  IF n <> 2 THEN
    RAISE EXCEPTION 'a critique cannot be amended any more (got % of 2 columns)', n;
  END IF;

  -- The rows a member may touch.
  SELECT qual INTO v_using FROM pg_policies
   WHERE schemaname='public' AND tablename='dispatch_posts' AND policyname='posts_update_own';
  IF v_using NOT LIKE '%withheld_at IS NULL%' OR v_using NOT LIKE '%ended_at IS NULL%' THEN
    RAISE EXCEPTION 'posts_update_own still reaches withheld or ended filings: %', v_using;
  END IF;

  SELECT qual INTO v_using FROM pg_policies
   WHERE schemaname='public' AND tablename='dispatch_comments' AND policyname='critiques_update_own';
  IF v_using NOT LIKE '%withheld_at IS NULL%' OR v_using NOT LIKE '%ended_at IS NULL%' THEN
    RAISE EXCEPTION 'critiques_update_own still reaches critiques under a closed filing: %', v_using;
  END IF;

  RAISE NOTICE 'update narrowed to the columns the app writes, on live filings only';
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROOF, after committing. Expected results beside each.
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. No table-wide UPDATE survives:
--      SELECT table_name, grantee FROM information_schema.role_table_grants
--       WHERE table_schema='public' AND privilege_type='UPDATE'
--         AND table_name LIKE 'dispatch_%' AND grantee IN ('anon','authenticated');
--      -> 0 rows
--
-- 2. A member cannot inflate a count. As a real session, or:
--      BEGIN;
--      SET LOCAL ROLE authenticated;
--      SET LOCAL request.jwt.claims = '{"sub":"<their id>","role":"authenticated"}';
--      UPDATE dispatch_posts SET certify_count = 99999 WHERE user_id = auth.uid();
--      ROLLBACK;
--      -> ERROR: permission denied for table dispatch_posts
--
-- 3. Amending still works — same block, but:
--      UPDATE dispatch_posts SET body = 'Amended.', edited_at = now() WHERE user_id = auth.uid();
--      -> UPDATE n
