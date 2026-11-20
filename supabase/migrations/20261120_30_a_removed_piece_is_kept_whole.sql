-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_30 — a piece the house removed is kept whole until its appeal is judged.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A REMOVE CONTENT deleted its piece at once, so an appeal overturned could give back only the
--      words: withheld_pieces keeps each piece withheld, until when, and the notices set aside, for
--      20261120_32 to write (review round 14).
--   A car of its own: its key holds public.mod_actions (SHARE ROW EXCLUSIVE, as a foreign key is made) to
--   this car's commit; no member writes mod_actions. No client reads or writes it. A column on
--   mod_actions (appeal_put_back), empty, for 20261120_27's and 20261120_32's functions: an instant's hold.
-- Undo: mobile/supabase/migrations-down/20261120_30_a_removed_piece_is_kept_whole.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-B10's table · a piece the house removed is withheld, whole, until its appeal is judged (review round 14) ──
--   Made in a piece of its own, before H-B10's columns and functions: its key holds public.mod_actions
--   (SHARE ROW EXCLUSIVE, as a foreign key is made) to the commit; no member writes mod_actions, so no
--   member waits.
--   withheld_pieces: one row per REMOVE CONTENT of a log, a stack, a critique or a filing, written by
--     the verdict (withhold_piece): which piece, whose, and until when it is kept whole unappealed
--     (delete_after: the verdict's moment and 30 days; none once an appeal is filed, the piece then kept
--     until the appeal is heard); and the notices of it that other members held (notices), set aside
--     while it is withheld and written back if the verdict is overturned. Gone with its verdict.
--   No client reads or writes it: row security on, no rule, no grant. A piece is withheld once at a time
--   (one row per piece), so the evidence asks "is this piece withheld" of its own key.
--   mod_actions.appeal_put_back: whether the overturn of a removal put the piece back where it stood (a
--   withheld piece given back whole, a salon message, a filing, a page or a salon's words put back),
--   written by judge_appeal as it hears the appeal; the verdict sheet reads it, never the register,
--   which goes when the piece is given back. Empty for every verdict until an overturn writes it.

-- add-only (1): no shipped client uses it: a table made here, named by neither TestFlight build 41 nor the website
CREATE TABLE public.withheld_pieces (
    mod_action_id uuid NOT NULL REFERENCES public.mod_actions(id) ON DELETE CASCADE,
    kind text NOT NULL,
    piece_id uuid NOT NULL,
    author_id uuid,
    withheld_at timestamp with time zone NOT NULL DEFAULT now(),
    delete_after timestamp with time zone,
    notices jsonb NOT NULL DEFAULT '[]'::jsonb,
    CONSTRAINT withheld_pieces_pkey PRIMARY KEY (mod_action_id),
    CONSTRAINT withheld_pieces_kind_check CHECK ((kind = ANY (ARRAY['log'::text, 'list'::text, 'log_comment'::text, 'list_comment'::text, 'dispatch_comment'::text, 'dispatch_post'::text]))),
    CONSTRAINT withheld_pieces_notices_len CHECK ((char_length((notices)::text) <= 200000))
);
CREATE INDEX withheld_pieces_author ON public.withheld_pieces USING btree (author_id);
CREATE UNIQUE INDEX withheld_pieces_piece ON public.withheld_pieces USING btree (kind, piece_id);
CREATE INDEX withheld_pieces_due ON public.withheld_pieces USING btree (delete_after) WHERE (delete_after IS NOT NULL);
ALTER TABLE public.withheld_pieces ENABLE ROW LEVEL SECURITY;
-- add-only (1): no shipped client uses it: a table made here, read by neither TestFlight build 41 nor the website
REVOKE ALL ON TABLE public.withheld_pieces FROM anon, authenticated;

-- add-only (3): it only widens: a column no shipped client names, empty for every verdict until an appeal is overturned; TestFlight build 41 and the website read mod_actions by named columns, replayed as the members themselves (H-B10.table rehearsal)
ALTER TABLE public.mod_actions ADD COLUMN IF NOT EXISTS appeal_put_back boolean;
COMMENT ON COLUMN public.mod_actions.appeal_put_back IS 'Whether the overturn of a removal put the piece back where it stood (judge_appeal). Read by the member''s verdict sheet.';

COMMENT ON TABLE public.withheld_pieces IS 'Each piece a REMOVE CONTENT withholds (a log, a stack, a critique, a filing): kept whole, seen by its author and the Tribunal alone, until its appeal is upheld or 30 days pass unappealed (then deleted), or the verdict is overturned (then given back whole, with the notices set aside here). The house''s alone.';

-- The new columns' statistics, gathered now: adding a column changes no row, so nothing else gathers
-- them soon, and the planner guesses at a column it has none for.
ANALYZE public.mod_actions (appeal_put_back);
