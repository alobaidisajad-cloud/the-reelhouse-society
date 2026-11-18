-- Undo of 20261119_12: a session ended takes its phone's pushes with it, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── B1 undone · a token stands until its phone signs out with a session, or Expo says it is dead ──
-- (B1.column.down.sql takes the column after this.)
-- add-only (1): no shipped client uses it: functions round 13 made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.forget_push_token(text, uuid);
-- add-only (1): no shipped client uses it: functions round 13 made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.forget_other_devices(text);
-- add-only (1): no shipped client uses it: functions round 13 made, called by notify-push alone (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.push_tokens_of(uuid);

-- As 20260929_01 made it.
-- add-only (3): it only fixes: put back as it was before round 13
CREATE OR REPLACE FUNCTION public.register_push_token(p_token text, p_platform text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- The device is the token: claimed by the member signed in on it now, from
  -- whoever held it before (never two owners, never a stale one).
  INSERT INTO public.push_tokens (user_id, token, platform, updated_at)
  VALUES (auth.uid(), p_token, p_platform, now())
  ON CONFLICT (token)
  DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = now();

  -- A member's ten most recently seen devices; older ones go.
  DELETE FROM public.push_tokens
   WHERE user_id = auth.uid()
     AND id NOT IN (
       SELECT id FROM public.push_tokens
        WHERE user_id = auth.uid()
        ORDER BY updated_at DESC, id DESC
        LIMIT 10);
END;
$$;
