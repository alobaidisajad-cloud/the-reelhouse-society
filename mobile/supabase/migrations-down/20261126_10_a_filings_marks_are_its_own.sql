-- Undo of 20261126_10_a_filings_marks_are_its_own.sql: the house as the snapshot holds it.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DROP POLICY IF EXISTS saves_ban ON public.dispatch_saves;
DROP TRIGGER IF EXISTS a_vote_is_one_of_its_ballots ON public.dispatch_votes;
DROP FUNCTION IF EXISTS private.a_vote_is_one_of_its_ballots();
DROP TRIGGER IF EXISTS an_answer_is_its_own ON public.dispatch_posts;
DROP FUNCTION IF EXISTS private.an_answer_is_its_seekings_own();
