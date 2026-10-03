-- ════════════════════════════════════════════════════════════════════════════
-- 20261003_08 — a rank is held per source
-- ════════════════════════════════════════════════════════════════════════════
-- A member's rank had one slot, and whichever source wrote last owned it. A
-- member given the Archivist by hand who then bought the Auteur in the store
-- had the slot taken over by the store; when that subscription ended, the store
-- lowered the slot to nothing and the hand-given rank was gone with it.
--
-- Now each source keeps its own grant (rank_grants: the store, the web, the
-- house's own hand) and the rank in force is the highest of them. A source
-- raises or ends only its own grant, so "a provider may only lower a rank it
-- granted" is no longer a rule to enforce: there is nothing else it can touch.
-- A founding seat (profiles.is_founding) still holds the Auteur rank at least.
--
-- grant_entitlement keeps its name, arguments and answer. out_applied now says
-- whether this source's grant CHANGED (relinquish_rank on a member the store
-- never ranked is false, and the app records nothing).
--
-- apply_entitlement (the 'legacy' source) had no caller in either app, in any
-- edge function, or in the database; it goes, and 'legacy' with it.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE public.rank_grants (
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    source text NOT NULL CHECK (source IN ('revenuecat', 'paytabs', 'manual')),
    tier text NOT NULL CHECK (tier IN ('archivist', 'auteur')),
    granted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, source)
);
COMMENT ON TABLE public.rank_grants IS 'One rank per member per source (store, web, by hand). The rank in force is the highest; written only by grant_entitlement.';
ALTER TABLE public.rank_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rank_grants FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rank_grants TO service_role;

-- The ranks held today, under the source that granted them. A rank with no
-- source was given by hand (no provider has written one), so it is the house's.
INSERT INTO public.rank_grants (user_id, source, tier)
SELECT p.id, coalesce(p.entitlement_source, 'manual'),
       CASE GREATEST(public.tier_weight(p.tier), public.tier_weight(p.role)) WHEN 1 THEN 'archivist' ELSE 'auteur' END
  FROM public.profiles p
 WHERE GREATEST(public.tier_weight(p.tier), public.tier_weight(p.role)) BETWEEN 1 AND 3;

DROP FUNCTION public.apply_entitlement(uuid, text);

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

  -- This source's grant: the Founding purchase is held as the Auteur rank (the
  -- seat itself is claim_founding_seat's); 'cinephile' means it grants nothing.
  v_grant := CASE p_tier WHEN 'founding' THEN 'auteur' WHEN 'cinephile' THEN NULL ELSE p_tier END;
  SELECT g.tier INTO v_before FROM public.rank_grants g WHERE g.user_id = p_user_id AND g.source = p_source;
  IF v_grant IS NULL THEN
    DELETE FROM public.rank_grants WHERE user_id = p_user_id AND source = p_source;
  ELSE
    INSERT INTO public.rank_grants (user_id, source, tier) VALUES (p_user_id, p_source, v_grant)
    ON CONFLICT (user_id, source) DO UPDATE SET tier = EXCLUDED.tier, granted_at = now()
      WHERE public.rank_grants.tier IS DISTINCT FROM EXCLUDED.tier;
  END IF;

  -- The rank in force: the highest grant, the house's own hand first among equals.
  SELECT g.tier, g.source INTO v_top_tier, v_top_src
    FROM public.rank_grants g WHERE g.user_id = p_user_id
   ORDER BY public.tier_weight(g.tier) DESC,
            CASE g.source WHEN 'manual' THEN 0 WHEN 'revenuecat' THEN 1 ELSE 2 END
   LIMIT 1;
  v_in_force := CASE
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

-- The app greets a member whose rank lapsed as one coming back. It read
-- profiles.entitlement_source for that, which no member may read (opened, it
-- would tell every member how every other pays), so every lapsed member was
-- greeted as a stranger. The member is told their own, and no one else's.
CREATE FUNCTION public.my_entitlement_source() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT p.entitlement_source FROM public.profiles p WHERE p.id = auth.uid();
$$;
COMMENT ON FUNCTION public.my_entitlement_source() IS 'The source that last granted the CALLER a rank (null if none ever has). Their own only.';
REVOKE ALL ON FUNCTION public.my_entitlement_source() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_entitlement_source() TO authenticated, service_role;

COMMENT ON FUNCTION public.relinquish_rank() IS 'Ends the store''s grant of the CALLER''S OWN rank and nothing else (a rank given on the web or by hand, and a founding seat, stand). Safe for authenticated: the worst abuse is self-removal, which the next store sync restores. Called by the client when the store reports no active entitlement.';
