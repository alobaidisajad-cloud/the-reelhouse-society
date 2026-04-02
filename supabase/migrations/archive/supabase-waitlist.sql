-- Waitlist table for pre-launch email capture
-- Run this in Supabase SQL editor
CREATE TABLE IF NOT EXISTS waitlist (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'archivist',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow anonymous inserts (public waitlist signup)
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can join waitlist" ON waitlist FOR INSERT WITH CHECK (true);

-- Prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_unique ON waitlist(email);
