-- ════════════════════════════════════════════════════════════════════════════
-- a_viewing_again_is_filed_by_its_month_rehearsal.sql — 20261122_19. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_viewing_again_is_filed_by_its_month_rehearsal.sql
--
-- 20261122_19 is applied on production (the train of 2026-11-23); this shows it still holds there, and on every sealed copy.
-- On histories it makes
-- (dates written as days, as moments, as no day at all, a 29th to a 31st, a month past 12, the year 0,
-- a digit not from 0 to 9, no date, a viewing that is not an object), each made at the last half hour of
-- a month in UTC and in its middle, read on three clocks (UTC, fourteen hours east, twelve west): the
-- month of every day member_viewings gives a viewing is among the log's keys; a log of three viewings
-- in one month holds one key; and the keys of a span are its months, the first and last among them.
-- Nothing is written. Read each NOTICE as  case|expected|got ; the last line is the verdict, and any
-- miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- The histories, and the moments their logs were made.
CREATE TEMP TABLE vm_history ON COMMIT DROP AS
SELECT h.n, h.history FROM (VALUES
  (1, '[{"date": "2025-03-14"}, {"date": "2025-03-02"}, {"date": "2025-03-28"}]'::jsonb),
  (2, '[{"date": "2024-02-29"}, {"date": "2025-02-29"}, {"date": "2025-04-31"}]'::jsonb),
  (3, '[{"date": "2025-13-01"}, {"date": "0000-06-01"}, {"date": "2025-1٢-01"}]'::jsonb),
  (4, '[{"date": "2025-06-30T23:59:00Z"}, {"date": "June 2025"}, {}, {"rating": 4}]'::jsonb),
  (5, '[{"date": 20250601}, "2025-06-01", 7, {"date": null}, {"date": "2025-12-31"}]'::jsonb),
  (6, '[{}]'::jsonb),
  (7, '[{"date": null, "rating": 3}]'::jsonb),
  (8, '[{"date": "2025-01-15"}, {"rating": 3}]'::jsonb)
) h(n, history);
CREATE TEMP TABLE vm_made ON COMMIT DROP AS
SELECT m.at FROM (VALUES
  ('2025-03-31 23:30:00+00'::timestamptz), ('2025-04-01 00:30:00+00'::timestamptz),
  ('2025-12-31 23:30:00+00'::timestamptz), ('2025-06-15 12:00:00+00'::timestamptz)
) m(at);

-- The days member_viewings gives the earlier viewings of one history made at one moment, on the
-- session's clock now (its own expression).
CREATE FUNCTION pg_temp.vm_days(p_history jsonb, p_created timestamptz) RETURNS date[] LANGUAGE sql STABLE AS $$
  SELECT coalesce(array_agg(COALESCE(CASE WHEN e->>'date' ~ '^\d{4}-\d{2}-\d{2}' AND pg_input_is_valid(left(e->>'date', 10), 'date')
                                          THEN left(e->>'date', 10)::date END,
                                     p_created::date)), '{}')
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_history) = 'array' THEN p_history ELSE '[]'::jsonb END) e
   WHERE jsonb_typeof(e) = 'object'
$$;

-- Each day, on each clock, whose month is not among its log's keys.
CREATE FUNCTION pg_temp.vm_missed() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_clock text; v_missed text[] := '{}'; v_owner uuid := '00000000-0000-4000-8000-0000000000aa';
BEGIN
  FOREACH v_clock IN ARRAY ARRAY['UTC', 'Pacific/Kiritimati', 'Etc/GMT+12'] LOOP
    PERFORM set_config('TimeZone', v_clock, true);
    v_missed := v_missed || ARRAY(
      SELECT v_clock || ' ' || h.n || ' ' || m.at::text || ' ' || d::text
        FROM vm_history h CROSS JOIN vm_made m
       CROSS JOIN LATERAL unnest((SELECT pg_temp.vm_days(h.history, m.at))) d
       WHERE NOT (v_owner::text || '/' || to_char(d, 'YYYY-MM')) = ANY (private.viewing_months(v_owner, h.history, m.at)));
  END LOOP;
  PERFORM set_config('TimeZone', 'UTC', true);
  RETURN coalesce(nullif(array_to_string(v_missed, '; '), ''), 'none');
END $$;

SELECT pg_temp.rh_need('days to file', (SELECT count(*) FROM vm_history h CROSS JOIN vm_made m CROSS JOIN LATERAL unnest((SELECT pg_temp.vm_days(h.history, m.at))) d), 40) AS done \gset rh_
SELECT pg_temp.rh_case('every day member_viewings gives an earlier viewing, on every clock, is in a month among its log''s keys', 'none',
  (SELECT pg_temp.vm_missed())) AS done \gset rh_
SELECT pg_temp.rh_case('three viewings written in one month are one key', '{00000000-0000-4000-8000-0000000000aa/2025-03}',
  private.viewing_months('00000000-0000-4000-8000-0000000000aa', (SELECT history FROM vm_history WHERE n = 1), '2025-06-15 12:00:00+00')::text) AS done \gset rh_
SELECT pg_temp.rh_case('a log seen once, or with a history that is no list, holds no key', '{}|{}',
  private.viewing_months('00000000-0000-4000-8000-0000000000aa', '[]', now())::text || '|'
    || private.viewing_months('00000000-0000-4000-8000-0000000000aa', '{"date": "2025-01-01"}', now())::text) AS done \gset rh_
SELECT pg_temp.rh_case('the keys of a span are each month it touches, the first and the last', '{00000000-0000-4000-8000-0000000000aa/2024-11,00000000-0000-4000-8000-0000000000aa/2024-12,00000000-0000-4000-8000-0000000000aa/2025-01}',
  private.viewing_months_between('00000000-0000-4000-8000-0000000000aa', '2024-11-30', '2025-01-01')::text) AS done \gset rh_
SELECT pg_temp.rh_case('a year''s span is its twelve months; the grid''s 366 days, thirteen', '12|13',
  cardinality(private.viewing_months_between('00000000-0000-4000-8000-0000000000aa', '2025-01-01', '2025-12-31'))::text || '|'
    || cardinality(private.viewing_months_between('00000000-0000-4000-8000-0000000000aa', date '2025-11-22' - 364, date '2025-11-22' + 1))::text) AS done \gset rh_
SELECT pg_temp.rh_case('no member or visitor asks the keys through the API: they are in the private schema alone', 'private|private',
  (SELECT string_agg(DISTINCT n.nspname, '|') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'viewing_months') || '|'
    || (SELECT string_agg(DISTINCT n.nspname, '|') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE p.proname = 'viewing_months_between')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
