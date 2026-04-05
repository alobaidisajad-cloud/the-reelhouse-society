-- ReelHouse Optimization: Indexes, RLS, and Security Hardening
-- Execute this file in the Supabase SQL Editor

-------------------------------------------------------------------------------
-- PHASE 4.1: INDEX OPTIMIZATION FOR 10M+ SCALABILITY
-------------------------------------------------------------------------------
-- Why: As the community grows, table scans on core tables will cause severe DB lag.
-- We must index foreign keys, lookup columns, and common sort fields.

-- 1. Logs Table (The core feed and activity record)
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_film_id ON logs(film_id);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_composite_user_film ON logs(user_id, film_id);

-- 2. Watchlist (Quick lookups on film detail pages)
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_film_id ON watchlist(film_id);

-- 3. Interactions (Endorsements/Likes) - High volume writes/reads
CREATE INDEX IF NOT EXISTS idx_interactions_target_id ON interactions(target_id);
CREATE INDEX IF NOT EXISTS idx_interactions_user_id ON interactions(user_id);

-- 4. Follows (Social graph resolving)
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows(following_id);

-- 5. Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);


-------------------------------------------------------------------------------
-- PHASE 5.5: RLS POLICIES TIGHTENING
-------------------------------------------------------------------------------
-- Ensure users cannot maliciously insert or modify data as another user

-- Defensive Check: Enable RLS on core tables if not already enabled
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

-- 1. Logs
-- Only the owner can insert/update/delete their logs
CREATE POLICY "Users can insert their own logs" ON logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);
    
CREATE POLICY "Users can update their own logs" ON logs
    FOR UPDATE USING (auth.uid() = user_id);
    
CREATE POLICY "Users can delete their own logs" ON logs
    FOR DELETE USING (auth.uid() = user_id);

-- 2. Interactions (Endorsements)
CREATE POLICY "Users can insert their own interactions" ON interactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);
    
CREATE POLICY "Users can delete their own interactions" ON interactions
    FOR DELETE USING (auth.uid() = user_id);

-- 3. Follows
CREATE POLICY "Users can only follow on their own behalf" ON follows
    FOR INSERT WITH CHECK (auth.uid() = follower_id);
    
CREATE POLICY "Users can unfollow on their own behalf" ON follows
    FOR DELETE USING (auth.uid() = follower_id);

-- 4. Notifications
-- Users can only see and update their own notifications
CREATE POLICY "Users can view their notifications" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their notifications (mark read)" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- Prevent unauthorized inserts into notifications (must be done via triggers or secure edge functions if applicable)


-------------------------------------------------------------------------------
-- PHASE 5.1: BASIC RATE LIMITING FOUNDATION (SUPABASE ABORT)
-------------------------------------------------------------------------------
-- To prevent spam on critical endpoints like follow/endorse without Edge Functions,
-- we can use a basic DB trigger to enforce a wait period between insertions.

-- Example: Prevent spam endorsements (Max 1 per second per user)
CREATE OR REPLACE FUNCTION check_interaction_rate_limit()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM interactions 
    WHERE user_id = NEW.user_id 
    AND created_at > (NOW() - INTERVAL '1 second')
  ) THEN
    RAISE EXCEPTION 'PGRST301: Too many requests. Please wait a moment.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_interaction_rate_limit ON interactions;
CREATE TRIGGER enforce_interaction_rate_limit
  BEFORE INSERT ON interactions
  FOR EACH ROW
  EXECUTE FUNCTION check_interaction_rate_limit();
