-- ════════════════════════════════════════════════════════════════════════════
-- 20261003_09 — a refunded founding seat returns to the hundred
-- ════════════════════════════════════════════════════════════════════════════
-- A founding seat is one of a hundred. Bought in the store and refunded, it was
-- kept for ever (profiles.is_founding was never cleared), so a refund was a free
-- seat, and a paying buyer could be told the hundred were full. The user's
-- decision (2026-10-03): a refunded seat goes back to the hundred.
--
-- A source's grant now remembers that it bought a seat (rank_grants.tier
-- 'founding', held as the Auteur rank in profiles). When that grant ends and no
-- source holds a seat any longer, the seat is released: is_founding cleared and
-- the counter given one back. A seat given by hand is the house's and no store
-- returns it. relinquish_rank (the app saying "the store holds nothing") never
-- ends a store's founding grant: only the house reading the store's own record
-- (sync-entitlement, revenuecat-webhook) does, so no fault on a phone can cost
-- a member their seat.
--
-- And the seat counter loses the grants that let visitors and members write it
-- (no rule ever allowed them to, and no client reads it).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.rank_grants DROP CONSTRAINT rank_grants_tier_check;
ALTER TABLE public.rank_grants ADD CONSTRAINT rank_grants_tier_check CHECK (tier IN ('archivist', 'auteur', 'founding'));

-- A seat held today is held under the source that last granted a rank (by hand
-- when none has).
INSERT INTO public.rank_grants (user_id, source, tier)
SELECT p.id, coalesce(p.entitlement_source, 'manual'), 'founding'
  FROM public.profiles p WHERE coalesce(p.is_founding, false)
ON CONFLICT (user_id, source) DO UPDATE SET tier = 'founding';

REVOKE ALL ON public.founding_seat_counter FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.grant_entitlement(p_user_id uuid, p_tier text, p_source text) RETURNS TABLE(out_role text, out_tier text, out_source text, out_applied boolean, out_reason text)
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_grant text; v_before text; v_founding boolean;
  v_top_tier text; v_top_src text; v_in_force text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'grant_entitlement: user id is required' USING ERRCODE = '22023';
  END IF;
  IF p_tier IS NULL OR p_tier NOT IN ('cinephile','archivist','auteur','founding') THEN
    RAISE EXCEPTION 'grant_entitlement: unknown tier %', coalesce(p_tier,'<null>') USING ERRCODE = '22023';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('revenuecat','paytabs','manual') THEN
    RAISE EXCEPTION 'grant_entitlement: unknown source %', coalesce(p_source,'<null>') USING ERRCODE = '22023';
  END IF;

  -- One writer at a time per member: the profile row is the lock.
  SELECT coalesce(p.is_founding, false) INTO v_founding
    FROM public.profiles p WHERE p.id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'grant_entitlement: no profile with id %', p_user_id USING ERRCODE = 'P0002';
  END IF;

  -- This source's grant; 'cinephile' means it grants nothing. 'founding' says the
  -- source bought a seat; the seat itself is claim_founding_seat's.
  v_grant := CASE p_tier WHEN 'cinephile' THEN NULL ELSE p_tier END;
  SELECT g.tier INTO v_before FROM public.rank_grants g WHERE g.user_id = p_user_id AND g.source = p_source;
  IF v_grant IS NULL THEN
    DELETE FROM public.rank_grants WHERE user_id = p_user_id AND source = p_source;
  ELSE
    INSERT INTO public.rank_grants (user_id, source, tier) VALUES (p_user_id, p_source, v_grant)
    ON CONFLICT (user_id, source) DO UPDATE SET tier = EXCLUDED.tier, granted_at = now()
      WHERE public.rank_grants.tier IS DISTINCT FROM EXCLUDED.tier;
  END IF;

  -- The seat this source bought, held by no source any longer, goes back to the hundred.
  IF v_founding AND v_before = 'founding' AND v_grant IS DISTINCT FROM 'founding'
     AND NOT EXISTS (SELECT 1 FROM public.rank_grants g WHERE g.user_id = p_user_id AND g.tier = 'founding') THEN
    UPDATE public.founding_seat_counter SET seats_claimed = GREATEST(seats_claimed - 1, 0) WHERE id = 1;
    UPDATE public.profiles SET is_founding = false WHERE id = p_user_id;
    v_founding := false;
  END IF;

  -- The rank in force: the highest grant, the house's own hand first among equals.
  -- The column holds a founding grant as the Auteur; the seat is is_founding's to show.
  SELECT g.tier, g.source INTO v_top_tier, v_top_src
    FROM public.rank_grants g WHERE g.user_id = p_user_id
   ORDER BY public.tier_weight(g.tier) DESC,
            CASE g.source WHEN 'manual' THEN 0 WHEN 'revenuecat' THEN 1 ELSE 2 END
   LIMIT 1;
  v_in_force := CASE
    WHEN v_top_tier = 'founding' THEN 'auteur'
    WHEN v_founding AND public.tier_weight(v_top_tier) < 2 THEN 'auteur'
    ELSE coalesce(v_top_tier, 'cinephile') END;

  RETURN QUERY
  UPDATE public.profiles p
     SET role = CASE WHEN p.role = 'admin' THEN p.role ELSE v_in_force END,
         tier = v_in_force,
         -- A rank that has ended keeps the name of the source that held it last:
         -- that is how the app knows a member as "lapsed", not a stranger.
         entitlement_source = coalesce(v_top_src, p.entitlement_source, CASE WHEN v_before IS NOT NULL THEN p_source END)
   WHERE p.id = p_user_id
  RETURNING p.role, p.tier, p.entitlement_source, v_before IS DISTINCT FROM v_grant,
            format('%s: %s -> %s; in force %s', p_source, coalesce(v_before, 'none'), coalesce(v_grant, 'none'), v_in_force);
END;
$$;

CREATE OR REPLACE FUNCTION public.relinquish_rank() RETURNS TABLE(out_tier text, out_applied boolean, out_reason text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'relinquish_rank: not authenticated' USING ERRCODE = '42501';
  END IF;

  -- A seat is one of a hundred: it ends only on the store's own record, read by
  -- the house, never on the app's word that the store holds nothing.
  IF EXISTS (SELECT 1 FROM public.rank_grants
              WHERE user_id = v_uid AND source = 'revenuecat' AND tier = 'founding') THEN
    RETURN QUERY SELECT p.tier, false, 'a founding seat ends only on the store''s own record'::text
      FROM public.profiles p WHERE p.id = v_uid;
    RETURN;
  END IF;

  -- 'revenuecat' as the source: only the store's own grant is ended.
  RETURN QUERY
  SELECT g.out_tier, g.out_applied, g.out_reason
  FROM public.grant_entitlement(v_uid, 'cinephile', 'revenuecat') AS g;
END $$;

COMMENT ON FUNCTION public.relinquish_rank() IS 'Ends the store''s grant of the CALLER''S OWN rank and nothing else (a rank given on the web or by hand stands, and a founding seat ends only on the store''s own record, read by the house). Safe for authenticated: the worst abuse is self-removal, which the next store sync restores. Called by the client when the store reports no active entitlement.';
