-- ════════════════════════════════════════════════════════════════════════════
-- 20261118_03 — the notices follow what happens: round 12's triggers on the tables members write.
-- ════════════════════════════════════════════════════════════════════════════
--   20261118_01 made their functions and ran the one-time statements; this car hangs them on their tables,
--   alone, so each table is held (SHARE ROW EXCLUSIVE) only from its trigger to the end of this car, in
--   the train and in its rehearsal (e2e/load/train-locks.mjs):
--   1. a salon request answered, declined, withdrawn or dissolved takes its notice (lounge_members);
--   2. a follow taken back takes its notice (interactions);
--   3. a notice taken back is told to its member's phone (notifications), and each signed-in member
--      may receive their own notices topic (the channel's rule on realtime.messages);
--   4. no notice is written from a member hidden from its reader (notifications).
--   The same train run applies it right after 20261118_01: what 20261118_01 swept once (the notices of requests
--   answered and follows taken back) can be left by a member's act only in the seconds between the two
--   cars, as every one was before. A train that stops between them is run again, and this car is its
--   first.
-- Undo: mobile/supabase/migrations-down/20261118_03_the_notices_follow_what_happens.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- G-B1's trigger (a salon request answered takes its notice), on the function 20261118_01 made: it
-- holds the seats (SHARE ROW EXCLUSIVE) only from here to this car's commit.
-- add-only (3): it only fixes: a salon request answered, declined, withdrawn or dissolved takes its notice, every other write to lounge_members as before; replayed as the members themselves (G-B1 rehearsal)
CREATE OR REPLACE TRIGGER a_salon_request_takes_its_notice
  AFTER DELETE OR UPDATE OF status ON public.lounge_members
  FOR EACH ROW
  WHEN (OLD.status = 'pending')
  EXECUTE FUNCTION public.a_salon_request_takes_its_notice();

-- G-B2's trigger (a follow taken back takes its notice), on the function 20261118_01 made: it holds
-- the follows (SHARE ROW EXCLUSIVE) only from here to this car's commit.
-- add-only (3): it only fixes: a follow taken back takes its notice, every other write to interactions as before; replayed as the members themselves (G-B2 rehearsal)
CREATE OR REPLACE TRIGGER a_follow_takes_its_notice
  AFTER DELETE ON public.interactions
  FOR EACH ROW
  WHEN (OLD.type = 'follow')
  EXECUTE FUNCTION public.a_follow_takes_its_notice();

-- G-B5's trigger (a notice taken back is heard), on the function 20261118_01 made, and the notices'
-- channel rule: they hold the notices (SHARE ROW EXCLUSIVE) and the channel's messages only from here
-- to this car's commit.
-- add-only (3): it only fixes: a notice deleted is told to its member's phone, every delete itself as before; replayed as the members themselves (G-B5 rehearsal)
CREATE OR REPLACE TRIGGER a_notice_gone_is_told
  AFTER DELETE ON public.notifications
  REFERENCING OLD TABLE AS gone
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.a_notice_gone_is_told();

-- The notices' channel, as 20261015_01 made it, and each member's own topic beside it.
-- add-only (3): it only widens: a signed-in member still receives the notices channel, and now their own notices:<member> topic alone; replayed as the members themselves (G-B5 rehearsal)
ALTER POLICY "members receive the notices channel" ON realtime.messages
    USING (realtime.topic() = 'global_notifications' OR realtime.topic() = 'notices:' || (( SELECT auth.uid() AS uid))::text);

-- G-B7's trigger (no notice across a block), on the function 20261118_01 made: it holds the notices
-- (SHARE ROW EXCLUSIVE) only from here to this car's commit.
-- add-only (3): it only fixes: a notice from a member hidden from its reader is not written, every other notice written as before; replayed as the members themselves (G-B7 rehearsal); TestFlight build 41 and the website never write a notice
CREATE OR REPLACE TRIGGER a_hidden_members_word_is_not_written
  BEFORE INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.a_hidden_members_word_is_not_written();
