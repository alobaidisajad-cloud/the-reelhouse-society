-- ═══════════════════════════════════════════════════════════════════════════════
-- get_profile_counts — fix key mismatch + add live follower/following counts
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
--
-- Two problems this fixes:
--   1. The deployed function returns keys { logs, ledger, watchlist, vault, lists }
--      but the client (ProfileDataService.fetchCounts) reads `result.logs_count`.
--      The `typeof result.logs_count === 'number'` guard therefore always failed,
--      so the client silently fell back to 5 direct RLS-gated COUNT queries. For a
--      PRIVATE profile you don't follow, those RLS-gated counts return 0 — which is
--      why a private member's profile read "0 films" despite having a full archive.
--      Returning the *_count keys activates the SECURITY DEFINER path, which is
--      privacy-safe (aggregate counts only, never row data) and returns real numbers.
--   2. followers_count / following_count are added as LIVE COUNT(*) over the approved
--      follow graph, so the profile stat bar can display truth instead of the
--      denormalized profiles.followers_count column (which drifts — it has three
--      separate maintainers: an INSERT/DELETE trigger, accept_follow_request, and
--      handle_privacy_switch). Only type='follow' is counted — pending
--      'follow_request' rows are excluded.
--
-- SECURITY DEFINER + SET search_path pinned (hardening): the function only ever
-- emits aggregate counts, so bypassing RLS for the count is safe and intended.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_profile_counts(p_user_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'logs_count',      (SELECT COUNT(*) FROM logs       WHERE user_id = p_user_id),
    'ledger_count',    (SELECT COUNT(*) FROM logs       WHERE user_id = p_user_id AND (rating > 0 OR review IS NOT NULL)),
    'watchlist_count', (SELECT COUNT(*) FROM watchlists WHERE user_id = p_user_id),
    'vault_count',     (SELECT COUNT(*) FROM physical_archive WHERE user_id = p_user_id),
    'lists_count',     (SELECT COUNT(*) FROM lists      WHERE user_id = p_user_id AND is_private = false),
    'followers_count', (SELECT COUNT(*) FROM interactions WHERE target_user_id = p_user_id AND type = 'follow'),
    'following_count', (SELECT COUNT(*) FROM interactions WHERE user_id = p_user_id AND type = 'follow')
  );
$$;

-- ── Verify (run after) ─────────────────────────────────────────────────────────
-- Expect all seven *_count keys, with followers_count/following_count present:
--   SELECT public.get_profile_counts('<some-user-uuid>'::uuid);
