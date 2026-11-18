-- Undo of 20261119_15: a sealed stack is never shown in a salon, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── B3 undone · the functions of a sealed stack's cards (their triggers go first, with B3.locks.down) ──
--   The cards turned sealed stay sealed: their words were the stack's, which its curator sealed; an
--   undo that wrote them back would show a sealed stack in a salon again.
-- add-only (1): no shipped client uses it: a trigger's function round 13 made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_sealed_stack_is_not_shared();
-- add-only (1): no shipped client uses it: a trigger's function round 13 made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_sealed_stack_takes_its_cards();
