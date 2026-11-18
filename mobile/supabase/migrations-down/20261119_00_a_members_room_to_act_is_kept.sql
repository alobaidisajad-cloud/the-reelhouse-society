-- Undo of 20261119_00: a member's room to act is kept, in tables of its own, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A2's tables undone · run after H-A2's rule is undone (it no longer names them) ──
DROP TABLE IF EXISTS public.interaction_churn;
DROP TABLE IF EXISTS public.interaction_budget;
