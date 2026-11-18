-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_09 — the moment a Vault note was taken away is kept, for its viewing.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A note taken away left no row, so an older note sent later came back: viewing_notes_removed keeps
--      each viewing's latest removal, for viewing_note_set (20261119_10) to stand a note against (review
--      round 13).
--   A car of its own: its key holds public.viewings (SHARE ROW EXCLUSIVE, as a foreign key is made) to
--   this car's commit, so the Vault's viewings wait only for these few statements. No client reads or
--   writes it.
-- Undo: mobile/supabase/migrations-down/20261119_09_a_note_taken_away_keeps_its_moment.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A5's table · the moment a Vault note was taken away, kept for its viewing (review round 13) ──
--   A note taken away left no row, so a note written before the removal and sent later (queued on
--   another phone) found nothing to stand against and came back. viewing_notes_removed keeps, per
--   viewing, the latest moment its member took the note away; viewing_note_set refuses a note
--   written before it (H-A5). The removed note's own row is still deleted, so every reader of notes
--   (the phone, the website, the archive export, the Vault) finds no note there, as before: no
--   reader reads this table.
--   Made in a piece of its own: its key holds public.viewings (SHARE ROW EXCLUSIVE, as a foreign key
--   is made) to the commit, so the Vault's viewings wait only for these few statements. A viewing
--   that goes (its record deleted, a rewatch taken back, an account closed) takes its row with it.
--   No client reads or writes it: row security on, no rule, no grant.

-- add-only (1): no shipped client uses it: a table made here, named by neither TestFlight build 41 nor the website
CREATE TABLE public.viewing_notes_removed (
    viewing_id uuid NOT NULL REFERENCES public.viewings(viewing_id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    removed_at timestamp with time zone NOT NULL,
    CONSTRAINT viewing_notes_removed_pkey PRIMARY KEY (viewing_id)
);
ALTER TABLE public.viewing_notes_removed ENABLE ROW LEVEL SECURITY;
-- add-only (1): no shipped client uses it: a table made here, read by neither TestFlight build 41 nor the website
REVOKE ALL ON TABLE public.viewing_notes_removed FROM anon, authenticated;
