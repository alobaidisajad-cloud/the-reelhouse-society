-- ═══════════════════════════════════════════════════════════════════════════════
-- get_featured_critique — never feature a log the viewer can't open
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
--
-- The RPC is SECURITY DEFINER, so it bypasses RLS and could surface a log authored
-- by a PRIVATE account. The card rendered fine, but tapping it hit the RLS-gated
-- log detail (can_view_user_data) which returns nothing for a non-follower →
-- "Log not found" dead end. Since the Lead Story is shown to everyone, we exclude
-- private authors entirely so a featured critique is always publicly openable.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_featured_critique()
RETURNS SETOF public.logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT l.*
  FROM public.logs l
  JOIN public.profiles p ON p.id = l.user_id
  WHERE l.review IS NOT NULL
    AND l.review != ''
    AND LENGTH(l.review) > 100
    AND l.rating >= 4
    AND COALESCE(p.is_social_private, false) = false   -- public authors only
  ORDER BY l.created_at DESC
  LIMIT 1;
END;
$$;

-- ── Verify (run after) ─────────────────────────────────────────────────────────
--   SELECT id, user_id FROM public.get_featured_critique();
--   -- then confirm that user_id's profile has is_social_private = false
