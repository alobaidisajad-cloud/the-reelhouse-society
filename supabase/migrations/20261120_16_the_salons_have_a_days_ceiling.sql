-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_16 — a member's salon messages are held to a day's ceiling.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A member hosting their own salon could send messages in a loop until the disk was full:
--      lounge_messages_daily_ceiling refuses a member's 1,001st message of the house's day (RH429
--      'day', the seconds to midnight) (review round 14).
--   A new trigger function only; no table is locked. Its count is 20261120_15's, its trigger the car
--   20261120_17, alone.
-- Undo: mobile/supabase/migrations-down/20261120_16_the_salons_have_a_days_ceiling.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A8 · a member's salon messages are held to a day's ceiling (review round 14) ───────────────
--   Salon messages wrote no notice and pushed nothing, so the critiques' pace (H-A3) left them out; but
--   they fill the disk as analytics events did (H-A6): a member hosting their own salon, where no host
--   but themselves could stop them, could insert 2,000-character messages with their metadata in a
--   loop, every one accepted, until the disk was full (the house's failure of 2026-11-04).
--   Now lounge_messages_daily_ceiling, before each message is sent, counts it in the member's one row
--   of salon_budget (the house's UTC day, read and written in one statement, never by reading the
--   messages back) and refuses the 1,001st of a day: SQLSTATE RH429, message RATE_LIMITED, DETAIL
--   'day', HINT the seconds to the house's midnight. A thousand is a message a minute for sixteen
--   hours: no member talking meets it. A refusal costs nothing (its count rolls back with it). A
--   message sent again whose first send landed (its answer lost: the phone's upsert by its own id) is
--   no new message and is not counted, nor are the house's own writes (no member signed in). The rule
--   runs after every other check of the insert, so a refusal for the rank, the seat or the card is
--   said as itself first. The phone says the wait, the message kept in the room, failed, for the
--   member to send again. The trigger is H-A8.locks'; the table H-A8.table's.

-- add-only (1): no shipped client uses it: a trigger's function this piece makes, dropped first so it is made new (no grant it did not ask for), called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.lounge_messages_daily_ceiling();
CREATE FUNCTION public.lounge_messages_daily_ceiling() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_me  uuid := auth.uid();
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_n   integer;
BEGIN
  -- The house's own writes are not counted: a member's request always carries the member.
  IF v_me IS NULL THEN
    RETURN NEW;
  END IF;
  -- Sent again, its first send landed: no new message.
  IF EXISTS (SELECT 1 FROM public.lounge_messages WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.salon_budget AS b (user_id, day, n)
  VALUES (v_me, v_day, 1)
  ON CONFLICT (user_id) DO UPDATE SET
    day = v_day,
    n   = (CASE WHEN b.day = v_day THEN b.n ELSE 0 END) + 1
  RETURNING n INTO v_n;
  IF v_n > 1000 THEN
    RAISE EXCEPTION 'RATE_LIMITED' USING ERRCODE = 'RH429', DETAIL = 'day',
      HINT = GREATEST(1, ceil(extract(epoch FROM ((v_day + 1)::timestamp AT TIME ZONE 'UTC') - now())))::integer::text;
  END IF;
  RETURN NEW;
END $$;
-- add-only (1): no shipped client uses it: a trigger's function this piece makes, called by no client (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.lounge_messages_daily_ceiling() FROM PUBLIC, anon, authenticated;
