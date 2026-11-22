-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_19 — a film seen again is filed by the months of its earlier viewings.
-- ════════════════════════════════════════════════════════════════════════════
--   A log holds a film's last viewing (watched_date) and its earlier ones (viewing_history), each on
--   its own day. The profile's calendar (calendar_days) and the Year in Cinema (year_viewings) read
--   a member's viewings of one span, but read them through member_viewings, which reads the member's
--   whole record: the whale's calendar read its 10,000 films twice over to keep one year's.
--   A last viewing's day is found by its index (idx_logs_user_watched_id). This car makes what an
--   earlier viewing's month is found by: each log's months, under its member, as keys
--   (private.viewing_months), and the keys of a span (private.viewing_months_between). 20261122_20
--   indexes the keys; 20261122_21 reads the span by them.
-- Undo: mobile/supabase/migrations-down/20261122_19_a_viewing_again_is_filed_by_its_month.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- The keys of a log's earlier viewings: `<member>/<YYYY-MM>`, one for each month any of them may fall
-- in, as member_viewings dates each one. A viewing whose date is written as a day is in that day's
-- month. One whose date is missing, or may not be a day (a 29th, 30th or 31st, a month past 12, the
-- year 0, a digit not from 0 to 9), may be dated by the day the log was made, which member_viewings reads on the session's
-- clock: so it holds the months of the day before and the day after that day in UTC too, every clock
-- within a day of UTC. More keys than viewings, never fewer: a read by them keeps only what it asks.
-- add-only (1): no shipped client uses it: a function this car makes for an index, called by no client
CREATE OR REPLACE FUNCTION private.viewing_months(p_user uuid, p_history jsonb, p_created timestamptz) RETURNS text[]
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT ARRAY(
    SELECT DISTINCT p_user::text || '/' || k.month
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_history) = 'array' THEN p_history ELSE '[]'::jsonb END) e
     CROSS JOIN LATERAL (SELECT e->>'date' AS d) w
     CROSS JOIN LATERAL (SELECT coalesce(w.d ~ '^\d{4}-\d{2}-\d{2}', false) AS written,
                                coalesce(w.d ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|1[0-9]|2[0-8])' AND left(w.d, 4) <> '0000', false) AS sure) s
     CROSS JOIN LATERAL (
       SELECT left(w.d, 7) AS month WHERE s.written
       UNION ALL
       SELECT lpad(extract(year FROM x.day)::int::text, 4, '0') || '-' || lpad(extract(month FROM x.day)::int::text, 2, '0')
         FROM (VALUES ((p_created AT TIME ZONE 'UTC')::date - 1), ((p_created AT TIME ZONE 'UTC')::date + 1)) x(day)
        WHERE NOT s.sure AND p_created IS NOT NULL
     ) k
     WHERE jsonb_typeof(e) = 'object'
  );
$$;

-- The keys of a member's span of days, first to last: one for each month the span touches.
-- add-only (1): no shipped client uses it: a function this car makes for the reads of a span, called by no client
CREATE OR REPLACE FUNCTION private.viewing_months_between(p_user uuid, p_first date, p_last date) RETURNS text[]
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT ARRAY(
    SELECT p_user::text || '/' || lpad(extract(year FROM m)::int::text, 4, '0') || '-' || lpad(extract(month FROM m)::int::text, 2, '0')
      FROM generate_series(date_trunc('month', p_first::timestamp), p_last::timestamp, interval '1 month') m
  );
$$;

-- Read inside the members' own reads (as the member) and by the index: never served by the API.
REVOKE ALL ON FUNCTION private.viewing_months(uuid, jsonb, timestamptz), private.viewing_months_between(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.viewing_months(uuid, jsonb, timestamptz), private.viewing_months_between(uuid, date, date) TO anon, authenticated, service_role;
