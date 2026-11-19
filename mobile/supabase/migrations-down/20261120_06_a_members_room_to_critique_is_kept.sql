-- Undo of 20261120_06: each member's room to critique is kept, in one row, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A3's table undone · run after H-A3's rule is undone (it no longer names it) ──
DROP TABLE IF EXISTS public.critique_budget;
