-- Undo of 20261119_08: a Vault note written earlier never lands over one written later, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A1 undone · the note's forms that carry the moment it was written are taken away ──
-- The three-argument viewing_note_set and one-argument viewing_note_remove were never changed.
DROP FUNCTION IF EXISTS public.viewing_note_remove(uuid, timestamptz);
DROP FUNCTION IF EXISTS public.viewing_note_set(uuid, uuid, text, timestamptz);
