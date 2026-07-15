-- ─────────────────────────────────────────────────────────────────────────────
-- 20260713_01_set_lounge_cover
--
-- Adds the host-only set_lounge_cover(uuid, text) RPC — the missing write path
-- for salon covers. The lounges table already has a cover_image column and the
-- salon cards (JoinedLoungeCard / PublicLoungeCard) already RENDER it; there was
-- simply no way to SET one (create_lounge takes name/desc/private only, and no
-- edit path existed). This closes that last mile without touching create_lounge.
--
-- SECURITY: SECURITY DEFINER, host-gated — auth.uid() must equal the salon's
-- creator_id (verified as the host identity in the client). SET search_path
-- blocks hijacking. The cover is a TMDB backdrop PATH (e.g. /abc123.jpg), so it
-- is regex-validated; NULL is allowed = remove the cover (back to the gradient).
-- EXECUTE revoked from anon/PUBLIC, granted to authenticated (self-guards inside).
-- Idempotent (CREATE OR REPLACE) — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_lounge_cover(p_lounge_id uuid, p_cover_image text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Host-only: must be the salon's creator.
  IF NOT EXISTS (SELECT 1 FROM lounges WHERE id = p_lounge_id AND creator_id = v_uid) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Allow NULL (remove cover) or a TMDB-style path; reject anything else.
  IF p_cover_image IS NOT NULL AND p_cover_image !~ '^/[A-Za-z0-9._-]+$' THEN
    RAISE EXCEPTION 'Invalid cover path';
  END IF;

  UPDATE lounges SET cover_image = p_cover_image WHERE id = p_lounge_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_lounge_cover(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_lounge_cover(uuid, text) TO authenticated;
