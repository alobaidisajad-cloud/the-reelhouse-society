-- Undo of 20261122_09: the follow list in one trip, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (1): no shipped client uses it: the function this car made (TestFlight build 41 and the website read the pages)
DROP FUNCTION IF EXISTS public.get_my_follows();
