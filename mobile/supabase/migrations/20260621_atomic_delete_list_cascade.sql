-- ═══════════════════════════════════════════════════════════════════════════════
-- SECURITY FIX: Atomic list deletion cascade
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Problem: The mobile client performs list deletion as 4 sequential HTTP calls:
--   1. DELETE list_items WHERE list_id = X
--   2. DELETE list_comments WHERE list_id = X
--   3. DELETE interactions WHERE target_list_id = X
--   4. DELETE lists WHERE id = X AND user_id = auth.uid()
--
-- If the network drops between steps, partial cascades leave orphaned state.
-- The offline queue eventually heals this, but during the window (up to 24h),
-- the list appears empty without its items.
--
-- Fix: Single RPC call = single PostgreSQL transaction = fully atomic.
-- Either ALL deletes succeed or NONE do. No partial state possible.
--
-- Security: Uses auth.uid() (not a client-supplied user_id parameter) to
-- prevent IDOR attacks. SECURITY DEFINER bypasses per-table RLS so the
-- cascade can touch list_comments/interactions owned by other users
-- (which is correct — deleting YOUR list should remove OTHER users' comments
-- on it and endorsements of it).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION delete_list_cascade(p_list_id UUID)
RETURNS void AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  -- Verify ownership via auth.uid() — not a client parameter
  SELECT user_id INTO v_owner_id
  FROM lists
  WHERE id = p_list_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'List not found';
  END IF;

  IF v_owner_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: you do not own this list';
  END IF;

  -- Atomic cascade: all-or-nothing within this transaction
  DELETE FROM list_items WHERE list_id = p_list_id;
  DELETE FROM list_comments WHERE list_id = p_list_id;
  DELETE FROM interactions WHERE target_list_id = p_list_id;
  DELETE FROM lists WHERE id = p_list_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute to authenticated users only
GRANT EXECUTE ON FUNCTION delete_list_cascade(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION delete_list_cascade(UUID) FROM anon;

COMMENT ON FUNCTION delete_list_cascade IS
  'Atomically deletes a list and all its dependent data (items, comments, interactions). '
  'Uses auth.uid() for ownership verification. Cannot partially fail.';
