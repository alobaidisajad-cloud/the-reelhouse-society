-- Undo of 20261119_21: a sealed stack takes its cards: round 13's triggers on the salons' messages and the stacks, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── B3's triggers undone · a sealed stack may be shared, and sealing leaves its cards (their functions go with B3.down) ──
-- add-only (1): no shipped client uses it: a trigger round 13 made (TestFlight build 41 and the website checked)
DROP TRIGGER IF EXISTS a_sealed_stack_is_not_shared ON public.lounge_messages;
-- add-only (1): no shipped client uses it: a trigger round 13 made (TestFlight build 41 and the website checked)
DROP TRIGGER IF EXISTS a_sealed_stack_takes_its_cards ON public.lists;
