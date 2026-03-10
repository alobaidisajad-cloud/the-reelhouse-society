-- ============================================================
-- ReelHouse Society — Initial Baseline Migration
-- Applied: 2026-03-10
-- Description: Documents the initial schema state as a
--              migration baseline for future tracked changes.
-- ============================================================

-- profiles table (created via Supabase auth hook)
-- users get a profile row on signup via trigger

-- logs table — core log entries
-- Already exists with the following structure:
-- CREATE TABLE logs (
--   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
--   user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
--   film_id bigint,
--   film_title text,
--   film_year int,
--   film_poster text,
--   rating numeric(3,1) CHECK (rating >= 0 AND rating <= 5),
--   review text,
--   status text CHECK (status IN ('watched','rewatched','abandoned','want')),
--   watched_date date,
--   is_spoiler boolean DEFAULT false,
--   is_private boolean DEFAULT false,
--   created_at timestamptz DEFAULT now(),
--   updated_at timestamptz DEFAULT now()
-- );

-- RLS policies on logs (already applied):
-- ENABLE ROW LEVEL SECURITY
-- SELECT: viewable by everyone (for community feed)
-- ALL: auth.uid() = user_id (owner can manage their own rows)

-- lists table
-- CREATE TABLE lists (
--   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
--   user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
--   title text NOT NULL,
--   description text,
--   is_public boolean DEFAULT true,
--   created_at timestamptz DEFAULT now()
-- );

-- programmes table (Nightly Programme — Auteur tier feature)
-- CREATE TABLE programmes (
--   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
--   user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
--   title text NOT NULL,
--   films jsonb DEFAULT '[]',
--   created_at timestamptz DEFAULT now()
-- );

-- notifications table
-- CREATE TABLE notifications (
--   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
--   user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
--   type text,
--   payload jsonb,
--   read boolean DEFAULT false,
--   created_at timestamptz DEFAULT now()
-- );

-- Future migrations should be added as separate dated files:
-- 0002_add_endorsements.sql
-- 0003_add_venue_commission_table.sql
-- etc.
