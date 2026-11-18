-- Undo of 20261119_09: the moment a Vault note was taken away is kept, for its viewing, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A5's table undone · run after H-A5 is undone (its functions no longer name it) ──
DROP TABLE IF EXISTS public.viewing_notes_removed;
