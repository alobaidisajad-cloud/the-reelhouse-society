-- ============================================================
-- FIX: List Items Import — Run this in Supabase SQL Editor
-- This creates a server-side function that bypasses RLS
-- to reliably insert list items during Letterboxd imports.
-- ============================================================

-- 1. Fix RLS: Add explicit INSERT policy for list_items
DROP POLICY IF EXISTS "Users can manage list items." ON list_items;
DROP POLICY IF EXISTS "Users can manage list items" ON list_items;
DROP POLICY IF EXISTS "Users can insert list items." ON list_items;
DROP POLICY IF EXISTS "Users can insert list items" ON list_items;

-- Separate policies for each operation (more reliable than FOR ALL)
CREATE POLICY "Users can select list items" ON list_items 
  FOR SELECT USING (true);

CREATE POLICY "Users can insert list items" ON list_items 
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT user_id FROM lists WHERE id = list_id)
  );

CREATE POLICY "Users can update list items" ON list_items 
  FOR UPDATE USING (
    auth.uid() IN (SELECT user_id FROM lists WHERE id = list_id)
  );

CREATE POLICY "Users can delete list items" ON list_items 
  FOR DELETE USING (
    auth.uid() IN (SELECT user_id FROM lists WHERE id = list_id)
  );

-- 2. Create a SECURITY DEFINER function for batch list item inserts
-- This bypasses RLS completely (runs as the DB owner)
CREATE OR REPLACE FUNCTION batch_insert_list_items(
  p_list_id uuid,
  p_owner_id uuid,
  p_items jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item jsonb;
  inserted_count integer := 0;
BEGIN
  -- Verify the caller owns the list
  IF NOT EXISTS (SELECT 1 FROM lists WHERE id = p_list_id AND user_id = p_owner_id) THEN
    RAISE EXCEPTION 'Unauthorized: you do not own this list';
  END IF;

  -- Insert each item, skipping duplicates
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      INSERT INTO list_items (list_id, film_id, film_title, poster_path)
      VALUES (
        p_list_id,
        (item->>'film_id')::integer,
        item->>'film_title',
        item->>'poster_path'
      )
      ON CONFLICT (list_id, film_id) DO NOTHING;
      
      IF FOUND THEN
        inserted_count := inserted_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Skip any individual item errors, continue with the rest
      NULL;
    END;
  END LOOP;

  RETURN inserted_count;
END;
$$;

-- Also drop the old "viewable by everyone" SELECT policy since we recreated it above
DROP POLICY IF EXISTS "List items are viewable by everyone." ON list_items;
DROP POLICY IF EXISTS "List items are viewable by everyone" ON list_items;
