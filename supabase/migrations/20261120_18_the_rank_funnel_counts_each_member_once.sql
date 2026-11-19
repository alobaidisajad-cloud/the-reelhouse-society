-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_18 — the rank funnel is counted once per member, never by a stranger, and a purchase by the house alone.
-- ════════════════════════════════════════════════════════════════════════════
--   1. Anyone holding the anon key could call record_gate_event in a loop and make the funnel say any
--      number of ranks were bought: a visitor's call is refused, each member adds at most 1 to each
--      counter a day, and to at most 100 counters a day, kept by a fingerprint keyed for the day alone
--      (gate_day, gate_counted) (review round 14).
--   2. A rank bought or ended is counted by the house alone, from its own record, when a store's grant
--      rises or ends (grant_entitlement); a member's call naming either adds nothing (review round 14).
--   Two new tables of the house's own (no key to another table) and functions; no existing table is
--   locked.
-- Undo: mobile/supabase/migrations-down/20261120_18_the_rank_funnel_counts_each_member_once.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A7 · the rank funnel is counted once per member, never by a stranger, and a purchase by the house alone (review round 14) ──
--   record_gate_event was granted to anon and to every member, and added 1 to today's counter on
--   every call: anyone holding the anon key (it ships in the app) could call it in a loop and make
--   the owner's funnel say any number of ranks were bought ("rank_purchased"), any number of Society
--   pages opened, any number of ropes tapped. Now:
--   1. only a member counts: a visitor's call is refused (EXECUTE taken from anon), and a call that
--      reaches the function without a member adds nothing. The phone holds a visitor's tap and sends
--      it once they are signed in (gateMetricsSink), so a guest who meets a rope and comes in is
--      still counted;
--   2. each member adds at most 1 to each counter on a house day, whatever they call, and to at most
--      100 counters a day (a member meets a handful of ropes in a whole membership);
--   3. a rank bought or ended is counted by the house alone, from its own record: grant_entitlement,
--      the one writer of every store's grant (revenuecat-webhook and sync-entitlement call it as the
--      service role; relinquish_rank as the house), counts "rank_purchased" when a store's grant rises
--      (none to the Archivist, the Archivist to the Auteur, a founding seat) and "rank_relinquished"
--      when a store's grant ends; a renewal, a retried webhook (the grant unchanged) and a rank given
--      by hand count nothing. A member's call naming either adds nothing: a script with N accounts
--      added N purchases a day. The door a purchase came through is the phone's alone to know, so the
--      house counts a purchase under its rank, at no door; the doors' taps and opens are still counted.
--   The counter still names nobody. To know that a member has already counted today, the house keeps,
--   for that day alone, a fingerprint of (member, counter) made with a key drawn at random for the day
--   (gate_day). Neither table holds a member's id, and the fingerprint cannot be tied back to anyone
--   once the day's key is let go: at the first count of each new day the earlier days' keys and
--   fingerprints are deleted. No client reads or writes either table.

-- add-only (1): no shipped client uses it: a table made here, named by neither TestFlight build 41 nor the website
CREATE TABLE public.gate_day (
    day date NOT NULL,
    salt bytea NOT NULL,
    CONSTRAINT gate_day_pkey PRIMARY KEY (day)
);
ALTER TABLE public.gate_day ENABLE ROW LEVEL SECURITY;
-- add-only (1): no shipped client uses it: a table made here, read by neither TestFlight build 41 nor the website
REVOKE ALL ON TABLE public.gate_day FROM anon, authenticated;
COMMENT ON TABLE public.gate_day IS 'The key of one house day, drawn at random, that record_gate_event fingerprints a member with for that day alone; let go when the next day begins.';

-- add-only (1): no shipped client uses it: a table made here, named by neither TestFlight build 41 nor the website
CREATE TABLE public.gate_counted (
    day date NOT NULL,
    who bytea NOT NULL,
    counter text NOT NULL,
    CONSTRAINT gate_counted_pkey PRIMARY KEY (day, who, counter),
    CONSTRAINT gate_counted_counter_len CHECK (char_length(counter) <= 200)
);
ALTER TABLE public.gate_counted ENABLE ROW LEVEL SECURITY;
-- add-only (1): no shipped client uses it: a table made here, read by neither TestFlight build 41 nor the website
REVOKE ALL ON TABLE public.gate_counted FROM anon, authenticated;
COMMENT ON TABLE public.gate_counted IS 'Which counters each member has added to today, as a fingerprint keyed by the day''s key (gate_day): no member id. Written by record_gate_event alone; earlier days deleted at the first count of a new day.';

-- One count, at no door, by the house: a rank bought or ended, from its own record.
-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again; called by grant_entitlement alone (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_rank_is_counted(text, text);
CREATE FUNCTION public.a_rank_is_counted(p_event text, p_rank text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  INSERT INTO public.gate_metrics AS m (day, event, feature_id, rank, standing, count)
  VALUES (current_date, p_event, '', coalesce(p_rank, ''), '', 1)
  ON CONFLICT (day, event, feature_id, rank, standing)
  DO UPDATE SET count = m.count + 1;
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, asked by the house's entitlement writer alone (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.a_rank_is_counted(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.a_rank_is_counted(text, text) TO service_role;

-- As before but: a member only, once per counter per day, at most 100 counters a day, and never a rank
-- bought or ended (the house counts those itself).
-- add-only (3): it only fixes: a member's first count of a counter on a day is counted as before, a second the same day, a visitor's and a member's purchase or relinquishment are not; replayed as the members themselves and a visitor (H-A7 rehearsal); TestFlight build 41 swallows a refused count without a word (gateMetricsSink)
CREATE OR REPLACE FUNCTION public.record_gate_event(p_event text, p_feature_id text DEFAULT ''::text, p_rank text DEFAULT ''::text, p_standing text DEFAULT ''::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_uid     uuid := auth.uid();
  v_feature text := coalesce(p_feature_id, '');
  v_rank    text := coalesce(p_rank, '');
  v_stand   text := coalesce(p_standing, '');
  v_salt    bytea;
  v_who     bytea;
  v_counter text;
BEGIN
  -- Only a member counts: a stranger with the anon key could otherwise write any number.
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- A closed vocabulary. Anything else is not a funnel event and is dropped
  -- silently: a measurement call must never be able to fail a member's action.
  -- A rank bought or ended is the house's to count, from its own record (grant_entitlement).
  IF p_event NOT IN ('gate_tapped', 'membership_opened', 'gate_refused') THEN
    RETURN;
  END IF;

  -- Shape, not membership. The registry lives in the app; repeating it here
  -- would be a second copy to keep in step. The ceiling below is what actually
  -- bounds the table, so this only has to stop the absurd.
  IF v_feature !~ '^[a-z0-9-]{0,48}$' THEN v_feature := 'other'; END IF;
  IF v_rank    !~ '^[a-z]{0,16}$'     THEN v_rank    := '';      END IF;
  IF v_stand   !~ '^[a-z]{0,16}$'     THEN v_stand   := '';      END IF;

  -- Today's key, drawn once (two first callers at once both draw; the first written stands).
  SELECT d.salt INTO v_salt FROM public.gate_day d WHERE d.day = current_date;
  IF NOT FOUND THEN
    -- A new day: the earlier days' keys and fingerprints go, so none can be tied to anyone again.
    DELETE FROM public.gate_counted WHERE day < current_date;
    DELETE FROM public.gate_day WHERE day < current_date;
    INSERT INTO public.gate_day (day, salt) VALUES (current_date, uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()))
    ON CONFLICT (day) DO NOTHING;
    SELECT d.salt INTO v_salt FROM public.gate_day d WHERE d.day = current_date;
  END IF;
  v_who := sha256(v_salt || convert_to(v_uid::text, 'UTF8'));

  -- A member adds to at most 100 counters a day.
  IF (SELECT count(*) FROM public.gate_counted c WHERE c.day = current_date AND c.who = v_who) >= 100 THEN
    RETURN;
  END IF;

  -- Once per member per counter per day.
  v_counter := p_event || '|' || v_feature || '|' || v_rank || '|' || v_stand;
  INSERT INTO public.gate_counted (day, who, counter) VALUES (current_date, v_who, v_counter)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RETURN;
  END IF;

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
$_$;

COMMENT ON FUNCTION public.record_gate_event(p_event text, p_feature_id text, p_rank text, p_standing text) IS 'Increments an aggregate gate counter (a rope tapped, the Society opened, a server refusal), once per member per counter per house day, members only. A rank bought or ended is counted by grant_entitlement from the house''s own record, never here. Records no identity: the day''s fingerprints (gate_counted) are keyed by a key let go with the day. A gate_refused row means a member reached a server refusal with no rope in front of it.';

-- A stranger never counts: the anon key ships in the app.
-- add-only (3): it only fixes: a visitor's count is refused, every member's counted as before once a day; replayed as a visitor and the members (H-A7 rehearsal); TestFlight build 41's guest tap is swallowed by its sink without a word, and the website never calls it
REVOKE EXECUTE ON FUNCTION public.record_gate_event(text, text, text, text) FROM anon;

-- The one writer of every store's grant: as 20261003_09 made it, and a rank bought or ended counted.
-- add-only (3): it only fixes: a store's grant that rises counts one purchase and one that ends one relinquishment, every rank written as before; replayed as the service role and the members (H-A7 rehearsal); called by revenuecat-webhook and sync-entitlement (service role) and relinquish_rank alone, never by a client
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


  -- A store's grant that rose is a rank bought, one that ended a rank given up: counted by the house,
  -- from its own record (round 14). A renewal or a retried webhook (the grant unchanged) and a rank
  -- given by hand count nothing. Counted at no door: the door is the phone's alone to know.
  IF p_source IN ('revenuecat', 'paytabs') THEN
    IF v_grant IS NOT NULL AND public.tier_weight(v_grant) > public.tier_weight(coalesce(v_before, 'cinephile')) THEN
      PERFORM public.a_rank_is_counted('rank_purchased', CASE WHEN v_grant IN ('auteur', 'founding') THEN 'auteur' ELSE 'archivist' END);
    ELSIF v_grant IS NULL AND v_before IS NOT NULL THEN
      PERFORM public.a_rank_is_counted('rank_relinquished', '');
    END IF;
  END IF;
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
