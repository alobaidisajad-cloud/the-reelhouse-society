-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_22 — the words a member reported are kept as they stood when the report was filed.
-- ════════════════════════════════════════════════════════════════════════════
--   1. The words a report is about are kept in reported_words, for 20261120_23 to write and the Tribunal to
--      read (review round 14).
--   A car of its own: its key holds public.reports (SHARE ROW EXCLUSIVE, as a foreign key is made) to
--   this car's commit, so a member filing a report waits only for these few statements. No client reads
--   or writes it.
-- Undo: mobile/supabase/migrations-down/20261120_22_the_reported_words_are_kept.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-B5's table · the words a member reported, kept as they stood when the report was filed (review round 14) ──
--   Made in a piece of its own, before H-B5's functions: its key holds public.reports (SHARE ROW
--   EXCLUSIVE, as a foreign key is made) to the commit, so a member filing a report waits only for these
--   few statements, never for the functions' car. A report's words go with the report.
--   reported_words: one row per report, written by submit_report alone as the report is filed: the
--     piece's title and words (and, for a page or a salon, its name, picture and cover) as they stood.
--     The Tribunal reads them beside the piece as it stands now (get_report_evidence), so an author who
--     edits or deletes what was reported before the verdict cannot hand the moderator a clean exhibit.
--   No client reads or writes it: row security on, no rule, no grant. A reporter never reads it back
--   (a report could name a piece its reporter cannot read; its words stay the house's).

-- add-only (1): no shipped client uses it: a table made here, named by neither TestFlight build 41 nor the website
CREATE TABLE public.reported_words (
    report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
    words jsonb NOT NULL,
    taken_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT reported_words_pkey PRIMARY KEY (report_id),
    CONSTRAINT reported_words_words_len CHECK ((char_length((words)::text) <= 200000))
);
ALTER TABLE public.reported_words ENABLE ROW LEVEL SECURITY;
-- add-only (1): no shipped client uses it: a table made here, read by neither TestFlight build 41 nor the website
REVOKE ALL ON TABLE public.reported_words FROM anon, authenticated;

COMMENT ON TABLE public.reported_words IS 'The words a report is about, as they stood when it was filed (submit_report). Read by the Tribunal beside the piece as it stands now (get_report_evidence). The house''s alone: no client reads or writes it.';
