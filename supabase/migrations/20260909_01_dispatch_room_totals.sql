-- ═══════════════════════════════════════════════════════════════════════════
-- A MEMBER'S ROOM — the two numbers at its head.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The room shows what a member has FILED and what the house has CERTIFIED of
-- it. `filed` is a count and PostgREST can do that; `certified` is a SUM across
-- every filing they have, and summing only the page that happens to be on
-- screen would print a number that shrinks as you scroll.
--
-- So both come back in one round trip, from one index scan.
--
-- ── SECURITY INVOKER, DELIBERATELY ──────────────────────────────────────────
-- Not DEFINER. This runs as the CALLER, so every policy on `dispatch_posts`
-- still applies — including `posts_block`, which is what stops a member who has
-- been blocked from learning anything about the blocker by counting their work.
-- A DEFINER function here would have been a quiet way around a restrictive
-- policy, which is precisely the shape of bug this project has found before.
--
-- ── WHAT IT COUNTS ──────────────────────────────────────────────────────────
-- Published, not withheld, not ended. The same three gates the feed uses, so a
-- room can never show a total the page itself would not show — a member whose
-- filing was withheld must not see the count stay high and wonder.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- `dispatch_posts_author` is (user_id, created_at DESC) and already exists, so
-- this is one index scan over one member's rows. No new index is needed and
-- none is created: an index added for a function that runs on a screen nobody
-- has opened yet is an index that only costs writes.

BEGIN;

CREATE OR REPLACE FUNCTION public.dispatch_room_totals(p_user_id uuid)
RETURNS TABLE (filed integer, certified bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT
    COUNT(*)::integer                        AS filed,
    COALESCE(SUM(p.certify_count), 0)::bigint AS certified
  FROM public.dispatch_posts p
  WHERE p.user_id = p_user_id
    AND p.is_published
    AND p.withheld_at IS NULL
    AND p.ended_at IS NULL;
$$;

COMMENT ON FUNCTION public.dispatch_room_totals(uuid) IS
  'The two numbers at the head of a member''s room: how many filings they have '
  'standing, and how many certifications those carry. SECURITY INVOKER so every '
  'policy on dispatch_posts still applies — a blocked member learns nothing.';

-- `anon` too: the Dispatch is a public paper and a signed-out reader can already
-- read every filing this counts. Refusing them the count would hide a number
-- while showing every row it was made from.
GRANT EXECUTE ON FUNCTION public.dispatch_room_totals(uuid) TO authenticated, anon;

COMMIT;

-- ── PROVE IT, AS A REAL CALLER ─────────────────────────────────────────────
-- Run this after. It must return one row, and the numbers must match what the
-- room shows. Replace the uuid with a member who has filed something.
--
--   SELECT * FROM public.dispatch_room_totals('00000000-0000-0000-0000-000000000000');
--
-- And the guarantee that matters — that it is NOT a way around RLS. As a member
-- who has been blocked by the target, this must return 0, not their real count:
--
--   BEGIN;
--   SET LOCAL request.jwt.claims = '{"sub":"<the blocked member''s uuid>","role":"authenticated"}';
--   SET LOCAL ROLE authenticated;
--   SELECT * FROM public.dispatch_room_totals('<the blocker''s uuid>');
--   ROLLBACK;
