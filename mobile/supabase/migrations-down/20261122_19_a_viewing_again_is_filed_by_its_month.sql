-- Undo of 20261122_19: the keys of a viewing's month dropped. Undo 20261122_21 and _20 first: the index
-- is built on these keys and the reads of a span ask them.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (1): no shipped client uses it: a function this car made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS private.viewing_months_between(uuid, date, date);
-- add-only (1): no shipped client uses it: a function this car made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS private.viewing_months(uuid, jsonb, timestamptz);
