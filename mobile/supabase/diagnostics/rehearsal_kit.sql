-- ════════════════════════════════════════════════════════════════════════════
-- rehearsal_kit.sql — what every *_rehearsal.sql shares. Each includes it on the
-- line after its BEGIN, so all of it is temporary and goes with the rollback.
-- ════════════════════════════════════════════════════════════════════════════
--   pg_temp.rh_case(label, expected, got)   prints  label|expected|got  and
--                                           records a miss when got is not expected
--   pg_temp.rh_found(what, value)           the value, or the run stops naming
--                                           what it could not find
--   pg_temp.rh_need(what, have, need)       the same for a count of rows
--   pg_temp.rh_verdict()                    the last statement before ROLLBACK
--
-- A case over nothing is a failure, never a pass: a pick that finds no row
-- stops the run, and a file in which no case ran fails its verdict. The verdict
-- names every miss and raises, so psql (ON_ERROR_STOP) exits non-zero and the
-- transaction ends without a commit; with no miss it says how many cases held.
-- No transaction control here: one COMMIT or ROLLBACK would end the file's own.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE rh_cases (n serial, label text, expected text, got text, missed boolean) ON COMMIT DROP;
GRANT ALL ON rh_cases TO anon, authenticated;
GRANT USAGE ON SEQUENCE rh_cases_n_seq TO anon, authenticated;

CREATE FUNCTION pg_temp.rh_case(label text, expected text, got text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '%|%|%', label, expected, got;
  INSERT INTO rh_cases (label, expected, got, missed) VALUES (label, expected, got, got IS DISTINCT FROM expected);
END $$;

CREATE FUNCTION pg_temp.rh_found(what text, value anyelement) RETURNS anyelement LANGUAGE plpgsql AS $$
BEGIN
  IF value IS NULL THEN RAISE EXCEPTION 'REHEARSAL CANNOT RUN: found no %', what; END IF;
  RETURN value;
END $$;

CREATE FUNCTION pg_temp.rh_need(what text, have bigint, need bigint) RETURNS bigint LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(have, 0) < need THEN
    RAISE EXCEPTION 'REHEARSAL CANNOT RUN: needs % %, found %', need, what, coalesce(have, 0);
  END IF;
  RETURN have;
END $$;

CREATE FUNCTION pg_temp.rh_verdict() RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  cases integer := (SELECT count(*) FROM rh_cases);
  misses integer := (SELECT count(*) FROM rh_cases WHERE missed);
BEGIN
  IF cases = 0 THEN RAISE EXCEPTION 'REHEARSAL FAILED: no case ran'; END IF;
  IF misses > 0 THEN
    RAISE EXCEPTION 'REHEARSAL FAILED: % of % cases missed: %', misses, cases,
      (SELECT string_agg(label || ' (expected ' || coalesce(expected, 'null') || ', got ' || coalesce(got, 'null') || ')',
                         '; ' ORDER BY n) FROM rh_cases WHERE missed);
  END IF;
  RETURN format('REHEARSAL PASSED: %s cases', cases);
END $$;

GRANT EXECUTE ON FUNCTION pg_temp.rh_case(text, text, text), pg_temp.rh_found(text, anyelement),
  pg_temp.rh_need(text, bigint, bigint), pg_temp.rh_verdict() TO anon, authenticated;
