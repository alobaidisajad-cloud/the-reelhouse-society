-- ═══════════════════════════════════════════════════════════════════════════
-- AN AUTHOR COULD REWRITE ANY COLUMN ON THEIR OWN ROW
--
-- Found 2026-09-05 while checking whether the database was ready for an AMEND
-- act. It was not — and the holes are already open, because they do not need a
-- button. Anyone with the app key and a session can do all of this today in one
-- request.
--
-- ⚠️ RLS IS ROW-LEVEL. IT NEVER SAYS WHICH COLUMNS.
-- `posts_update_own` and `critiques_update_own` are USING (user_id =
-- auth.uid()) — which ROW, and nothing else. "You may edit your own filing"
-- therefore means "you may rewrite every column of your own filing".
--
-- Proved as the real author, in rolled-back transactions, each with a control
-- that had to pass first:
--
--   certify_count           -> 99999   tops the CERTIFIED ordering at will
--   created_at              -> 2036    pinned to the head of LATEST for a decade
--   critique certify_count  -> 4242
--   critique created_at     -> 2031
--   critique post_id        -> somebody else's filing
--
-- That last one is the worst: a member can take their own critique and attach
-- it under any other member's filing. And an author could edit a filing that is
-- WITHHELD — swapping the evidence while the Tribunal reads it — or put words
-- back into one already ENDED.
--
-- ── WHY THIS IS A TRIGGER AND NOT COLUMN GRANTS ────────────────────────────
-- The first version of this migration used `REVOKE UPDATE` plus `GRANT UPDATE
-- (…columns…)`. It is the tidier tool and it BROKE THE APP TWICE, both caught
-- by testing it rather than reasoning about it:
--
--   1. CERTIFYING STOPPED WORKING. `dispatch_count_cert` does
--      `UPDATE dispatch_posts SET certify_count = certify_count + 1` and is not
--      SECURITY DEFINER, so it runs as the member who certified — straight into
--      the revoked column. `permission denied for table dispatch_posts`, from
--      inside the trigger. Same for `dispatch_count_comment` on every critique.
--
--   2. THE WEB APP'S DOSSIER EDITING STOPPED WORKING. `dispatch_dossiers` is a
--      legacy VIEW with an INSTEAD OF trigger, and the live web app writes
--      through it (`content.ts` update, `DossierCritiquePanel` update). That
--      trigger sets `is_published`, `user_id` and `author_username` — three
--      columns that must NOT be granted to a member. An earlier check asked
--      whether the web app references `dispatch_posts`; it does not. It
--      references the view.
--
-- A BEFORE UPDATE trigger fits this database's shape instead: it pins the
-- protected columns to their old values whichever path the write arrives
-- through — direct, or through a legacy view — and needs no grant changes at
-- all, so nothing that works today stops working.
--
-- ── WHAT IS DELIBERATELY NOT PINNED ────────────────────────────────────────
--   user_id          the legacy erasure path sets it to NULL on purpose, and
--                    RLS already blocks theft: `posts_update_own`'s WITH CHECK
--                    refuses a row whose user_id is not the caller's.
--   is_published     a draft/publish toggle the web app legitimately makes.
--   author_username  derived by `trg_derive_username` from `profiles` anyway.
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
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='dispatch_count_cert') THEN
    RAISE EXCEPTION 'dispatch_count_cert is missing — this database is not the one this was written for';
  END IF;
END $$;

-- ── ONE: THE COUNTERS BECOME THE OWNER'S WORK, NOT THE MEMBER'S ────────────
-- A count maintained by a trigger should never depend on the member holding
-- write access to the count. Both already pin `search_path` to public, pg_temp,
-- which is what makes turning them into definers safe rather than a
-- privilege-escalation vector.
ALTER FUNCTION public.dispatch_count_cert()    SECURITY DEFINER;
ALTER FUNCTION public.dispatch_count_comment() SECURITY DEFINER;

-- ── TWO: THE COLUMNS A MEMBER NEVER WRITES ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_posts_pin_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- The house's own machinery — the counters, `end_filing`, the Tribunal, the
  -- ballot freeze — all run as the table owner. Everything else is a member.
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Counts belong to the members who made them, not to the author.
  NEW.certify_count := OLD.certify_count;
  NEW.comment_count := OLD.comment_count;
  -- When it was filed is what orders the paper.
  NEW.created_at    := OLD.created_at;
  -- The kind is gated at INSERT by tier; changing it afterwards walks around
  -- that gate, so a take cannot quietly become a dossier.
  NEW.kind          := OLD.kind;
  -- Under review, or struck. Only the house moves these.
  NEW.withheld_at   := OLD.withheld_at;
  NEW.ended_at      := OLD.ended_at;
  NEW.ended_by      := OLD.ended_by;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.dispatch_comments_pin_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  NEW.certify_count := OLD.certify_count;
  NEW.created_at    := OLD.created_at;
  -- A critique belongs to the filing it was written under. Moving it puts a
  -- member's words beneath somebody else's writing.
  NEW.post_id       := OLD.post_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pin_columns ON public.dispatch_posts;
CREATE TRIGGER pin_columns
  BEFORE UPDATE ON public.dispatch_posts
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_posts_pin_columns();

DROP TRIGGER IF EXISTS pin_columns ON public.dispatch_comments;
CREATE TRIGGER pin_columns
  BEFORE UPDATE ON public.dispatch_comments
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_comments_pin_columns();

-- ── THREE: THE ROWS A MEMBER MAY TOUCH ─────────────────────────────────────
-- ALTER, never DROP + CREATE: a dropped policy leaves the table open for the
-- moment between the two statements.
--
-- A filing under review or already ended is not the author's to change. The
-- Tribunal sets `withheld_at`; `end_filing` sets `ended_at`. Both run as the
-- owner and are unaffected.
ALTER POLICY posts_update_own ON public.dispatch_posts
  TO authenticated
  USING (user_id = auth.uid() AND withheld_at IS NULL AND ended_at IS NULL)
  WITH CHECK (user_id = auth.uid());

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

-- ── FOUR: WHAT anon HOLDS AND CANNOT USE ───────────────────────────────────
-- RLS gives anon no policy on either table, so nothing could reach these — but
-- a grant nobody can use is one policy mistake away from a grant anybody can.
REVOKE UPDATE, INSERT, DELETE ON public.dispatch_posts    FROM anon;
REVOKE UPDATE, INSERT, DELETE ON public.dispatch_comments FROM anon;

-- ── POST-CONDITIONS ────────────────────────────────────────────────────────
DO $$
DECLARE v_using text; n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE t.tgname = 'pin_columns'
     AND c.relname IN ('dispatch_posts','dispatch_comments') AND NOT t.tgisinternal;
  IF n <> 2 THEN RAISE EXCEPTION 'the pinning triggers are not both attached (found %)', n; END IF;

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public' AND p.prosecdef
     AND p.proname IN ('dispatch_count_cert','dispatch_count_comment');
  IF n <> 2 THEN RAISE EXCEPTION 'the count triggers are not both SECURITY DEFINER (found %)', n; END IF;

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public' AND p.proname IN ('dispatch_count_cert','dispatch_count_comment')
     AND array_to_string(p.proconfig, ',') LIKE '%search_path=public, pg_temp%';
  IF n <> 2 THEN RAISE EXCEPTION 'a definer without a pinned search_path is an escalation vector'; END IF;

  SELECT qual INTO v_using FROM pg_policies
   WHERE schemaname='public' AND tablename='dispatch_posts' AND policyname='posts_update_own';
  IF v_using NOT LIKE '%withheld_at IS NULL%' OR v_using NOT LIKE '%ended_at IS NULL%' THEN
    RAISE EXCEPTION 'posts_update_own still reaches withheld or ended filings: %', v_using;
  END IF;

  SELECT qual INTO v_using FROM pg_policies
   WHERE schemaname='public' AND tablename='dispatch_comments' AND policyname='critiques_update_own';
  IF v_using NOT LIKE '%withheld_at IS NULL%' THEN
    RAISE EXCEPTION 'critiques_update_own still reaches critiques under a closed filing: %', v_using;
  END IF;

  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema='public' AND grantee='anon'
     AND table_name IN ('dispatch_posts','dispatch_comments')
     AND privilege_type IN ('UPDATE','INSERT','DELETE');
  IF n > 0 THEN RAISE EXCEPTION 'anon still holds % write grant(s)', n; END IF;

  RAISE NOTICE 'counts are the house''s, the protected columns are pinned, and a closed filing is closed';
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROOF, after committing.
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Certifying still counts. As a real member, certify something and watch
--    `dispatch_posts.certify_count` rise by one.
--
-- 2. A member cannot inflate it:
--      BEGIN;
--      SET LOCAL ROLE authenticated;
--      SET LOCAL request.jwt.claims = '{"sub":"<their id>","role":"authenticated"}';
--      UPDATE dispatch_posts SET certify_count = 99999 WHERE user_id = auth.uid();
--      SELECT certify_count FROM dispatch_posts WHERE user_id = auth.uid();
--      ROLLBACK;
--      -> unchanged. The UPDATE reports success and does nothing, which is the
--         point: there is nothing for a vandal to retry.
--
-- 3. Amending still works — same block, but:
--      UPDATE dispatch_posts SET body = 'Amended.', edited_at = now() WHERE user_id = auth.uid();
--      -> the body changes.
