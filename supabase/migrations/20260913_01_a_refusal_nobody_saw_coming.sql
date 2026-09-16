-- ─────────────────────────────────────────────────────────────────────────────
-- A REFUSAL NOBODY SAW COMING
--
-- The funnel records four things: a rope tapped, the Society opened, a rank
-- bought, a rank ended. All four describe a member meeting a door the APP put
-- in front of them.
--
-- There is a fifth thing, and it is the most diagnostic of the lot: a member
-- who reached a SERVER refusal. That can only happen when no rope stood in
-- front of the act — the client let them try something the database was always
-- going to refuse. Every one of those is a hole in the gating, and until now
-- the only way to find one was to read all of it and notice.
--
-- So `gate_refused` is not really a sales number. It is a regression detector
-- with a permanent home: any nonzero count names the feature whose rope is
-- missing. The audit that found the Lounge's silent "Failed to send message."
-- would have been a single row in this table.
--
-- Nothing else about the counter changes — same table, same ceiling, same
-- shape rules, still no user, device or session recorded anywhere.
-- ─────────────────────────────────────────────────────────────────────────────

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

-- CREATE OR REPLACE keeps the existing grants, but they are restated rather
-- than assumed: a function that silently lost EXECUTE would take the whole
-- funnel with it, and nothing else would say so.
REVOKE ALL ON FUNCTION public.record_gate_event(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_gate_event(text, text, text, text) TO anon, authenticated;
