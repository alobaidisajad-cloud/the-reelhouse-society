-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_01 — every write a member can repeat at will is paced as a person writes.
-- ════════════════════════════════════════════════════════════════════════════
--   The house paced a member's marks (check_interaction_rate_limit), critiques (check_critique_pace),
--   records, salon messages, events and error reports, each where a review found it unpaced. The
--   kinds pass (stage C) asked it of every table a member may write, and fourteen had no pace: a
--   script signed in as any member could make stacks and fill them, file takes into the Dispatch, open
--   salons, react in a salon, certify, save and vote on filings, block, and fill its own watchlist,
--   shelf, drafts and push addresses without end, each a row the house keeps and some a row others
--   read or a notice. Now check_write_pace keeps, per member and kind, in one row of write_budget
--   read and written in one statement, a room, a refill and a day's ceiling, set far past what a
--   person does, a whole archive imported at once included (archiveImport makes a stack for each list
--   in the file, up to 2,000 files, and fills each):
--     stack             (lists)                     room 500,    one more each 10 seconds,   2,000 a day
--     stack entry       (list_items, new ones)      room 20,000, ten more each second,   100,000 a day
--     filing            (dispatch_posts)            room 10,    one more each 6 minutes,     50 a day
--     salon             (lounges)                   room 5,     one more each hour,          20 a day
--     reaction          (lounge_message_reactions)  room 120,   one more each 2 seconds,  2,000 a day
--     certification     (dispatch_certifications)   room 120,   one more each 2 seconds,  2,000 a day
--     save              (dispatch_saves)            room 300,   one more each second,     3,000 a day
--     vote              (dispatch_votes)            room 120,   one more each second,     2,000 a day
--     block             (user_blocks)               room 100,   one more each second,     1,000 a day
--     watchlist entry   (watchlists, new ones)      room 20,000, ten more each second,   100,000 a day
--     shelf entry       (physical_archive)          room 2,000, two more each second,    10,000 a day
--     draft             (member_drafts, new ones)   room 300,   one more each second,     5,000 a day
--     push address      (push_subscriptions)        room 20,    one more each minute,       100 a day
--     seat              (lounge_members, new ones)  room 60,    one more each 10 seconds,   500 a day
--   (a seat is taken by join_public_lounge, request_lounge_membership and create_lounge, as the member:
--   a seat taken and given up in a loop recounted the salon and wrote its host a notice each time).
--   A private note is one a viewing, and viewings come with records, which logs_insert_rate_limit paces.
--   A refusal is said as the house's other paces say it: SQLSTATE RH429, message RATE_LIMITED, DETAIL
--   'member' (the room) or 'day' (the day's ceiling, to the house's midnight), HINT the seconds to
--   wait; it costs nothing (the budget is written by the statement it rolls back). A row sent again
--   whose first send landed (an answer lost; a stack saved again over its entries) is no new write and
--   is not counted; the house's own writes are not paced. The rule runs after every other check of
--   the insert (its trigger's name sorts last), so a refusal for standing or rank is said as itself.
-- Undo: mobile/supabase/migrations-down/20261122_01_every_members_write_is_paced.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (1): no shipped client uses it: a table only the house writes, read by no client (TestFlight build 41 and the website checked)
CREATE TABLE public.write_budget (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind text NOT NULL,
    tokens real NOT NULL,
    refilled_at timestamp with time zone NOT NULL,
    day date NOT NULL,
    n integer NOT NULL DEFAULT 0,
    CONSTRAINT write_budget_pkey PRIMARY KEY (user_id, kind),
    CONSTRAINT write_budget_kind CHECK (kind = ANY (ARRAY['stack', 'stack_entry', 'filing', 'salon', 'reaction', 'certification',
      'save', 'vote', 'block', 'watchlist_entry', 'shelf_entry', 'draft', 'push_address', 'seat']))
);
ALTER TABLE public.write_budget ENABLE ROW LEVEL SECURITY;
-- add-only (1): no shipped client uses it: the house's own table, no member's to read or write
REVOKE ALL ON TABLE public.write_budget FROM anon, authenticated;
COMMENT ON TABLE public.write_budget IS 'Each member''s room, per kind, to write what they may repeat at will (stacks and their entries, filings, salons, reactions, certifications, saves, votes, blocks, watchlist and shelf entries, drafts, push addresses), refilled with time, and the count of the house''s day: written by check_write_pace alone; no client reads or writes it.';

-- add-only (1): no shipped client uses it: a trigger's function this piece makes, dropped first so it is made new (no grant it did not ask for), called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.check_write_pace();
CREATE FUNCTION public.check_write_pace() RETURNS trigger
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
  IF TG_TABLE_NAME = 'lists' THEN
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
-- add-only (1): no shipped client uses it: a trigger's function this piece makes, called by no client (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.check_write_pace() FROM PUBLIC, anon, authenticated;

-- The rule on each table, last of its insert's checks.
-- add-only (3): it only fixes: a person's writes pass as before, a script's past the pace are refused with RH429 (replayed in the rehearsal as members)
CREATE OR REPLACE TRIGGER zz_a_write_is_paced
  BEFORE INSERT ON public.lists
  FOR EACH ROW
  EXECUTE FUNCTION public.check_write_pace();
CREATE OR REPLACE TRIGGER zz_a_write_is_paced
  BEFORE INSERT ON public.list_items
  FOR EACH ROW
  EXECUTE FUNCTION public.check_write_pace();
CREATE OR REPLACE TRIGGER zz_a_write_is_paced
  BEFORE INSERT ON public.dispatch_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.check_write_pace();
CREATE OR REPLACE TRIGGER zz_a_write_is_paced
  BEFORE INSERT ON public.lounges
  FOR EACH ROW
  EXECUTE FUNCTION public.check_write_pace();
CREATE OR REPLACE TRIGGER zz_a_write_is_paced
  BEFORE INSERT ON public.lounge_message_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_write_pace();
CREATE OR REPLACE TRIGGER zz_a_write_is_paced
  BEFORE INSERT ON public.dispatch_certifications
  FOR EACH ROW
  EXECUTE FUNCTION public.check_write_pace();
CREATE OR REPLACE TRIGGER zz_a_write_is_paced
  BEFORE INSERT ON public.dispatch_saves
  FOR EACH ROW
  EXECUTE FUNCTION public.check_write_pace();
CREATE OR REPLACE TRIGGER zz_a_write_is_paced
  BEFORE INSERT ON public.dispatch_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.check_write_pace();
CREATE OR REPLACE TRIGGER zz_a_write_is_paced
  BEFORE INSERT ON public.user_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.check_write_pace();
CREATE OR REPLACE TRIGGER zz_a_write_is_paced
  BEFORE INSERT ON public.watchlists
  FOR EACH ROW
  EXECUTE FUNCTION public.check_write_pace();
CREATE OR REPLACE TRIGGER zz_a_write_is_paced
  BEFORE INSERT ON public.physical_archive
  FOR EACH ROW
  EXECUTE FUNCTION public.check_write_pace();
CREATE OR REPLACE TRIGGER zz_a_write_is_paced
  BEFORE INSERT ON public.member_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.check_write_pace();
CREATE OR REPLACE TRIGGER zz_a_write_is_paced
  BEFORE INSERT ON public.push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_write_pace();
CREATE OR REPLACE TRIGGER zz_a_write_is_paced
  BEFORE INSERT ON public.lounge_members
  FOR EACH ROW
  EXECUTE FUNCTION public.check_write_pace();
