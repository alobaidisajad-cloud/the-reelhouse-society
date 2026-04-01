-- ═══════════════════════════════════════════════════════════════
-- THE LOUNGE — Database Schema
-- Real-time chat rooms for Archivist+ members
-- ═══════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════
-- TABLE 1: LOUNGES — The rooms themselves
-- ════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lounges (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    creator_id  UUID NOT NULL REFERENCES profiles(id),
    is_private  BOOLEAN DEFAULT false,
    invite_code TEXT UNIQUE,
    cover_image TEXT,
    member_count INT DEFAULT 1,
    max_members INT DEFAULT 50,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ════════════════════════════════════════════════════
-- TABLE 2: LOUNGE_MEMBERS — Who's in which lounge
-- ════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lounge_members (
    lounge_id       UUID NOT NULL REFERENCES lounges(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES profiles(id),
    joined_at       TIMESTAMPTZ DEFAULT now(),
    last_read_at    TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (lounge_id, user_id)
);

-- ════════════════════════════════════════════════════
-- TABLE 3: LOUNGE_MESSAGES — The actual chat messages
-- ════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lounge_messages (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lounge_id   UUID NOT NULL REFERENCES lounges(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES profiles(id),
    content     TEXT NOT NULL,
    type        TEXT DEFAULT 'text',
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Fast retrieval index
CREATE INDEX IF NOT EXISTS idx_lounge_messages_lounge_created
    ON lounge_messages (lounge_id, created_at DESC);

-- ════════════════════════════════════════════════════
-- RLS POLICIES
-- ════════════════════════════════════════════════════

-- LOUNGES
ALTER TABLE lounges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public lounges visible to archivists" ON lounges;
CREATE POLICY "Public lounges visible to archivists" ON lounges
    FOR SELECT USING (
        NOT is_private
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('archivist', 'auteur', 'projectionist')
        )
    );

DROP POLICY IF EXISTS "Private lounges visible to members" ON lounges;
CREATE POLICY "Private lounges visible to members" ON lounges
    FOR SELECT USING (
        is_private AND EXISTS (
            SELECT 1 FROM lounge_members
            WHERE lounge_id = lounges.id AND user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Archivists can create lounges" ON lounges;
CREATE POLICY "Archivists can create lounges" ON lounges
    FOR INSERT WITH CHECK (
        creator_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('archivist', 'auteur', 'projectionist')
        )
    );

DROP POLICY IF EXISTS "Creator can update lounges" ON lounges;
CREATE POLICY "Creator can update lounges" ON lounges
    FOR UPDATE USING (creator_id = auth.uid())
    WITH CHECK (creator_id = auth.uid());

-- LOUNGE MEMBERS
ALTER TABLE lounge_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read their own memberships" ON lounge_members;
CREATE POLICY "Members can read their own memberships" ON lounge_members
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Members can see co-members" ON lounge_members;
CREATE POLICY "Members can see co-members" ON lounge_members
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM lounge_members lm WHERE lm.lounge_id = lounge_members.lounge_id AND lm.user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Archivists can join lounges" ON lounge_members;
CREATE POLICY "Archivists can join lounges" ON lounge_members
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid()
            AND role IN ('archivist', 'auteur', 'projectionist')
        )
    );

DROP POLICY IF EXISTS "Users can leave lounges" ON lounge_members;
CREATE POLICY "Users can leave lounges" ON lounge_members
    FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Creator can kick members" ON lounge_members;
CREATE POLICY "Creator can kick members" ON lounge_members
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM lounges
            WHERE id = lounge_members.lounge_id
            AND creator_id = auth.uid()
        )
    );

-- LOUNGE MESSAGES
ALTER TABLE lounge_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read lounge messages" ON lounge_messages;
CREATE POLICY "Members can read lounge messages" ON lounge_messages
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM lounge_members WHERE lounge_id = lounge_messages.lounge_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Members can send messages" ON lounge_messages;
CREATE POLICY "Members can send messages" ON lounge_messages
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (SELECT 1 FROM lounge_members WHERE lounge_id = lounge_messages.lounge_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can delete own messages" ON lounge_messages;
CREATE POLICY "Users can delete own messages" ON lounge_messages
    FOR DELETE USING (user_id = auth.uid());

-- ════════════════════════════════════════════════════
-- RPC: Get unread counts for all user's lounges
-- ════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_lounge_unread_counts(p_user_id UUID)
RETURNS TABLE(lounge_id UUID, unread_count BIGINT) AS $$
    SELECT
        lm.lounge_id,
        COUNT(msg.id) AS unread_count
    FROM lounge_members lm
    LEFT JOIN lounge_messages msg
        ON msg.lounge_id = lm.lounge_id
        AND msg.created_at > lm.last_read_at
        AND msg.user_id != p_user_id
    WHERE lm.user_id = p_user_id
    GROUP BY lm.lounge_id;
$$ LANGUAGE sql STABLE;

-- ════════════════════════════════════════════════════
-- Enable Realtime on lounge_messages for live chat
-- ════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE lounge_messages;

-- ════════════════════════════════════════════════════
-- Invite code lookup (for joining private lounges)
-- Needs SELECT on private lounges by invite_code
-- ════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Invite code lookup" ON lounges;
CREATE POLICY "Invite code lookup" ON lounges
    FOR SELECT USING (
        invite_code IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('archivist', 'auteur', 'projectionist')
        )
    );
