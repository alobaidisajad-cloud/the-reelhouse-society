-- ROOT CAUSE FIX: The notify_on_interaction() trigger tries to INSERT
-- from_user_id into the notifications table, but that column never existed.
-- This causes ALL interactions inserts (certify, follow, etc.) to fail
-- with error 42703: "column notifications.from_user_id does not exist"
--
-- This migration adds the missing column so the trigger can succeed.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS from_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Reload PostgREST schema cache so the API layer recognizes the new column
NOTIFY pgrst, 'reload schema';
