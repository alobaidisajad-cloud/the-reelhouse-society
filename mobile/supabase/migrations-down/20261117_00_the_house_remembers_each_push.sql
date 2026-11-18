-- Undo of 20261117_00: the memory of the pushes goes, after 20261117_01's undo has put back the
-- tg_notify_push that never read it.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── F11's table undone · the memory of the pushes goes, with every row in it ─────────────────────
-- add-only (1): no shipped client uses it: a table made in round 11, named by neither TestFlight build 41 nor the website
DROP TABLE IF EXISTS public.certifications_pushed;
