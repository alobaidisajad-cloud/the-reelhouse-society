-- Undo of 20261120_22: the words a member reported are kept as they stood when the report was filed, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-B5's table, undone: the reported words are no longer kept ──
-- add-only (1): no shipped client uses it: the table H-B5.table made, named by neither TestFlight build 41 nor the website
DROP TABLE IF EXISTS public.reported_words;
