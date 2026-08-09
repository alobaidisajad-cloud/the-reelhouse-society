-- ============================================================================
-- BATCH 26 · #24 — the Tribunal's URGENT queue is dead, and it says otherwise
-- ============================================================================
--
-- The shipped app calls this with FOUR parameters:
--     p_limit, p_cursor_count, p_cursor_created, p_cursor_id
-- The deployed function takes TWO (p_limit, p_cursor). Verified live: the app's
-- call returns PGRST202 and PostgREST even hints at the real signature.
--
-- The consumer has no error branch, so the failure renders as
--     "The docket is clear. The house rests."
-- A moderator is told there is nothing urgent when the query never succeeded.
-- A silent failure would be a bug; a confident false all-clear on a moderation
-- queue is worse, and that is what makes this High rather than Low.
--
-- The deployed paging is incoherent regardless of the signature:
--     ORDER BY report_count DESC, r.created_at ASC
--     WHERE ... (p_cursor IS NULL OR r.created_at < p_cursor)
-- It sorts created_at ASCENDING but pages BACKWARDS, and the primary sort key
-- (report_count) is not in the cursor at all — so page 2 returns rows that
-- belong before page 1. The client's compound cursor is the correct design; it
-- was written against a version that was never built.
--
-- ── WHY THIS NEEDED A CTE ───────────────────────────────────────────────────
-- report_count is a WINDOW function, and windows are evaluated AFTER WHERE, so
-- it cannot appear in the cursor predicate. Two things must hold at once:
--
--   1. the count must be computed over ALL pending reports, BEFORE any cursor
--      filter — otherwise it shrinks on later pages and the ordering it drives
--      becomes meaningless;
--   2. the cursor must filter ON that count.
--
-- A CTE satisfies both: compute first, filter outside.
--
-- ── WHY THE PREDICATE IS EXPANDED ───────────────────────────────────────────
-- The sort mixes directions (count DESC, then created_at ASC, id ASC), so a row
-- comparison `(a,b,c) < (x,y,z)` is wrong — that only works when every key sorts
-- the same way. It is expanded explicitly below.
--
-- The `id` tiebreaker makes the ordering TOTAL. That matters more here than
-- anywhere else in this app: without it, two reports sharing a count and a
-- timestamp can straddle a page boundary, and a skipped page is an unreviewed
-- report.
--
-- Server-side only. The already-shipped build starts working the moment this is
-- applied, because it has always sent the right shape to the wrong function.
-- ============================================================================

-- The window partitions by content_id across the pending set; this lets that
-- partition be fed in order instead of sorted from scratch on every page.
CREATE INDEX IF NOT EXISTS idx_reports_pending_content
  ON public.reports (content_id, created_at, id)
  WHERE status = 'pending';

-- Dropped, not left beside the new one. Two overloads that both accept a lone
-- `p_limit` would make that call AMBIGUOUS and fail — so keeping the old one for
-- safety is precisely what would break a caller. After this, a caller sending
-- only `{p_limit}` resolves to the new function and works; the one shape that
-- stops resolving is a caller passing `p_cursor`, which was returning incoherent
-- pages anyway.
DROP FUNCTION IF EXISTS public.get_priority_reports(integer, timestamp with time zone);

CREATE OR REPLACE FUNCTION public.get_priority_reports(
  p_limit          integer     DEFAULT 20,
  p_cursor_count   bigint      DEFAULT NULL,
  p_cursor_created timestamptz DEFAULT NULL,
  p_cursor_id      uuid        DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  content_id uuid,
  content_type text,
  reason text,
  details text,
  reporter_id uuid,
  target_user_id uuid,
  created_at timestamptz,
  report_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Carried over verbatim. This function reads reporter_id and target_user_id
  -- for every pending report; the gate is the only thing standing between that
  -- and any authenticated member.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH scored AS (
    -- No cursor filter here, deliberately. The count must describe the whole
    -- pending set, not the tail of it.
    SELECT
      r.id,
      r.content_id,
      r.content_type,
      r.reason,
      r.details,
      r.reporter_id,
      r.target_user_id,
      r.created_at,
      COUNT(*) OVER (PARTITION BY r.content_id) AS report_count
    FROM reports r
    WHERE r.status = 'pending'
  )
  SELECT
    s.id, s.content_id, s.content_type, s.reason, s.details,
    s.reporter_id, s.target_user_id, s.created_at, s.report_count
  FROM scored s
  WHERE
    p_cursor_count IS NULL
    OR s.report_count < p_cursor_count
    OR (s.report_count = p_cursor_count AND s.created_at > p_cursor_created)
    OR (s.report_count = p_cursor_count AND s.created_at = p_cursor_created
        AND s.id > p_cursor_id)
  ORDER BY s.report_count DESC, s.created_at ASC, s.id ASC
  -- Bounded. The old signature took p_limit unclamped, so one careless caller
  -- could ask for the entire pending table in a single response.
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
END;
$function$;

COMMENT ON FUNCTION public.get_priority_reports(integer, bigint, timestamptz, uuid) IS
  'Pending reports in true triage order: most-reported content first, oldest first within a tie. Compound keyset (report_count, created_at, id) so no page can skip or duplicate a case. Admin only.';

-- Restated rather than inherited, so a database rebuilt from these migrations
-- alone ends up identical to production. The admin check lives INSIDE the
-- function; `authenticated` is the reachable role, not the authorised one.
REVOKE EXECUTE ON FUNCTION public.get_priority_reports(integer, bigint, timestamptz, uuid) FROM PUBLIC;
-- Guarded the way 20260807_02 guards its own grants, so this file also applies
-- cleanly to a database built from migrations alone, where the Supabase roles
-- may not exist yet.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_priority_reports(integer, bigint, timestamptz, uuid) TO authenticated';
  END IF;
END $$;

-- ============================================================================
-- VERIFY (read-only). Run as an admin account.
-- ============================================================================
-- 1 · the signature the app actually sends now resolves:
--     SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname='public' AND p.proname='get_priority_reports';
--     -- expect exactly ONE row, with (integer, bigint, timestamp with time zone, uuid)
--
-- 2 · page 1, and the ordering is true triage order:
--     SELECT id, content_id, created_at, report_count
--       FROM public.get_priority_reports(5) ORDER BY report_count DESC, created_at ASC;
--
-- 3 · page 2 continues rather than repeating — take the LAST row of page 1 and
--     feed it back; no id from page 1 may appear:
--     SELECT id, report_count, created_at
--       FROM public.get_priority_reports(5, <count>, '<created_at>', '<id>');
