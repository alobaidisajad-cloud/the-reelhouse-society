-- Undo of 20261120_10: a card in a salon is written by the house: round 14's trigger on the salons' messages, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A4.locks undone · cards written as their sharer sends them again ──
DROP TRIGGER IF EXISTS a_shared_card_is_the_houses ON public.lounge_messages;
