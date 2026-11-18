-- Undo of 20261118_03: its triggers go, and the notices' channel rule is as 20261015_01 made it; the
-- triggers' functions stay until 20261118_01's undo, which made them.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── G-B7's trigger undone · every notice written, a hidden member's too (its function goes with 20261118_01's undo) ──
-- add-only (1): no shipped client uses it: a trigger round 12 made (TestFlight build 41 and the website checked)
DROP TRIGGER IF EXISTS a_hidden_members_word_is_not_written ON public.notifications;

-- ── G-B5's trigger and channel rule undone · the phone hears only new notices, the channel as 20261015_01 made it ──
-- add-only (1): no shipped client uses it: a trigger round 12 made (TestFlight build 41 and the website checked)
DROP TRIGGER IF EXISTS a_notice_gone_is_told ON public.notifications;
-- add-only (1): no shipped client uses it: the notices:<member> topic round 12 opened, which TestFlight build 41 and the website never join
ALTER POLICY "members receive the notices channel" ON realtime.messages
    USING (realtime.topic() = 'global_notifications');

-- ── G-B2's trigger undone · a follow's notice stands after an unfollow (its function goes with 20261118_01's undo) ──
-- add-only (1): no shipped client uses it: a trigger round 12 made (TestFlight build 41 and the website checked)
DROP TRIGGER IF EXISTS a_follow_takes_its_notice ON public.interactions;

-- ── G-B1's trigger undone · a salon request's notice stands after its answer (its function goes with 20261118_01's undo) ──
-- add-only (1): no shipped client uses it: a trigger round 12 made (TestFlight build 41 and the website checked)
DROP TRIGGER IF EXISTS a_salon_request_takes_its_notice ON public.lounge_members;
