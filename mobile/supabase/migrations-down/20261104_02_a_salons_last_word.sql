-- ════════════════════════════════════════════════════════════════════════════
-- Undo of 20261104_02 — the function it made, gone.
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DROP FUNCTION public.get_salon_last_words(uuid[]);
