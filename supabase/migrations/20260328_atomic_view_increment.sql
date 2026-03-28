-- ============================================================
-- ATOMIC VIDEO VIEW INCREMENT
-- Eliminates race condition from read-then-write pattern.
-- Called from video.ts via supabase.rpc('increment_video_views')
-- ============================================================

CREATE OR REPLACE FUNCTION increment_video_views(p_video_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
    UPDATE video_reviews
    SET views = COALESCE(views, 0) + 1
    WHERE id = p_video_id;
$$;

-- Grant access to authenticated users only
GRANT EXECUTE ON FUNCTION increment_video_views(UUID) TO authenticated;
