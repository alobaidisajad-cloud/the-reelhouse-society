-- ─────────────────────────────────────────────────────────────────────────────
-- A COUNT THAT NAMES NOBODY
--
-- The gating work built a funnel seam and deliberately left it pointing
-- nowhere, because where member behaviour is recorded is a privacy decision
-- and not an engineering one. This is that decision, made.
--
-- ── WHY NOT A VENDOR ────────────────────────────────────────────────────────
-- The published privacy policy — live on the web, already relied on by the
-- existing userbase — says in its own words:
--
--     "We do not use third-party trackers or advertising pixels."
--     "We do not integrate any advertising networks, social media trackers,
--      or analytics platforms that track individual users."
--
-- Wiring PostHog, Amplitude, Mixpanel or Segment would make that sentence
-- false the day it shipped. The app's Sentry config already refuses to send
-- more than a pseudonymous id (`sendDefaultPii: false`). The house posture is
-- consistent and deliberate, and the funnel is not worth breaking it for.
--
-- ── WHY THIS SHAPE ──────────────────────────────────────────────────────────
-- There is no row per person and no row per event. There is a COUNTER per day
-- per (event, feature, rank, standing). No user id, no device id, no session
-- id, no timestamp finer than a day — so there is nothing here to join back to
-- a member, by us or by anyone who ever reads this table.
--
-- The funnel is still fully answerable, because every event already carries
-- the door it came from:
--
--     taps('the-archive') → opens('the-archive') → purchases('the-archive')
--
-- "Which rope leads to a rank" is a ratio of counts. It never needed a name.
--
-- ── AND IT CANNOT GROW WITHOUT BOUND ────────────────────────────────────────
-- `feature_id` arrives from the client, and after The Reel opens, some of
-- those clients are strangers holding only the anon key. A closed event
-- vocabulary, a shape check on the ids, and a hard ceiling of 500 rows per day
-- (anything past it folds into 'other') mean the worst a hostile caller can do
-- is make the numbers wrong — never make the table large.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.gate_metrics (
  day         date   NOT NULL DEFAULT current_date,
  event       text   NOT NULL,
  -- '' rather than NULL throughout: these five columns are the primary key, and
  -- NULLs in a key make every upsert a duplicate.
  feature_id  text   NOT NULL DEFAULT '',
  rank        text   NOT NULL DEFAULT '',
  standing    text   NOT NULL DEFAULT '',
  count       bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event, feature_id, rank, standing)
);

COMMENT ON TABLE public.gate_metrics IS
  'Aggregate gate funnel. Counters only — no member, device or session is identifiable here, by design.';

-- Deny by default. RLS on with no policy at all means anon and authenticated
-- read nothing; the counts are read from the dashboard as service_role. The
-- writer below is SECURITY DEFINER and so is unaffected.
ALTER TABLE public.gate_metrics ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.gate_metrics FROM PUBLIC;
REVOKE ALL ON TABLE public.gate_metrics FROM anon, authenticated;

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
  IF p_event NOT IN ('gate_tapped', 'membership_opened', 'rank_purchased', 'rank_relinquished') THEN
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
  'Increments an aggregate gate counter. Records no identity of any kind.';

REVOKE ALL ON FUNCTION public.record_gate_event(text, text, text, text) FROM PUBLIC;
-- Strangers meet ropes too, once The Reel is open to them, and a stranger
-- tapping a rope is the single most informative event in the whole funnel.
GRANT EXECUTE ON FUNCTION public.record_gate_event(text, text, text, text) TO anon, authenticated;
