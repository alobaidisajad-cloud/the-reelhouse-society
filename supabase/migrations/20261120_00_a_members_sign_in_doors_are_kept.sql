-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_00 — a member's sign-in attempts are kept per door, per member and per phone.
-- ════════════════════════════════════════════════════════════════════════════
--   1. The handle sign-in's count of wrong passwords (20261120_01) is kept in sign_in_doors (per member and
--      door), sign_in_handles (the room every unknown door shares) and sign_in_devices (a hash of each
--      phone's key) (review round 14).
--   A car of its own, first: each table's key holds auth.users (SHARE ROW EXCLUSIVE, as a foreign key
--   is made) to this car's commit, so a member signing in waits only for these few statements. No
--   client reads or writes them.
-- Undo: mobile/supabase/migrations-down/20261120_00_a_members_sign_in_doors_are_kept.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A1's tables · a handle's sign-in attempts, kept per door and per member (review round 14) ──
--   Made in a piece of its own, before H-A1's functions: each table's key holds auth.users (SHARE ROW
--   EXCLUSIVE, as a foreign key is made) to the commit, so a member signing in waits only for these few
--   statements. A member's rows go with their account. No client reads or writes any of them: row
--   security on, no rule, no grant; sign_in_attempt, sign_in_unasked and sign_in_cleared (the sign-in
--   function's, with the service role's key) alone write them.
--   sign_in_doors: per member and door (the address the platform vouches for; IPv6 by its /64), the
--     wrong passwords tried from it within a day and the rest they earned. A guesser rests only their
--     own door. At most 64 doors per member are kept (the least recent let go).
--   sign_in_handles: per member, the room every door not known to them shares (a pail of 20 attempts,
--     one more every 5 minutes): many doors at once are slowed together.
--   sign_in_devices: per member, a hash of each key handed to a phone their right password signed in
--     on (never the key itself); a phone sending its key is not held by the shared pail. Ten per
--     member, each kept 90 days from its last use.

-- add-only (1): no shipped client uses it: a table made here, named by neither TestFlight build 41 nor the website
CREATE TABLE public.sign_in_doors (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    door text NOT NULL,
    misses integer NOT NULL DEFAULT 0,
    last_at timestamp with time zone NOT NULL DEFAULT now(),
    paused_until timestamp with time zone,
    CONSTRAINT sign_in_doors_pkey PRIMARY KEY (user_id, door),
    CONSTRAINT sign_in_doors_door_len CHECK (char_length(door) <= 64)
);
CREATE INDEX IF NOT EXISTS sign_in_doors_last_at ON public.sign_in_doors (last_at);
ALTER TABLE public.sign_in_doors ENABLE ROW LEVEL SECURITY;
-- add-only (1): no shipped client uses it: a table made here, read by neither TestFlight build 41 nor the website
REVOKE ALL ON TABLE public.sign_in_doors FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.sign_in_doors IS 'Per member and door (the vouched address, IPv6 by its /64): wrong passwords tried from it within a day and the rest they earned. Written by sign_in_attempt, sign_in_unasked and sign_in_cleared alone.';

-- add-only (1): no shipped client uses it: a table made here, named by neither TestFlight build 41 nor the website
CREATE TABLE public.sign_in_handles (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tokens real NOT NULL,
    refilled_at timestamp with time zone NOT NULL,
    CONSTRAINT sign_in_handles_pkey PRIMARY KEY (user_id)
);
CREATE INDEX IF NOT EXISTS sign_in_handles_refilled_at ON public.sign_in_handles (refilled_at);
ALTER TABLE public.sign_in_handles ENABLE ROW LEVEL SECURITY;
-- add-only (1): no shipped client uses it: a table made here, read by neither TestFlight build 41 nor the website
REVOKE ALL ON TABLE public.sign_in_handles FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.sign_in_handles IS 'Per member, the attempts every door not known to them shares (20 at once, one more every 5 minutes). Written by sign_in_attempt, sign_in_unasked and sign_in_cleared alone.';

-- add-only (1): no shipped client uses it: a table made here, named by neither TestFlight build 41 nor the website
CREATE TABLE public.sign_in_devices (
    token_hash bytea NOT NULL,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    made_at timestamp with time zone NOT NULL DEFAULT now(),
    used_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT sign_in_devices_pkey PRIMARY KEY (token_hash)
);
CREATE INDEX IF NOT EXISTS sign_in_devices_user ON public.sign_in_devices (user_id, used_at);
CREATE INDEX IF NOT EXISTS sign_in_devices_used_at ON public.sign_in_devices (used_at);
ALTER TABLE public.sign_in_devices ENABLE ROW LEVEL SECURITY;
-- add-only (1): no shipped client uses it: a table made here, read by neither TestFlight build 41 nor the website
REVOKE ALL ON TABLE public.sign_in_devices FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.sign_in_devices IS 'A hash of each key a member''s right password handed a phone (never the key): a phone sending it is not held by the shared pail. Ten per member, kept 90 days from last use. Written by sign_in_attempt and sign_in_cleared alone.';
