-- ════════════════════════════════════════════════════════════════════════
-- get_profile_counts RPC
-- ════════════════════════════════════════════════════════════════════════
-- PERF: ProfileDataService.fetchCounts() already tries this RPC (L127-130)
-- and falls back to 5 separate HEAD queries when it doesn't exist.
-- This migration deploys the function so the fallback path is never hit.
--
-- Returns a JSON object with all 5 tab counts in a single round-trip:
--   { logs, ledger, watchlist, vault, lists }
--
-- The ledger count mirrors the fallback logic at ProfileDataService.ts L155:
--   .or('rating.gt.0,review.neq.null')
--
-- SECURITY DEFINER: Runs with the function owner's permissions so RLS
-- on each table is bypassed for count-only access. This is safe because
-- we only return aggregate counts, never row data.
--
-- STABLE: Tells the query planner this function has no side effects and
-- returns the same result for the same inputs within a single statement.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_profile_counts(p_user_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'logs',      (SELECT COUNT(*) FROM logs WHERE user_id = p_user_id),
    'ledger',    (SELECT COUNT(*) FROM logs WHERE user_id = p_user_id AND (rating > 0 OR review IS NOT NULL)),
    'watchlist', (SELECT COUNT(*) FROM watchlists WHERE user_id = p_user_id),
    'vault',     (SELECT COUNT(*) FROM physical_archive WHERE user_id = p_user_id),
    'lists',     (SELECT COUNT(*) FROM lists WHERE user_id = p_user_id AND is_private = false)
  );
$$;
