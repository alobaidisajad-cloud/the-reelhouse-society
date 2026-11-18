-- Undo of 20261119_01: a phone's push token names the session it was registered under, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── B1's column undone · a token names no session (its functions go first, with B1.down.sql) ──
-- add-only (1): no shipped client uses it: a column round 13 made (TestFlight build 41 and the website checked)
ALTER TABLE public.push_tokens DROP COLUMN IF EXISTS session_id;
