-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_05 — a member's new row is dated by the house, never by the member's word.
-- ════════════════════════════════════════════════════════════════════════════
--   A member's insert could write its own created_at, and the house kept it: a critique dated
--   2020 or 2099 (the kinds pass, stage C, kind 9: a value the caller writes, believed). A row dated
--   in the future stood at the head of every page read newest first (the house feed, a log's
--   critiques, a salon, the Dispatch) for as long as the date was ahead; and the records' two paces
--   (logs_insert_rate_limit, tr_log_insert_ceiling) counted the member's records of the last day by
--   that same date, so records dated in the past were never counted at all.
--   Now, on every table a member inserts into that keeps a date, the house dates the row as it
--   lands (a_new_row_is_dated): its created_at is the moment of the insert, its updated_at the same,
--   and the dates only the house writes later (edited_at, withheld_at, ended_at, deleted_at) start
--   empty. Records, watchlist and shelf entries, stacks and their entries keep a date in the past
--   (an imported archive keeps when each film was logged, archiveImport's backdatedTimestamps), but
--   never one after the moment of the insert. The house's own writes (its functions, the service)
--   keep the dates they write.
--   And the records' pace no longer reads a date the member writes: check_write_pace keeps it, as it
--   keeps a member's stacks and watchlist (kind 'record': room 50,000, ten more each second,
--   100,000 a day, so the largest archive imported at once lands whole), and both old paces are
--   taken off.
--   A member's drafts (saved_at) and private notes (updated_at) keep the member's own time: read by
--   no one but their writer, and ordering nothing anyone else reads.
-- Undo: mobile/supabase/migrations-down/20261122_05_a_new_row_is_dated_by_the_house.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (1): no shipped client uses it: a trigger's function this piece makes, dropped first so it is made new (no grant it did not ask for), called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_new_row_is_dated();
CREATE FUNCTION public.a_new_row_is_dated() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_row jsonb := to_jsonb(NEW);
  v_at  timestamptz := now();
  v_set jsonb := '{}'::jsonb;
BEGIN
  -- The house's own writes keep their dates: only a member's or a visitor's request runs as these roles.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  -- 'not_after': a date in the past is kept (an imported archive's), one after now is now.
  IF TG_ARGV[0] = 'not_after' AND NEW.created_at IS NOT NULL THEN
    v_at := LEAST(NEW.created_at, v_at);
  END IF;
  v_set := jsonb_build_object('created_at', v_at);
  IF v_row ? 'updated_at' THEN v_set := v_set || jsonb_build_object('updated_at', v_at); END IF;
  IF v_row ? 'edited_at' THEN v_set := v_set || jsonb_build_object('edited_at', NULL); END IF;
  IF v_row ? 'withheld_at' THEN v_set := v_set || jsonb_build_object('withheld_at', NULL); END IF;
  IF v_row ? 'ended_at' THEN v_set := v_set || jsonb_build_object('ended_at', NULL); END IF;
  IF v_row ? 'deleted_at' THEN v_set := v_set || jsonb_build_object('deleted_at', NULL); END IF;
  NEW := jsonb_populate_record(NEW, v_set);
  RETURN NEW;
END $$;
-- add-only (1): no shipped client uses it: a trigger's function this piece makes, called by no client (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.a_new_row_is_dated() FROM PUBLIC, anon, authenticated;

-- The rule on each table a member inserts into that keeps a date.
-- add-only (3): it only fixes: a member's row lands as before, dated as it lands (TestFlight build 41 writes no date but an imported archive's, which is kept, never after now; replayed in the rehearsal as members)
CREATE OR REPLACE TRIGGER a_new_row_is_dated BEFORE INSERT ON public.analytics_events FOR EACH ROW EXECUTE FUNCTION public.a_new_row_is_dated('now');
CREATE OR REPLACE TRIGGER a_new_row_is_dated BEFORE INSERT ON public.dispatch_certifications FOR EACH ROW EXECUTE FUNCTION public.a_new_row_is_dated('now');
CREATE OR REPLACE TRIGGER a_new_row_is_dated BEFORE INSERT ON public.dispatch_comments FOR EACH ROW EXECUTE FUNCTION public.a_new_row_is_dated('now');
CREATE OR REPLACE TRIGGER a_new_row_is_dated BEFORE INSERT ON public.dispatch_posts FOR EACH ROW EXECUTE FUNCTION public.a_new_row_is_dated('now');
CREATE OR REPLACE TRIGGER a_new_row_is_dated BEFORE INSERT ON public.dispatch_saves FOR EACH ROW EXECUTE FUNCTION public.a_new_row_is_dated('now');
CREATE OR REPLACE TRIGGER a_new_row_is_dated BEFORE INSERT ON public.dispatch_votes FOR EACH ROW EXECUTE FUNCTION public.a_new_row_is_dated('now');
CREATE OR REPLACE TRIGGER a_new_row_is_dated BEFORE INSERT ON public.interactions FOR EACH ROW EXECUTE FUNCTION public.a_new_row_is_dated('now');
CREATE OR REPLACE TRIGGER a_new_row_is_dated BEFORE INSERT ON public.list_comments FOR EACH ROW EXECUTE FUNCTION public.a_new_row_is_dated('now');
CREATE OR REPLACE TRIGGER a_new_row_is_dated BEFORE INSERT ON public.log_comments FOR EACH ROW EXECUTE FUNCTION public.a_new_row_is_dated('now');
CREATE OR REPLACE TRIGGER a_new_row_is_dated BEFORE INSERT ON public.lounge_message_reactions FOR EACH ROW EXECUTE FUNCTION public.a_new_row_is_dated('now');
CREATE OR REPLACE TRIGGER a_new_row_is_dated BEFORE INSERT ON public.lounge_messages FOR EACH ROW EXECUTE FUNCTION public.a_new_row_is_dated('now');
CREATE OR REPLACE TRIGGER a_new_row_is_dated BEFORE INSERT ON public.lounges FOR EACH ROW EXECUTE FUNCTION public.a_new_row_is_dated('now');
CREATE OR REPLACE TRIGGER a_new_row_is_dated BEFORE INSERT ON public.push_subscriptions FOR EACH ROW EXECUTE FUNCTION public.a_new_row_is_dated('now');
CREATE OR REPLACE TRIGGER a_new_row_is_dated BEFORE INSERT ON public.user_blocks FOR EACH ROW EXECUTE FUNCTION public.a_new_row_is_dated('now');
CREATE OR REPLACE TRIGGER a_new_row_is_dated BEFORE INSERT ON public.logs FOR EACH ROW EXECUTE FUNCTION public.a_new_row_is_dated('not_after');
CREATE OR REPLACE TRIGGER a_new_row_is_dated BEFORE INSERT ON public.lists FOR EACH ROW EXECUTE FUNCTION public.a_new_row_is_dated('not_after');
CREATE OR REPLACE TRIGGER a_new_row_is_dated BEFORE INSERT ON public.list_items FOR EACH ROW EXECUTE FUNCTION public.a_new_row_is_dated('not_after');
CREATE OR REPLACE TRIGGER a_new_row_is_dated BEFORE INSERT ON public.watchlists FOR EACH ROW EXECUTE FUNCTION public.a_new_row_is_dated('not_after');
CREATE OR REPLACE TRIGGER a_new_row_is_dated BEFORE INSERT ON public.physical_archive FOR EACH ROW EXECUTE FUNCTION public.a_new_row_is_dated('not_after');

-- The records' pace, kept by check_write_pace: a new kind.
-- add-only (1): no shipped client uses it: the house's own table, read and written by check_write_pace alone (TestFlight build 41 and the website checked)
ALTER TABLE public.write_budget DROP CONSTRAINT write_budget_kind;
-- add-only (1): no shipped client uses it: the house's own table, read and written by check_write_pace alone (TestFlight build 41 and the website checked)
ALTER TABLE public.write_budget ADD CONSTRAINT write_budget_kind CHECK (kind = ANY (ARRAY['stack', 'stack_entry', 'filing', 'salon', 'reaction', 'certification',
  'save', 'vote', 'block', 'watchlist_entry', 'shelf_entry', 'draft', 'push_address', 'seat', 'record']));
COMMENT ON TABLE public.write_budget IS 'Each member''s room, per kind, to write what they may repeat at will (records, stacks and their entries, filings, salons, reactions, certifications, saves, votes, blocks, watchlist and shelf entries, drafts, push addresses), refilled with time, and the count of the house''s day: written by check_write_pace alone; no client reads or writes it.';

-- check_write_pace as 20261122_01 left it, with the records ('record') among its kinds.
-- add-only (1): no shipped client uses it: a trigger's function, called by no client (TestFlight build 41 and the website checked)
CREATE OR REPLACE FUNCTION public.check_write_pace() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_now      timestamptz := now();
  v_day      date := (now() AT TIME ZONE 'UTC')::date;
  v_kind     text;
  v_room     real;
  v_every    real;
  v_ceiling  integer;
  v_member   uuid;
  v_again    boolean;
  v_tokens   real;
  v_count    integer;
  v_midnight integer := ceil(extract(epoch FROM ((v_day + 1)::timestamp AT TIME ZONE 'UTC') - v_now))::integer;
BEGIN
  -- The house's own writes are not paced: a member's request always carries the member.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- The kind, its room, the seconds for one more, its day's ceiling, and whether this row is already there.
  IF TG_TABLE_NAME = 'logs' THEN
    v_kind := 'record'; v_room := 50000; v_every := 0.1; v_ceiling := 100000;
    v_again := EXISTS (SELECT 1 FROM public.logs WHERE user_id = NEW.user_id AND film_id = NEW.film_id);
  ELSIF TG_TABLE_NAME = 'lists' THEN
    v_kind := 'stack'; v_room := 500; v_every := 10; v_ceiling := 2000;
    v_again := EXISTS (SELECT 1 FROM public.lists WHERE id = NEW.id);
  ELSIF TG_TABLE_NAME = 'list_items' THEN
    v_kind := 'stack_entry'; v_room := 20000; v_every := 0.1; v_ceiling := 100000;
    v_again := EXISTS (SELECT 1 FROM public.list_items WHERE list_id = NEW.list_id AND film_id = NEW.film_id);
  ELSIF TG_TABLE_NAME = 'dispatch_posts' THEN
    v_kind := 'filing'; v_room := 10; v_every := 360; v_ceiling := 50;
    v_again := EXISTS (SELECT 1 FROM public.dispatch_posts WHERE id = NEW.id);
  ELSIF TG_TABLE_NAME = 'lounges' THEN
    v_kind := 'salon'; v_room := 5; v_every := 3600; v_ceiling := 20;
    v_again := EXISTS (SELECT 1 FROM public.lounges WHERE id = NEW.id);
  ELSIF TG_TABLE_NAME = 'lounge_message_reactions' THEN
    v_kind := 'reaction'; v_room := 120; v_every := 2; v_ceiling := 2000;
    v_again := EXISTS (SELECT 1 FROM public.lounge_message_reactions
                        WHERE message_id = NEW.message_id AND user_id = NEW.user_id AND reaction = NEW.reaction);
  ELSIF TG_TABLE_NAME = 'dispatch_certifications' THEN
    v_kind := 'certification'; v_room := 120; v_every := 2; v_ceiling := 2000;
    v_again := EXISTS (SELECT 1 FROM public.dispatch_certifications WHERE id = NEW.id);
  ELSIF TG_TABLE_NAME = 'dispatch_saves' THEN
    v_kind := 'save'; v_room := 300; v_every := 1; v_ceiling := 3000;
    v_again := EXISTS (SELECT 1 FROM public.dispatch_saves WHERE user_id = NEW.user_id AND post_id = NEW.post_id);
  ELSIF TG_TABLE_NAME = 'dispatch_votes' THEN
    v_kind := 'vote'; v_room := 120; v_every := 1; v_ceiling := 2000;
    v_again := EXISTS (SELECT 1 FROM public.dispatch_votes WHERE post_id = NEW.post_id AND user_id = NEW.user_id);
  ELSIF TG_TABLE_NAME = 'user_blocks' THEN
    v_kind := 'block'; v_room := 100; v_every := 1; v_ceiling := 1000;
    v_again := EXISTS (SELECT 1 FROM public.user_blocks WHERE blocker_id = NEW.blocker_id AND blocked_id = NEW.blocked_id);
  ELSIF TG_TABLE_NAME = 'watchlists' THEN
    v_kind := 'watchlist_entry'; v_room := 20000; v_every := 0.1; v_ceiling := 100000;
    v_again := EXISTS (SELECT 1 FROM public.watchlists WHERE user_id = NEW.user_id AND film_id = NEW.film_id);
  ELSIF TG_TABLE_NAME = 'physical_archive' THEN
    v_kind := 'shelf_entry'; v_room := 2000; v_every := 0.5; v_ceiling := 10000;
    v_again := EXISTS (SELECT 1 FROM public.physical_archive WHERE user_id = NEW.user_id AND film_id = NEW.film_id);
  ELSIF TG_TABLE_NAME = 'member_drafts' THEN
    v_kind := 'draft'; v_room := 300; v_every := 1; v_ceiling := 5000;
    v_again := EXISTS (SELECT 1 FROM public.member_drafts WHERE user_id = NEW.user_id AND kind = NEW.kind AND scope = NEW.scope);
  ELSIF TG_TABLE_NAME = 'push_subscriptions' THEN
    v_kind := 'push_address'; v_room := 20; v_every := 60; v_ceiling := 100;
    v_again := EXISTS (SELECT 1 FROM public.push_subscriptions WHERE endpoint = NEW.endpoint);
  ELSIF TG_TABLE_NAME = 'lounge_members' THEN
    v_kind := 'seat'; v_room := 60; v_every := 10; v_ceiling := 500;
    v_again := EXISTS (SELECT 1 FROM public.lounge_members WHERE lounge_id = NEW.lounge_id AND user_id = NEW.user_id);
  ELSE
    RETURN NEW;
  END IF;
  IF v_again THEN
    RETURN NEW;
  END IF;

  -- The member whose room it is: the one asking (a row names its own member; a stack entry, a list).
  v_member := auth.uid();

  -- The room, refilled for the time since, less this write; and the day's count. One row, one
  -- statement: a member's writes of a kind at the same moment wait on each other here.
  INSERT INTO public.write_budget AS b (user_id, kind, tokens, refilled_at, day, n)
  VALUES (v_member, v_kind, v_room - 1, v_now, v_day, 1)
  ON CONFLICT (user_id, kind) DO UPDATE SET
    tokens      = LEAST(v_room, b.tokens + GREATEST(0, extract(epoch FROM v_now - b.refilled_at))::real / v_every) - 1,
    refilled_at = GREATEST(b.refilled_at, v_now),
    day         = v_day,
    n           = (CASE WHEN b.day = v_day THEN b.n ELSE 0 END) + 1
  RETURNING tokens, n INTO v_tokens, v_count;

  IF v_tokens < 0 THEN
    -- The refill's seconds for each write short of one.
    RAISE EXCEPTION 'RATE_LIMITED' USING ERRCODE = 'RH429', DETAIL = 'member',
      HINT = GREATEST(1, ceil(-v_tokens * v_every))::integer::text;
  END IF;
  IF v_count > v_ceiling THEN
    -- The day's own word, so a ceiling met a minute before midnight is never told as a pace.
    RAISE EXCEPTION 'RATE_LIMITED' USING ERRCODE = 'RH429', DETAIL = 'day',
      HINT = GREATEST(1, v_midnight)::text;
  END IF;

  RETURN NEW;
END $$;

-- add-only (3): it only fixes: a member's records are paced as before, by a room the member cannot date their way past (replayed in the rehearsal as members)
CREATE OR REPLACE TRIGGER zz_a_write_is_paced
  BEFORE INSERT ON public.logs
  FOR EACH ROW
  EXECUTE FUNCTION public.check_write_pace();
-- add-only (3): it only fixes: the records' old paces, which counted by the date a member writes, taken off for the one above
DROP POLICY IF EXISTS logs_insert_rate_limit ON public.logs;
-- add-only (3): it only fixes: the records' old paces, which counted by the date a member writes, taken off for the one above
DROP TRIGGER IF EXISTS tr_log_insert_ceiling ON public.logs;
-- add-only (1): no shipped client uses it: the old ceiling's trigger function, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.enforce_log_insert_ceiling();
