-- ═══════════════════════════════════════════════════════════════════════
-- P0-2 FIX: Atomic list item replacement via Supabase RPC
-- ═══════════════════════════════════════════════════════════════════════
-- This function replaces all films in a list atomically within a single
-- PostgreSQL transaction. The client-side delete→insert pattern had a
-- split-brain window where network drops between the two operations
-- permanently lost all films in the list.
--
-- Deploy this to your Supabase project when ready:
--   1. Go to Supabase Dashboard → SQL Editor
--   2. Paste this entire file and run
--   3. Update listSlice.ts to call supabase.rpc('replace_list_items', ...)
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION replace_list_items(
  p_list_id UUID,
  p_user_id UUID,
  p_items JSONB DEFAULT '[]'::JSONB
) RETURNS VOID AS $$
BEGIN
  -- Verify ownership (defense-in-depth beyond RLS)
  IF NOT EXISTS (SELECT 1 FROM lists WHERE id = p_list_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: list does not belong to user'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  -- Atomic delete + insert in a single transaction
  DELETE FROM list_items WHERE list_id = p_list_id;
  
  -- Only insert if there are items to add
  IF jsonb_array_length(p_items) > 0 THEN
    INSERT INTO list_items (list_id, film_id, film_title, poster_path, position)
    SELECT
      p_list_id,
      (item->>'film_id')::INT,
      COALESCE(item->>'film_title', 'Unknown'),
      item->>'poster_path',
      (item->>'position')::INT
    FROM jsonb_array_elements(p_items) AS item;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION replace_list_items(UUID, UUID, JSONB) TO authenticated;

-- Add a comment for documentation
COMMENT ON FUNCTION replace_list_items IS 
  'Atomically replaces all films in a list. Used by the mobile app to prevent data loss during list edits.';
