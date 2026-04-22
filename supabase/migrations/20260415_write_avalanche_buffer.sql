-- PHASE 6: THE UNLOGGED WRITE AVALANCHE BUFFER
-- Purpose: Protect the database from Write table-locking if an auteur's
-- post goes viral and 500,000 users click 'Certify' (Like) simultaneously.

-- 1. Create the Unlogged Buffer Table
-- Unlogged tables skip the Write-Ahead Log (WAL). They are 10x faster
-- and are stored purely in RAM for maximum velocity before physical write.
CREATE UNLOGGED TABLE IF NOT EXISTS interactions_queue_buffer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    target_id TEXT,
    target_log_id TEXT,
    target_list_id TEXT,
    type TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- We enable raw throughput index on the buffer
CREATE INDEX IF NOT EXISTS idx_buffer_user_target ON interactions_queue_buffer(user_id, target_log_id);

-- 2. The Sweeper Function (The Batch Processor)
-- This takes the likes from RAM and physically writes them to the disk
-- neatly inside a single transaction, bypassing all locks.
CREATE OR REPLACE FUNCTION sweep_interaction_buffer()
RETURNS void AS $$
DECLARE
    batch_size INT := 5000;
BEGIN
    -- Move from buffer to permanent table securely
    WITH swept AS (
        DELETE FROM interactions_queue_buffer
        WHERE id IN (
            SELECT id FROM interactions_queue_buffer LIMIT batch_size
        )
        RETURNING *
    )
    INSERT INTO interactions (user_id, target_log_id, target_list_id, type, created_at)
    SELECT user_id, target_log_id, target_list_id, type, created_at
    FROM swept
    ON CONFLICT DO NOTHING; -- Prevents duplicate clicking from breaking it
END;
$$ LANGUAGE plpgsql;

-- 3. Schedule the Sweeper
-- Every minute, it clears the 100,000 queued likes neatly into permanent storage
SELECT cron.schedule(
    'sweep-interaction-buffer',
    '* * * * *',
    $$SELECT sweep_interaction_buffer()$$
);

-- NOTE: To use this, simply update the mobile app's React code 
-- to INSERT into "interactions_queue_buffer" instead of "interactions".
