-- ReelHouse Mobile: push_tokens table + secure registration (LIB-3)
-- ---------------------------------------------------------------------------
-- The mobile app stores Expo push tokens (simple strings) per device. These do
-- NOT belong in push_subscriptions (that table is Web Push: endpoint/p256dh/auth).
-- This adds a dedicated table with UNIQUE(token) so a single device token can
-- only ever belong to one user, and a SECURITY DEFINER function that atomically
-- reassigns a token when a different account signs in on the same device.

-- 1. Table -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  platform   text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform)
);

-- 2. Row Level Security ------------------------------------------------------
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- A member may read and delete only their own token rows. (Registration is done
-- through register_push_token below, which runs as definer.)
DROP POLICY IF EXISTS "push_tokens_select_own" ON public.push_tokens;
CREATE POLICY "push_tokens_select_own" ON public.push_tokens
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "push_tokens_delete_own" ON public.push_tokens;
CREATE POLICY "push_tokens_delete_own" ON public.push_tokens
  FOR DELETE USING (user_id = auth.uid());

-- 3. Secure registration function -------------------------------------------
-- Detaches the device token from any previous owner, then claims it for the
-- caller (one row per user+platform). SECURITY DEFINER so the cross-user
-- detach is possible despite RLS; ownership is always auth.uid().
CREATE OR REPLACE FUNCTION public.register_push_token(p_token text, p_platform text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Detach this device token from any other account.
  DELETE FROM public.push_tokens
   WHERE token = p_token AND user_id <> auth.uid();

  -- Claim it for the current user (refresh token on the existing platform row).
  INSERT INTO public.push_tokens (user_id, token, platform, updated_at)
  VALUES (auth.uid(), p_token, p_platform, now())
  ON CONFLICT (user_id, platform)
  DO UPDATE SET token = EXCLUDED.token, updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_push_token(text, text) TO authenticated;
