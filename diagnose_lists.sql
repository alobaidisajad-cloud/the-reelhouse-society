-- ============================================================
-- DIAGNOSTIC + FIX: Check and populate list_items
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. DIAGNOSTIC: Check if ANY list_items exist for the user
SELECT 
    l.title as list_name,
    l.id as list_id,
    COUNT(li.film_id) as film_count
FROM lists l
LEFT JOIN list_items li ON li.list_id = l.id
WHERE l.description = 'Imported from Letterboxd'
GROUP BY l.id, l.title
ORDER BY l.title
LIMIT 20;

-- 2. DIAGNOSTIC: Check list_items RLS policies
SELECT 
    policyname, 
    cmd, 
    qual::text as using_expression,
    with_check::text as check_expression
FROM pg_policies 
WHERE tablename = 'list_items';

-- 3. DIAGNOSTIC: Check if batch_insert_list_items function exists
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_name = 'batch_insert_list_items';

-- 4. DIAGNOSTIC: Try a direct test insert (will rollback)
-- Uncomment and replace LIST_ID with an actual list UUID from result #1:
-- INSERT INTO list_items (list_id, film_id, film_title, poster_path)
-- VALUES ('LIST_ID_HERE', 550, 'Fight Club', '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg');
