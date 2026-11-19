-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_15 — each member's salon messages of the day are counted in one row.
-- ════════════════════════════════════════════════════════════════════════════
--   1. The day's ceiling on a member's salon messages (20261120_16, 20261120_17) is counted per member in
--      salon_budget, never by reading the messages back (review round 14).
--   A car of its own: its key holds auth.users (SHARE ROW EXCLUSIVE, as a foreign key is made) to this
--   car's commit, so a member signing in waits only for these few statements. No client reads or writes it.
-- Undo: mobile/supabase/migrations-down/20261120_15_a_members_salon_messages_are_counted_by_the_day.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A8's table · each member's salon messages of the day, counted in one row (review round 14) ──
--   Made in a piece of its own, before H-A8's rule: its key holds auth.users (SHARE ROW EXCLUSIVE, as a
--   foreign key is made) to the commit, so a member signing in waits only for these few statements,
--   never for the rule's car. A member's row goes with their account.
--   salon_budget: one row per member, written by lounge_messages_daily_ceiling alone, one statement
--     per message: how many the member sent on the house's UTC day (n, of day). Counted in a row,
--     never by reading the messages back: a count of the day's messages would read up to the whole
--     ceiling's rows for every message sent.
--   No client reads or writes it: row security on, no rule, no grant.

-- add-only (1): no shipped client uses it: a table made here, named by neither TestFlight build 41 nor the website
CREATE TABLE public.salon_budget (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    day date NOT NULL,
    n integer NOT NULL DEFAULT 0,
    CONSTRAINT salon_budget_pkey PRIMARY KEY (user_id)
);
ALTER TABLE public.salon_budget ENABLE ROW LEVEL SECURITY;
-- add-only (1): no shipped client uses it: a table made here, read by neither TestFlight build 41 nor the website
REVOKE ALL ON TABLE public.salon_budget FROM anon, authenticated;
