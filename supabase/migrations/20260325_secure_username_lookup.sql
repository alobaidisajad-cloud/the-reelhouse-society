-- Secure username → email lookup RPC
-- This function runs with SECURITY DEFINER so it can read emails
-- without exposing the email column to client-side queries.
-- Returns the email for a given username, or NULL if not found.

CREATE OR REPLACE FUNCTION get_email_by_username(lookup_username TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM profiles WHERE username = lower(lookup_username) LIMIT 1;
$$;

-- Add unique constraint on username to enforce uniqueness at DB level
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_username_unique'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_username_unique UNIQUE (username);
  END IF;
END $$;
