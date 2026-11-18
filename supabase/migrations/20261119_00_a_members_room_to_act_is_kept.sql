-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_00 — a member's room to act is kept, in tables of its own.
-- ════════════════════════════════════════════════════════════════════════════
--   1. The pace of a member's follows and certifications (H-A2, 20261119_07) is kept per member in
--      interaction_budget, and per member and thing acted at in interaction_churn (review round 13).
--   A car of its own, first: each table's key holds auth.users (SHARE ROW EXCLUSIVE, as a foreign key
--   is made) to this car's commit, so a member signing in waits only for these few statements. No
--   client reads or writes either table.
-- Undo: mobile/supabase/migrations-down/20261119_00_a_members_room_to_act_is_kept.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A2's tables · each member's room to act, kept in one row, and their acts at one thing (review round 13) ──
--   Made in a piece of its own, before H-A2's rule: each table's key holds auth.users (SHARE ROW EXCLUSIVE,
--   as a foreign key is made) to the commit, so a member signing in waits only for these few
--   statements, never for the rule's car. A member's rows go with their account.
--   interaction_budget: one row per member, written by check_interaction_rate_limit alone in one
--     statement per follow or certification: the room left to act (tokens, up to 120, one more every
--     2 seconds, from refilled_at), and the day's follows and certifications (the house's UTC day).
--     swept_at: when the member's old rows of interaction_churn were last let go (once an hour at most).
--   interaction_churn: one row per member and thing acted at (a member followed, a record or a stack
--     certified): how many times within the hour that began at since.
--   No client reads or writes either: row security on, no rule, no grant.

-- add-only (1): no shipped client uses it: a table made here, named by neither TestFlight build 41 nor the website
CREATE TABLE public.interaction_budget (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tokens real NOT NULL,
    refilled_at timestamp with time zone NOT NULL,
    day date NOT NULL,
    follows integer NOT NULL DEFAULT 0,
    certs integer NOT NULL DEFAULT 0,
    swept_at timestamp with time zone NOT NULL,
    CONSTRAINT interaction_budget_pkey PRIMARY KEY (user_id)
);
ALTER TABLE public.interaction_budget ENABLE ROW LEVEL SECURITY;
-- add-only (1): no shipped client uses it: a table made here, read by neither TestFlight build 41 nor the website
REVOKE ALL ON TABLE public.interaction_budget FROM anon, authenticated;

-- add-only (1): no shipped client uses it: a table made here, named by neither TestFlight build 41 nor the website
CREATE TABLE public.interaction_churn (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target text NOT NULL,
    since timestamp with time zone NOT NULL,
    n integer NOT NULL,
    CONSTRAINT interaction_churn_pkey PRIMARY KEY (user_id, target),
    CONSTRAINT interaction_churn_target_len CHECK (char_length(target) <= 100)
);
ALTER TABLE public.interaction_churn ENABLE ROW LEVEL SECURITY;
-- add-only (1): no shipped client uses it: a table made here, read by neither TestFlight build 41 nor the website
REVOKE ALL ON TABLE public.interaction_churn FROM anon, authenticated;
