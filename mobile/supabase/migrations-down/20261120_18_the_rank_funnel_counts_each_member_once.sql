-- Undo of 20261120_18: the rank funnel is counted once per member, never by a stranger, and a purchase by the house alone, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A7 undone · every call counted again, a visitor's too, and the day's fingerprints gone ──
CREATE OR REPLACE FUNCTION public.record_gate_event(
  p_event      text,
  p_feature_id text DEFAULT '',
  p_rank       text DEFAULT '',
  p_standing   text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_feature text := coalesce(p_feature_id, '');
  v_rank    text := coalesce(p_rank, '');
  v_stand   text := coalesce(p_standing, '');
BEGIN
  -- A closed vocabulary. Anything else is not a funnel event and is dropped
  -- silently: a measurement call must never be able to fail a member's action.
  IF p_event NOT IN ('gate_tapped', 'membership_opened', 'rank_purchased', 'rank_relinquished', 'gate_refused') THEN
    RETURN;
  END IF;

  -- Shape, not membership. The registry lives in the app; repeating it here
  -- would be a second copy to keep in step. The ceiling below is what actually
  -- bounds the table, so this only has to stop the absurd.
  IF v_feature !~ '^[a-z0-9-]{0,48}$' THEN v_feature := 'other'; END IF;
  IF v_rank    !~ '^[a-z]{0,16}$'     THEN v_rank    := '';      END IF;
  IF v_stand   !~ '^[a-z]{0,16}$'     THEN v_stand   := '';      END IF;

  -- Try the existing counter first. This is the overwhelmingly common path and
  -- it touches one row by primary key.
  UPDATE public.gate_metrics
     SET count = count + 1
   WHERE day = current_date AND event = p_event
     AND feature_id = v_feature AND rank = v_rank AND standing = v_stand;

  IF NOT FOUND THEN
    -- Only a genuinely new combination pays for the ceiling check.
    IF (SELECT count(*) FROM public.gate_metrics WHERE day = current_date) >= 500 THEN
      v_feature := 'other';
      v_rank    := '';
      v_stand   := '';
    END IF;

    INSERT INTO public.gate_metrics AS m (day, event, feature_id, rank, standing, count)
    VALUES (current_date, p_event, v_feature, v_rank, v_stand, 1)
    ON CONFLICT (day, event, feature_id, rank, standing)
    DO UPDATE SET count = m.count + 1;
  END IF;
END
$fn$;

COMMENT ON FUNCTION public.record_gate_event(text, text, text, text) IS
  'Increments an aggregate gate counter. Records no identity of any kind. A gate_refused row means a member reached a server refusal with no rope in front of it.';

REVOKE ALL ON FUNCTION public.record_gate_event(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_gate_event(text, text, text, text) TO anon, authenticated;

-- grant_entitlement as 20261003_09 made it, counting nothing.
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

DROP FUNCTION IF EXISTS public.a_rank_is_counted(text, text);
DROP TABLE IF EXISTS public.gate_counted;
DROP TABLE IF EXISTS public.gate_day;
