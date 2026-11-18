-- Undo of 20261119_07: a member's follows and certifications are paced as a script is, never as a person is, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A2 undone · a member's interactions kept a second apart again, as it was ──
CREATE OR REPLACE FUNCTION public.check_interaction_rate_limit() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM interactions 
    WHERE user_id = NEW.user_id 
    AND created_at > (NOW() - INTERVAL '1 second')
  ) THEN
    RAISE EXCEPTION 'PGRST301: Too many requests. Please wait a moment.';
  END IF;
  RETURN NEW;
END;
$$;
