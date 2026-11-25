-- ════════════════════════════════════════════════════════════════════════════
-- 20261125_10 — a member's call that asks the store for their rank is paced as a person asks.
-- ════════════════════════════════════════════════════════════════════════════
--   sync-entitlement reads the member's whole record from RevenueCat, server to server, on the house's
--   own key, every time a signed-in member calls it: the phone calls it after a purchase and after a
--   restore. It had no pace, so a script signed in as any member could call it without end and spend
--   the house's allowance at the store, which every member's purchase and the store's own word to the
--   house (revenuecat-webhook) share. Now the function asks a_members_call_is_paced first, as the
--   member, kind store_read: a room of 10, one more each 30 seconds, 200 a day (a member buys or
--   restores a few times in a year). Past it the function answers 429 with the seconds to wait, which
--   the phone's queue already waits on; refused, nothing is spent and the store is not asked.
--   The room is the one every write a member repeats keeps (write_budget, one row a member and kind,
--   read and written in one statement); its arithmetic now has one home, private.a_members_room_is_spent,
--   which check_write_pace spends through as before, word for word.
--   a_members_call_is_paced is the house's alone (service_role): no member may run it or read a room.
--   This car goes first, sync-entitlement's deploy after it (deployed before, its call finds no pace to ask
--   and answers 502); on the way down, the function goes back first, then the undo.
-- Undo: mobile/supabase/migrations-down/20261125_10_a_members_call_to_the_store_is_paced.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (1): no shipped client uses it: write_budget is written by the house alone and read by no client (TestFlight build 41 and the website checked); the kinds only widen, every row already there holds them
ALTER TABLE public.write_budget DROP CONSTRAINT write_budget_kind;
-- add-only (1): no shipped client uses it: write_budget is written by the house alone and read by no client (TestFlight build 41 and the website checked); the kinds only widen, every row already there holds them
ALTER TABLE public.write_budget ADD CONSTRAINT write_budget_kind CHECK (kind = ANY (ARRAY['stack'::text, 'stack_entry'::text, 'filing'::text, 'salon'::text, 'reaction'::text, 'certification'::text, 'save'::text, 'vote'::text, 'block'::text, 'watchlist_entry'::text, 'shelf_entry'::text, 'draft'::text, 'push_address'::text, 'seat'::text, 'record'::text, 'store_read'::text]));
COMMENT ON TABLE public.write_budget IS 'Each member''s room, per kind, to write what they may repeat at will (records, stacks and their entries, filings, salons, reactions, certifications, saves, votes, blocks, watchlist and shelf entries, drafts, push addresses) and to ask the store for their rank (store_read), refilled with time, and the count of the house''s day: spent by private.a_members_room_is_spent alone, for check_write_pace and a_members_call_is_paced; no client reads or writes it.';

-- The room of a member's kind, refilled for the time since, less this one; and the day's count, by the
-- house's (UTC) day. One row, one statement: a member's writes of a kind at the same moment wait on each
-- other here. The caller refuses past the room or the ceiling; refused, the statement it rolls back
-- spent nothing.
CREATE FUNCTION private.a_members_room_is_spent(p_member uuid, p_kind text, p_room real, p_every real)
    RETURNS TABLE (tokens real, n integer)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  INSERT INTO public.write_budget AS b (user_id, kind, tokens, refilled_at, day, n)
  VALUES (p_member, p_kind, p_room - 1, now(), (now() AT TIME ZONE 'UTC')::date, 1)
  ON CONFLICT (user_id, kind) DO UPDATE SET
    tokens      = LEAST(p_room, b.tokens + GREATEST(0, extract(epoch FROM now() - b.refilled_at))::real / p_every) - 1,
    refilled_at = GREATEST(b.refilled_at, now()),
    day         = (now() AT TIME ZONE 'UTC')::date,
    n           = (CASE WHEN b.day = (now() AT TIME ZONE 'UTC')::date THEN b.n ELSE 0 END) + 1
  RETURNING b.tokens, b.n;
$$;
-- add-only (1): no shipped client uses it: a function made here, named by neither TestFlight build 41 nor the website
REVOKE ALL ON FUNCTION private.a_members_room_is_spent(uuid, text, real, real) FROM PUBLIC, anon, authenticated;

-- add-only (3): it only fixes: one home for the room, the same rooms, refills, ceilings, refusals and waits for every write a member repeats (the rehearsal replays every kind's room, ceiling and refill, a row sent again, the house's own write, through check_write_pace as every_members_write_is_paced_rehearsal.sql replays it); TestFlight build 41 and the website write as before
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
  SELECT s.tokens, s.n INTO v_tokens, v_count FROM private.a_members_room_is_spent(v_member, v_kind, v_room, v_every) AS s;

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

-- A member's call to an edge function that asks a service outside on the house's own key, paced as a
-- person calls it: the function names the member it verified and the kind; past the room, RH429 'member'
-- with the seconds to wait; past the day's ceiling, RH429 'day' with the seconds to the house's midnight.
CREATE FUNCTION public.a_members_call_is_paced(p_member uuid, p_kind text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_now      timestamptz := now();
  v_day      date := (now() AT TIME ZONE 'UTC')::date;
  v_room     real;
  v_every    real;
  v_ceiling  integer;
  v_tokens   real;
  v_count    integer;
  v_midnight integer := ceil(extract(epoch FROM ((v_day + 1)::timestamp AT TIME ZONE 'UTC') - v_now))::integer;
BEGIN
  IF p_member IS NULL THEN
    RAISE EXCEPTION 'a_members_call_is_paced: no member' USING ERRCODE = '22004';
  END IF;
  IF p_kind = 'store_read' THEN
    v_room := 10; v_every := 30; v_ceiling := 200;
  ELSE
    RAISE EXCEPTION 'a_members_call_is_paced: no such kind' USING ERRCODE = '22023', DETAIL = coalesce(p_kind, '');
  END IF;

  SELECT s.tokens, s.n INTO v_tokens, v_count FROM private.a_members_room_is_spent(p_member, p_kind, v_room, v_every) AS s;

  IF v_tokens < 0 THEN
    -- The refill's seconds for each call short of one.
    RAISE EXCEPTION 'RATE_LIMITED' USING ERRCODE = 'RH429', DETAIL = 'member',
      HINT = GREATEST(1, ceil(-v_tokens * v_every))::integer::text;
  END IF;
  IF v_count > v_ceiling THEN
    RAISE EXCEPTION 'RATE_LIMITED' USING ERRCODE = 'RH429', DETAIL = 'day',
      HINT = GREATEST(1, v_midnight)::text;
  END IF;
END $$;
-- add-only (1): no shipped client uses it: a function made here, asked by sync-entitlement alone; neither TestFlight build 41 nor the website names it
REVOKE ALL ON FUNCTION public.a_members_call_is_paced(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.a_members_call_is_paced(uuid, text) TO service_role;
