-- ============================================================
-- CLEAN SLATE: Wipe all imported data for a fresh re-import
-- Run this in Supabase SQL Editor BEFORE her final import
-- ============================================================

-- Step 1: Find the GF's user_id (replace 'morpho' with her username)
-- SELECT id, username FROM profiles WHERE username = 'morpho';

-- Step 2: Delete all imported logs (format='Digital' created April 1-2, 2026)
-- Replace USER_ID_HERE with the actual UUID from step 1
DELETE FROM logs 
WHERE user_id = (SELECT id FROM profiles WHERE username = 'morpho')
AND format = 'Digital'
AND created_at >= '2026-04-01T00:00:00Z';

-- Step 3: Delete watchlist items that were imported
DELETE FROM watchlists
WHERE user_id = (SELECT id FROM profiles WHERE username = 'morpho')
AND created_at >= '2026-04-01T00:00:00Z';

-- Step 4: Verify cleanup
SELECT COUNT(*) as remaining_logs FROM logs 
WHERE user_id = (SELECT id FROM profiles WHERE username = 'morpho');

SELECT COUNT(*) as remaining_watchlist FROM watchlists
WHERE user_id = (SELECT id FROM profiles WHERE username = 'morpho');
