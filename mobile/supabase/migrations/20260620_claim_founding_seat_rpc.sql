-- ════════════════════════════════════════════════════════════════════════
-- claim_founding_seat RPC — Atomic 100-seat cap enforcement
-- ════════════════════════════════════════════════════════════════════════
-- Problem: app/(modals)/membership.tsx checks
--   `SELECT count(*) FROM profiles WHERE is_founding = true`
-- then independently calls purchaseTier('founding') (which charges real
-- money via RevenueCat). Those two steps are not atomic across clients —
-- two users reading count=99 simultaneously can both purchase, and
-- supabase/functions/sync-entitlement/index.ts writes is_founding = true
-- unconditionally once RevenueCat confirms the tier, with no cap check
-- at all. There is currently NO point in the stack that can reject the
-- 101st seat.
--
-- Fix: a single-row counter table locked with SELECT ... FOR UPDATE
-- inside a function. The row lock serializes concurrent callers, so only
-- one transaction at a time can read-and-increment the count — the
-- classic "ticket counter" pattern. This is what actually makes the
-- check atomic; a bare UPDATE ... WHERE (SELECT count...) is NOT
-- sufficient because two concurrent statements can both evaluate their
-- subquery before either commits.
--
-- This migration does NOT change app behavior by itself — it only adds
-- the RPC. sync-entitlement's index.ts must be updated to call it instead
-- of writing is_founding directly (see accompanying code change).
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.founding_seat_counter (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  seats_claimed INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT founding_seat_counter_singleton CHECK (id = 1)
);

-- Seed the single counter row exactly once. Backfills from the current
-- is_founding count so this is safe to run after seats have already been
-- granted by the old unconditional code path.
INSERT INTO public.founding_seat_counter (id, seats_claimed)
SELECT 1, (SELECT COUNT(*) FROM public.profiles WHERE is_founding = true)
WHERE NOT EXISTS (SELECT 1 FROM public.founding_seat_counter WHERE id = 1);

-- claim_founding_seat: atomically grants the seat if (and only if) capacity
-- remains. Returns true if the seat was granted, false if the cap (100,
-- adjustable via p_max_seats) was already reached.
CREATE OR REPLACE FUNCTION public.claim_founding_seat(
  p_user_id UUID,
  p_max_seats INTEGER DEFAULT 100
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_seats_claimed INTEGER;
  v_already_founding BOOLEAN;
BEGIN
  -- Idempotent: if this user already holds a seat, don't double-count
  -- a retried sync-entitlement call.
  SELECT is_founding INTO v_already_founding
  FROM public.profiles WHERE id = p_user_id;

  IF v_already_founding THEN
    RETURN true;
  END IF;

  -- Row lock serializes concurrent callers — this is the atomicity guarantee.
  SELECT seats_claimed INTO v_seats_claimed
  FROM public.founding_seat_counter
  WHERE id = 1
  FOR UPDATE;

  IF v_seats_claimed >= p_max_seats THEN
    RETURN false;
  END IF;

  UPDATE public.founding_seat_counter
  SET seats_claimed = seats_claimed + 1
  WHERE id = 1;

  UPDATE public.profiles
  SET is_founding = true
  WHERE id = p_user_id;

  RETURN true;
END;
$$;
