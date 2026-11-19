-- Undo of 20261120_30: a piece the house removed is kept whole until its appeal is judged, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-B10's table, undone ──
-- add-only (1): no shipped client uses it: the table H-B10.table made, named by neither TestFlight build 41 nor the website
DROP TABLE IF EXISTS public.withheld_pieces;
-- add-only (1): no shipped client uses it: the column H-B10.table made, named by neither TestFlight build 41 nor the website
ALTER TABLE public.mod_actions DROP COLUMN IF EXISTS appeal_put_back;
