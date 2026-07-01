-- Elite Fix for Schema Drift (interactions & notifications)

-- Add missing columns to interactions table
ALTER TABLE public.interactions
  ADD COLUMN IF NOT EXISTS target_film_id integer,
  ADD COLUMN IF NOT EXISTS target_review_id uuid;

-- Add missing columns to notifications table
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS film_id integer,
  ADD COLUMN IF NOT EXISTS poster_path text;
