-- Undo of 20261120_01: a guesser rests only their own door, and the member always has a way in, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A1 undone · a handle's attempts no longer counted at the house (the function, rolled back first, asks only its pace by address) ──
DROP FUNCTION IF EXISTS public.sign_in_cleared(text, text, boolean, text);
DROP FUNCTION IF EXISTS public.sign_in_unasked(text, text, boolean);
DROP FUNCTION IF EXISTS public.sign_in_attempt(text, text, text);
