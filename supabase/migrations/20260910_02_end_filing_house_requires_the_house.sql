-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY — `end_filing(post, 'house')` asked nobody's permission.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The function as it stood:
--
--     IF p_by NOT IN ('author','house') THEN RAISE EXCEPTION 'bad ended_by'; END IF;
--     IF p_by = 'author' AND NOT EXISTS (
--          SELECT 1 FROM dispatch_posts WHERE id = p_post AND user_id = auth.uid())
--     THEN RAISE EXCEPTION 'not yours'; END IF;
--     UPDATE dispatch_posts SET body='', full_content=NULL, title=NULL, … ;
--
-- The ownership check guards ONE of the two branches. Called with 'house' it
-- checks nothing at all — and the function is SECURITY DEFINER, so it runs with
-- the owner's rights and every policy on dispatch_posts is bypassed. It was also
-- GRANTed to `anon`.
--
-- So anybody holding the anon key — which ships inside the app — could erase the
-- body, the title, the essay and the source of ANY filing in the Dispatch, and
-- the row would be left saying the HOUSE had removed it. Signed in or not.
--
-- ── AND NOTHING WAS USING IT ───────────────────────────────────────────────
-- The app calls `end_filing` only with 'author', when a member withdraws their
-- own filing. The Tribunal never calls it: `resolve_moderation_report_v2` runs
-- `DELETE FROM dispatch_posts`, and the `no_hard_delete` trigger turns that into
-- the same soft end with `ended_by = 'house'`. The whole 'house' branch was a
-- door nobody used and nobody had locked.
--
-- ── THE FIX ────────────────────────────────────────────────────────────────
-- Each branch now proves its own right: the author proves ownership, and the
-- house proves it is the house — `role = 'admin'`, the same predicate
-- `resolve_moderation_report_v2` uses. The grant to `anon` goes: there is no
-- such thing as an anonymous withdrawal.
--
-- The signature is UNCHANGED — `(p_post uuid, p_by text)`. Replacing a function
-- with a different signature leaves the old one in place beside the new, which
-- in this case would leave the hole open under the same name.

BEGIN;

CREATE OR REPLACE FUNCTION public.end_filing(p_post uuid, p_by text) RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
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

  UPDATE public.dispatch_posts
     SET body = '', full_content = NULL, title = NULL, subject_image = NULL, source = NULL,
         spoiler_label = NULL, ended_at = now(), ended_by = p_by
   WHERE id = p_post AND ended_at IS NULL;
END $$;

COMMENT ON FUNCTION public.end_filing(uuid, text) IS
  'Withdraw a filing. Each branch proves its own right: the author proves '
  'ownership, the house proves role = admin. Before 2026-09-10 the house branch '
  'proved nothing and was granted to anon, so any caller could erase any filing.';

-- ── REVOKING FROM `anon` IS NOT ENOUGH, AND SAYING SO COSTS ONE LINE ───────
-- Postgres grants EXECUTE on every new function to PUBLIC, and `anon` is a
-- member of PUBLIC. Applied as `REVOKE … FROM anon` alone this landed, reported
-- success, and `has_function_privilege('anon', …, 'EXECUTE')` still came back
-- TRUE — the explicit grant was gone and the PUBLIC one was still there. The
-- ACL said it plainly: `{=X/postgres, …}`, where the empty grantee before `=`
-- IS public.
--
-- This is the same shape as the policy audit that found `{public}` on a role
-- list means anon too. A revoke that names one role and leaves PUBLIC standing
-- is a revoke that changes nothing.
REVOKE ALL ON FUNCTION public.end_filing(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.end_filing(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.end_filing(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_filing(uuid, text) TO service_role;

COMMIT;

-- ── PROVE IT ───────────────────────────────────────────────────────────────
-- These must all hold. The first is the hole, and it must now be refused.
--
--   -- 1. A member who is not the author and not an admin, as the house:
--   BEGIN;
--   SET LOCAL request.jwt.claims = '{"sub":"<any ordinary member>","role":"authenticated"}';
--   SET LOCAL ROLE authenticated;
--   SELECT public.end_filing('<somebody else''s filing>', 'house');   -- expect: not the house
--   ROLLBACK;
--
--   -- 2. Anonymous, as the house:
--   BEGIN;
--   SET LOCAL ROLE anon;
--   SELECT public.end_filing('<any filing>', 'house');                -- expect: permission denied
--   ROLLBACK;
--
--   -- 3. The author withdrawing their own filing still works:
--   BEGIN;
--   SET LOCAL request.jwt.claims = '{"sub":"<the author>","role":"authenticated"}';
--   SET LOCAL ROLE authenticated;
--   SELECT public.end_filing('<their own filing>', 'author');         -- expect: success
--   SELECT ended_by, ended_at IS NOT NULL FROM public.dispatch_posts WHERE id = '<their own filing>';
--   ROLLBACK;
