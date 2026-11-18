-- ════════════════════════════════════════════════════════════════════════════
-- 20261117_00 — the house remembers each push: the table round 11's certifications push by.
-- ════════════════════════════════════════════════════════════════════════════
--   certifications_pushed (F11), made before 20261117_01, which fills it and whose tg_notify_push writes
--   it. A car of its own because its two keys hold auth.users (SHARE ROW EXCLUSIVE) from their
--   statement to the commit: here that is this car's few statements and its small rehearsal, so a
--   member signing in waits milliseconds, never for 20261117_01's sweeps and cases. No client reads or
--   writes it.
-- Undo: mobile/supabase/migrations-down/20261117_00_the_house_remembers_each_push.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── F11's table · the house's memory of the pushes it sent (review round 11) ──────────────────────
--   Made in a car of its own, before 20261117_01: its two keys hold auth.users (SHARE ROW EXCLUSIVE,
--   as a foreign key is made) to the commit, so a member signing in waits only for this car, never
--   for 20261117_01's functions, sweeps and rehearsal. 20261117_01 fills it (the certifications told
--   already) and tg_notify_push writes it. No client reads or writes it: row security on, no rule.
-- add-only (1): no shipped client uses it: a table made here, named by neither TestFlight build 41 nor the website
CREATE TABLE public.certifications_pushed (
    from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    thing text NOT NULL,
    pushed_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT certifications_pushed_pkey PRIMARY KEY (from_user_id, thing),
    CONSTRAINT certifications_pushed_thing_len CHECK (char_length(thing) <= 200)
);
-- The certified member's rows, found when their account goes.
CREATE INDEX certifications_pushed_user_id ON public.certifications_pushed (user_id);
ALTER TABLE public.certifications_pushed ENABLE ROW LEVEL SECURITY;
-- add-only (1): no shipped client uses it: a table made here, read by neither TestFlight build 41 nor the website
REVOKE ALL ON TABLE public.certifications_pushed FROM anon, authenticated;
