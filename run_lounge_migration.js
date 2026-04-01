import pg from 'pg';
const { Client } = pg;

const password = 'alobaidi1999.';
const dbUrl = `postgresql://postgres.wihyqkpoymwcvbprslyz:${password}@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`;

const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
});

const sql = `
-- ═══════════════════════════════════════════════════════════════
-- THE LOUNGE — Database Schema
-- ═══════════════════════════════════════════════════════════════

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

CREATE TABLE IF NOT EXISTS lounge_members (
    lounge_id       UUID NOT NULL REFERENCES lounges(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES profiles(id),
    joined_at       TIMESTAMPTZ DEFAULT now(),
    last_read_at    TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (lounge_id, user_id)
);

CREATE TABLE IF NOT EXISTS lounge_messages (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lounge_id   UUID NOT NULL REFERENCES lounges(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES profiles(id),
    content     TEXT NOT NULL,
    type        TEXT DEFAULT 'text',
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lounge_messages_lounge_created
    ON lounge_messages (lounge_id, created_at DESC);

-- RLS: LOUNGES
ALTER TABLE lounges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
CREATE POLICY "Public lounges visible to archivists" ON lounges
    FOR SELECT USING (
        NOT is_private
        AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('archivist', 'auteur', 'projectionist'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE POLICY "Private lounges visible to members" ON lounges
    FOR SELECT USING (
        is_private AND EXISTS (SELECT 1 FROM lounge_members WHERE lounge_id = lounges.id AND user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE POLICY "Invite code lookup" ON lounges
    FOR SELECT USING (
        invite_code IS NOT NULL
        AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('archivist', 'auteur', 'projectionist'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE POLICY "Archivists can create lounges" ON lounges
    FOR INSERT WITH CHECK (
        creator_id = auth.uid()
        AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('archivist', 'auteur', 'projectionist'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE POLICY "Creator can update lounges" ON lounges
    FOR UPDATE USING (creator_id = auth.uid()) WITH CHECK (creator_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS: LOUNGE MEMBERS
ALTER TABLE lounge_members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
CREATE POLICY "Members can read memberships" ON lounge_members
    FOR SELECT USING (
        user_id = auth.uid() OR
        EXISTS (SELECT 1 FROM lounge_members lm WHERE lm.lounge_id = lounge_members.lounge_id AND lm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE POLICY "Archivists can join lounges" ON lounge_members
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('archivist', 'auteur', 'projectionist'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE POLICY "Users can leave or creator can kick" ON lounge_members
    FOR DELETE USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM lounges WHERE id = lounge_members.lounge_id AND creator_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE POLICY "Members can update own membership" ON lounge_members
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS: LOUNGE MESSAGES
ALTER TABLE lounge_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
CREATE POLICY "Members can read lounge messages" ON lounge_messages
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM lounge_members WHERE lounge_id = lounge_messages.lounge_id AND user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE POLICY "Members can send messages" ON lounge_messages
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (SELECT 1 FROM lounge_members WHERE lounge_id = lounge_messages.lounge_id AND user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE POLICY "Users can delete own messages" ON lounge_messages
    FOR DELETE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- UNREAD COUNTS RPC
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

-- Enable Realtime on lounge_messages
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE lounge_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

async function run() {
    try {
        await client.connect();
        console.log("Connected to Supabase Postgres.");
        await client.query(sql);
        console.log("✅ The Lounge schema created successfully!");
    } catch (err) {
        console.error("Database error:", err);
    } finally {
        await client.end();
    }
}

run();
