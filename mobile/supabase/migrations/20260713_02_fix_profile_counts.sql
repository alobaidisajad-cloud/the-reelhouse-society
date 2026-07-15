-- ─────────────────────────────────────────────────────────────────────────────
-- 20260713_02_fix_profile_counts
--
-- get_profile_counts v3 — the number on the door must equal the rows in the room.
--
-- TWO REAL-COUNT BUGS FIXED (found via a live report: a member with 77 ledger
-- entries saw "134" on the LEDGER card — her total log count):
--
--   1. ledger_count used `review IS NOT NULL` — but the app ALWAYS writes
--      review = '' (empty string, never NULL; see logOperations.ts), so the
--      predicate matched EVERY log. Now: rating > 0 OR a NON-EMPTY review —
--      verbatim the ledger tab's own filter (rating.gt.0,review.neq."").
--
--   2. lists_count counted only is_private = false, even for the OWNER viewing
--      their own profile — private stacks vanished from their STACKS card.
--      Now the owner counts all their stacks; other viewers still get
--      public-only (matching the RLS from 20260710_01).
--
-- Attributes mirror the deployed function (20260709_01): LANGUAGE sql, STABLE,
-- SECURITY DEFINER, search_path pinned. CREATE OR REPLACE preserves grants.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_profile_counts(p_user_id uuid)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'logs_count',      (SELECT COUNT(*) FROM logs       WHERE user_id = p_user_id),
    'ledger_count',    (SELECT COUNT(*) FROM logs       WHERE user_id = p_user_id
                          AND (rating > 0 OR COALESCE(review, '') <> '')),
    'watchlist_count', (SELECT COUNT(*) FROM watchlists WHERE user_id = p_user_id),
    'vault_count',     (SELECT COUNT(*) FROM physical_archive WHERE user_id = p_user_id),
    'lists_count',     (SELECT COUNT(*) FROM lists      WHERE user_id = p_user_id
                          AND (is_private = false OR user_id = auth.uid())),
    'followers_count', (SELECT COUNT(*) FROM interactions WHERE target_user_id = p_user_id AND type = 'follow'),
    'following_count', (SELECT COUNT(*) FROM interactions WHERE user_id = p_user_id AND type = 'follow')
  );
$$;
