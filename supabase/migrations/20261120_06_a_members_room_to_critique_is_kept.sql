-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_06 — each member's room to critique is kept, in one row.
-- ════════════════════════════════════════════════════════════════════════════
--   1. The pace of a member's critiques (20261120_07, 20261120_08) is kept per member in critique_budget
--      (review round 14).
--   A car of its own, first: its key holds auth.users (SHARE ROW EXCLUSIVE, as a foreign key is made) to
--   this car's commit, so a member signing in waits only for these few statements. No client reads or
--   writes it.
-- Undo: mobile/supabase/migrations-down/20261120_06_a_members_room_to_critique_is_kept.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A3's table · each member's room to critique, kept in one row (review round 14) ───────────────
--   Made in a piece of its own, before H-A3's rule: its key holds auth.users (SHARE ROW EXCLUSIVE, as a
--   foreign key is made) to the commit, so a member signing in waits only for these few statements,
--   never for the rule's car. A member's row goes with their account.
--   critique_budget: one row per member, written by check_critique_pace alone in one statement per
--     critique (on a record, a stack or a filing): the room left to critique (tokens, up to 30, one more
--     every 20 seconds, from refilled_at), and the day's critiques (n, the house's UTC day).
--     swept_at: when the member's critique rows of interaction_churn (one per piece critiqued, counted
--     within the hour) were last let go (once an hour at most).
--   No client reads or writes it: row security on, no rule, no grant.

-- add-only (1): no shipped client uses it: a table made here, named by neither TestFlight build 41 nor the website
CREATE TABLE public.critique_budget (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tokens real NOT NULL,
    refilled_at timestamp with time zone NOT NULL,
    day date NOT NULL,
    n integer NOT NULL DEFAULT 0,
    swept_at timestamp with time zone NOT NULL,
    CONSTRAINT critique_budget_pkey PRIMARY KEY (user_id)
);
ALTER TABLE public.critique_budget ENABLE ROW LEVEL SECURITY;
-- add-only (1): no shipped client uses it: a table made here, read by neither TestFlight build 41 nor the website
REVOKE ALL ON TABLE public.critique_budget FROM anon, authenticated;
