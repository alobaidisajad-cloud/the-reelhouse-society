-- ═══════════════════════════════════════════════════════════════════════
-- Fix: replace_list_items referenced a non-existent `position` column
-- ═══════════════════════════════════════════════════════════════════════
-- The list_items ordering column is `rank_position` (see _schema_baseline.sql
-- and every read path in the app). The replace_list_items RPC — created in
-- replace_list_items_rpc.sql and security-hardened in
-- 20260609_security_definer_hardening.sql — still inserted into a `position`
-- column that does not exist, so it would raise 42703 (undefined_column) if
-- ever called.
--
-- The function is NOT dead code: it is an auth.uid()-gated, ownership-checked
-- atomic list-replace, intended to fix the client's delete->insert data-loss
-- window. It is simply not yet wired up on the client (which does direct
-- writes, now correctly using rank_position). This migration disarms the
-- latent bug so the function is correct the day it gets wired up.
--
-- Idempotent: CREATE OR REPLACE, same 2-arg signature as the hardened version.
-- No effect on the mobile app build (server-side only, currently uncalled).
--
-- NOTE: both the old 3-arg (UUID, UUID, JSONB) and the 2-arg (UUID, JSONB)
-- overloads currently coexist in the DB, so the function name is ambiguous.
-- Drop the stale 3-arg overload first, then a COMMENT can target the 2-arg one.
-- ═══════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.replace_list_items(UUID, UUID, JSONB);

CREATE OR REPLACE FUNCTION public.replace_list_items(
  p_list_id UUID,
  p_items JSONB DEFAULT '[]'::JSONB
) RETURNS VOID AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Verify ownership (defense-in-depth beyond RLS)
  IF NOT EXISTS (SELECT 1 FROM lists WHERE id = p_list_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: list does not belong to user'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  -- Atomic delete + insert in a single transaction
  DELETE FROM list_items WHERE list_id = p_list_id;

  -- Only insert if there are items to add. Column is rank_position (not position);
  -- the JSON key is read as rank_position to match the client's list_items shape.
  IF jsonb_array_length(p_items) > 0 THEN
    INSERT INTO list_items (list_id, film_id, film_title, poster_path, rank_position)
    SELECT
      p_list_id,
      (item->>'film_id')::INT,
      COALESCE(item->>'film_title', 'Unknown'),
      item->>'poster_path',
      (item->>'rank_position')::INT
    FROM jsonb_array_elements(p_items) AS item;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.replace_list_items(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.replace_list_items(UUID, JSONB) IS
  'Atomically replaces all films in a list (auth.uid()-gated, ownership-checked). Uses rank_position. Prevents the delete->insert data-loss window during list edits.';
