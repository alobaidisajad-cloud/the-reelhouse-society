-- Undo of 20261109_02: the Lounge's corridor read in its two waves again.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (1): no shipped client uses it: a function 20261109_02 makes, named by no client before it (TestFlight build 41 and the website checked)
DROP FUNCTION public.get_lounge_list();
