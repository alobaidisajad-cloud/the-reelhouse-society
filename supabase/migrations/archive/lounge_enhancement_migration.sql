-- ═══════════════════════════════════════════════════════════
-- THE LOUNGE — Reply System & Settings Enhancement Migration
-- Run this AFTER the initial lounge migration
-- ═══════════════════════════════════════════════════════════

-- ── Add reply columns to lounge_messages ──
ALTER TABLE public.lounge_messages
ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.lounge_messages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS reply_to_content TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS reply_to_username TEXT DEFAULT NULL;

-- ── Index for reply lookups ──
CREATE INDEX IF NOT EXISTS idx_lounge_messages_reply_to
ON public.lounge_messages(reply_to_id)
WHERE reply_to_id IS NOT NULL;

-- ── Enable Realtime for DELETE events (needed for delete-for-everyone) ──
-- This ensures the Realtime subscription picks up DELETE events
ALTER PUBLICATION supabase_realtime ADD TABLE public.lounge_messages;

-- ── RPC: Get unread counts (if not already created) ──
CREATE OR REPLACE FUNCTION public.get_lounge_unread_counts(p_user_id UUID)
RETURNS TABLE(lounge_id UUID, unread_count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        lm.lounge_id,
        COUNT(msg.id) AS unread_count
    FROM public.lounge_members lm
    LEFT JOIN public.lounge_messages msg
        ON msg.lounge_id = lm.lounge_id
        AND msg.created_at > COALESCE(lm.last_read_at, '1970-01-01'::timestamp)
        AND msg.user_id != p_user_id
    WHERE lm.user_id = p_user_id
    GROUP BY lm.lounge_id
    HAVING COUNT(msg.id) > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RLS: Allow users to delete their own messages ──
-- (Should already exist, but ensure it's there)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'lounge_messages'
        AND policyname = 'Users can delete own messages'
    ) THEN
        CREATE POLICY "Users can delete own messages"
            ON public.lounge_messages
            FOR DELETE
            USING (auth.uid() = user_id);
    END IF;
END $$;

-- ── RLS: Allow lounge creators to update their lounges ──
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'lounges'
        AND policyname = 'Creators can update own lounges'
    ) THEN
        CREATE POLICY "Creators can update own lounges"
            ON public.lounges
            FOR UPDATE
            USING (auth.uid() = creator_id)
            WITH CHECK (auth.uid() = creator_id);
    END IF;
END $$;

-- ── RLS: Allow lounge creators to kick members ──
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'lounge_members'
        AND policyname = 'Creators can remove members'
    ) THEN
        CREATE POLICY "Creators can remove members"
            ON public.lounge_members
            FOR DELETE
            USING (
                auth.uid() IN (
                    SELECT creator_id FROM public.lounges WHERE id = lounge_id
                )
                OR auth.uid() = user_id  -- Members can also leave themselves
            );
    END IF;
END $$;
