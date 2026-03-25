-- ══════════════════════════════════════════════════════════════
-- Add email column to profiles for username-based login lookup
-- ══════════════════════════════════════════════════════════════

-- 1. Add email column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Backfill existing users' emails from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- 3. Update the signup trigger to also store email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, role, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'role', 'cinephile'),
        NEW.email
    )
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Add unique constraint on username (enforce uniqueness at DB level)
-- Use a partial index to allow NULLs
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_idx
    ON public.profiles (username)
    WHERE username IS NOT NULL;

-- 5. Index the email column for fast lookups
CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles(email);
