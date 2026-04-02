-- Add social_links column to profiles table if it doesn't exist
-- This stores a JSON object like: {"instagram": "url", "twitter": "url", ...}
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'social_links'
    ) THEN
        ALTER TABLE profiles ADD COLUMN social_links jsonb DEFAULT '{}'::jsonb;
    END IF;
END $$;
