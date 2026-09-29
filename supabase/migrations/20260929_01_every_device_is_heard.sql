-- ════════════════════════════════════════════════════════════════════════════
-- 20260929_01 — every device a member signs in on is heard
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── WHAT WAS THERE ────────────────────────────────────────────────────────
-- push_tokens carried UNIQUE (user_id, platform), and register_push_token
-- claimed a token with ON CONFLICT (user_id, platform) DO UPDATE SET token.
-- So a member held ONE token per platform: an iPhone and an iPad took turns,
-- and whichever opened the app last was the only one the house could reach.
-- notify-push already sends to every token a member has and prunes the ones
-- Expo reports as DeviceNotRegistered — the table was the only thing standing
-- between a member and their second device.
--
-- And the app's sign-out removed by (user_id, platform): signing out of the
-- iPad would have removed the iPhone's token too, once there could be two.
-- (The app now removes this device's own token; see removePushToken.)
--
-- ── WHAT REPLACES IT ──────────────────────────────────────────────────────
-- One row per DEVICE — the token is the device — owned by whoever signed in on
-- it last. A device that changes hands changes owner in the same statement, so
-- it can never deliver the previous member's notices (the LIB-3 rule, kept).
-- Bounded: a member's ten most recently seen devices. Reinstalls mint new
-- tokens; the dead ones are pruned by notify-push, and this cap stops a member
-- who never receives a push (so is never pruned) from growing without end.
--
-- No transaction control here: the rehearsal (diagnostics/
-- push_devices_rehearsal.sql) includes this file inside its own transaction.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.push_tokens DROP CONSTRAINT IF EXISTS push_tokens_user_id_platform_key;

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
