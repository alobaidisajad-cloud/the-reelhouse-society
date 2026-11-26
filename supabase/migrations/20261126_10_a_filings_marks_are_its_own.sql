-- ════════════════════════════════════════════════════════════════════════════
-- 20261126_10 — a filing's marks are its own: its answer, its votes, and who may keep it.
-- ════════════════════════════════════════════════════════════════════════════
--   1. The answer a seeking takes is one of that seeking's own critiques. The phone offers the asker
--      the critiques beneath their seeking alone; the house now holds the same: an answer_id that names
--      a critique of another filing, or any answer on a filing that is not a seeking, is refused, so
--      no member is told "took your critique as the answer" about a filing they never answered.
--   2. A vote is one of its ballot's own options: option_index below the number of options the ballot
--      holds, on a filing that is a ballot. The phone offers only the ballot's films; the column alone
--      allowed 0 to 5 on any ballot.
--   3. A member who is banned or suspended keeps no filing, as they keep no film to watch and mark no
--      log (watchlists_ban, interactions' rule): dispatch_saves takes the house's standing rule on a
--      new keep. Taking a keep away stays open to them.
--   Each check reads one filing by its key and one critique by its key: the same work at any size.
--   No row already held is read or changed; production holds none these refuse (counted read-only
--   before this car: no answer off its seeking, no vote out of range).
-- Undo: mobile/supabase/migrations-down/20261126_10_a_filings_marks_are_its_own.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- An answer is a critique beneath this very seeking. Read as the house: a critique the asker may not
-- read (its critic blocked them since) is still known for what it is.
CREATE FUNCTION private.an_answer_is_its_seekings_own() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.answer_id IS NULL OR NEW.answer_id IS NOT DISTINCT FROM OLD.answer_id THEN
    RETURN NEW;
  END IF;
  -- The filing as it stood (OLD): a kind or key sent in the same update is not the filing's (pin_columns,
  -- which keeps the kind, runs after this).
  IF OLD.kind IS DISTINCT FROM 'seeking' OR NEW.id IS DISTINCT FROM OLD.id
     OR NOT EXISTS (SELECT 1 FROM public.dispatch_comments c WHERE c.id = NEW.answer_id AND c.post_id = OLD.id) THEN
    RAISE EXCEPTION 'An answer is one of its own seeking''s critiques.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
-- add-only (1): no shipped client uses it: a trigger's function this car makes, run by no one (TestFlight build 41 and the website never name it)
REVOKE ALL ON FUNCTION private.an_answer_is_its_seekings_own() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION private.an_answer_is_its_seekings_own() IS 'Refuses an answer_id that is not a critique of its own filing, or any answer on a filing that is not a seeking (trigger an_answer_is_its_own on dispatch_posts).';

-- add-only (3): it only fixes: an answer taken from a seeking's own critiques is taken as before, and taken back (NULL) as before; TestFlight build 41 and the website offer only those critiques, so no call they make is refused (the rehearsal replays the asker's own take and take-back)
CREATE TRIGGER an_answer_is_its_own BEFORE UPDATE OF answer_id ON public.dispatch_posts
  FOR EACH ROW EXECUTE FUNCTION private.an_answer_is_its_seekings_own();

-- A vote names one of its ballot's options. Read as the house: the ballot is found by its key.
CREATE FUNCTION private.a_vote_is_one_of_its_ballots() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dispatch_posts p
                  WHERE p.id = NEW.post_id AND p.kind = 'ballot' AND jsonb_typeof(p.options) = 'array'
                    AND NEW.option_index < jsonb_array_length(p.options)) THEN
    RAISE EXCEPTION 'A vote is one of its ballot''s options.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
-- add-only (1): no shipped client uses it: a trigger's function this car makes, run by no one (TestFlight build 41 and the website never name it)
REVOKE ALL ON FUNCTION private.a_vote_is_one_of_its_ballots() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION private.a_vote_is_one_of_its_ballots() IS 'Refuses a vote whose option_index is not one of its ballot''s options, or on a filing that is not a ballot (trigger a_vote_is_one_of_its_ballots on dispatch_votes).';

-- add-only (3): it only fixes: a vote for one of the ballot's films is cast as before; TestFlight build 41 and the website draw only the ballot's own films to vote for, so no call they make is refused (the rehearsal replays a vote for each option of a two-film ballot)
CREATE TRIGGER a_vote_is_one_of_its_ballots BEFORE INSERT OR UPDATE OF post_id, option_index ON public.dispatch_votes
  FOR EACH ROW EXECUTE FUNCTION private.a_vote_is_one_of_its_ballots();

-- add-only (3): it only fixes: a member in good standing keeps and lets go a filing as before, and a member out of standing still lets one go; TestFlight build 41 and the website keep through the same insert, refused to a banned or suspended member as their watchlist already is (the rehearsal replays both)
CREATE POLICY saves_ban ON public.dispatch_saves AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_user_not_banned());
