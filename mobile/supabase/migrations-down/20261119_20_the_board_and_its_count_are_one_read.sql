-- Undo of 20261119_20: the notices board and its unread count are read in one moment, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A6 undone · the board is read as two reads again (the phone reads them when the form is gone) ──
DROP FUNCTION IF EXISTS public.notices_page(integer);
