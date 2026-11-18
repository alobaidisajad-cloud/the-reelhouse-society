-- Undo of 20261118_00: the notices' kinds as the snapshot holds them, after 20261118_01's undo wrote the
-- two new kinds back as 'system'.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── G-B6's kinds undone · the notices' kinds as the snapshot holds them ─────────────────────────
--   Run after 20261118_01's undo, which wrote every notice of the two kinds back as 'system'.
-- add-only (1): no shipped client uses it: the two kinds round 12 added, which no notice holds once 20261118_01's undo has run (TestFlight build 41 and the website checked)
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
-- add-only (3): it only fixes: the kinds as the snapshot holds them, every notice left one of them by 20261118_01's undo, replayed by the snapshot's own rehearsals
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['follow'::text, 'endorse'::text, 'comment'::text, 'annotate'::text, 'retransmit'::text, 'system'::text, 'reaction'::text, 'follow_request'::text, 'follow_accept'::text, 'moderation'::text, 'featured'::text])));
