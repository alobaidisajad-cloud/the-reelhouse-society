-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_11 — the cards already in the salons are made true, once, by the house's rule.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A card written before 20261120_10 could carry a forged byline, headline, count, kind or
--      picture: the_cards_made_true makes each again by 20261120_09's rule, read as the house, and marks
--      a card whose piece is gone as gone (review round 14).
--   After the trigger's car, so no card slips between them. Sixteen parts by the first figure of the
--   id, a statement each, under the statement limit; no lock that stops a member (row locks on the
--   cards it writes): salon messages are written and read meanwhile.
-- Undo: mobile/supabase/migrations-down/20261120_11_the_cards_already_shared_are_made_true.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A4.pass · the cards already in the salons, made true once (review round 14) ──
--   After H-A4.locks: the card trigger stands, so every card written from here on is the house's, and
--   this pass makes true each card written before it (none can slip between the two). Each card is made
--   again by the same rule (private.a_shared_card), read as the house: a forged byline, headline, count,
--   kind or picture goes; a card of a record, a filing or a stack no longer in the house is marked gone
--   ({"gone": true}), as round 11 marks a filing's and a stack's. A card sealed or gone already stays as
--   it is; a message whose card is unchanged is not written.
--   The pass is private.the_cards_made_true, run here in sixteen parts by the first figure of each
--   message's id, one statement each: each part is held to the statement limit alone (the whole pass
--   on 150,000 forged cards took 30 s in one statement, so a single one could not apply). It takes no
--   lock that stops a member (ROW EXCLUSIVE on the salons' messages, as any write does, and row locks on
--   the cards it writes): salon messages are written and read meanwhile. Kept, asked by the house
--   alone, so the pass can be run again by part; this car's undo drops it.
-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again; asked by the house alone (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS private.the_cards_made_true(integer);
CREATE FUNCTION private.the_cards_made_true(p_part integer) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  -- The part's ids: from x0000000-0000-0000-0000-000000000000 to xfffffff-ffff-ffff-ffff-ffffffffffff.
  v_from uuid;
  v_last uuid;
  v_made integer;
BEGIN
  IF p_part IS NULL OR p_part NOT BETWEEN 0 AND 15 THEN
    RAISE EXCEPTION 'A part is a figure from 0 to 15.' USING ERRCODE = '22023';
  END IF;
  v_from := (to_hex(p_part) || '0000000-0000-0000-0000-000000000000')::uuid;
  v_last := (to_hex(p_part) || 'fffffff-ffff-ffff-ffff-ffffffffffff')::uuid;
  WITH cards AS MATERIALIZED (
    SELECT x.id, private.a_shared_card(x, false) AS card
      FROM public.lounge_messages x
     WHERE x.id BETWEEN v_from AND v_last
       AND x.type IN ('film_share', 'person_share', 'log_share', 'list_share', 'dossier_share')
       AND NOT (coalesce(x.metadata, '{}'::jsonb) @> '{"gone": true}'::jsonb)
       AND NOT (coalesce(x.metadata, '{}'::jsonb) @> '{"sealed": true}'::jsonb)
  )
  UPDATE public.lounge_messages m
     SET film_id = (c.card).film_id, film_title = (c.card).film_title, film_poster = (c.card).film_poster,
         metadata = (c.card).metadata
    FROM cards c
   WHERE m.id = c.id
     AND (m.film_id, m.film_title, m.film_poster, m.metadata)
         IS DISTINCT FROM ((c.card).film_id, (c.card).film_title, (c.card).film_poster, (c.card).metadata);
  GET DIAGNOSTICS v_made = ROW_COUNT;
  RETURN v_made;
END $$;
-- add-only (1): no shipped client uses it: a function this piece makes, asked by the house alone (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION private.the_cards_made_true(integer) FROM PUBLIC, anon, authenticated;

SELECT private.the_cards_made_true(0) AS part_0;
SELECT private.the_cards_made_true(1) AS part_1;
SELECT private.the_cards_made_true(2) AS part_2;
SELECT private.the_cards_made_true(3) AS part_3;
SELECT private.the_cards_made_true(4) AS part_4;
SELECT private.the_cards_made_true(5) AS part_5;
SELECT private.the_cards_made_true(6) AS part_6;
SELECT private.the_cards_made_true(7) AS part_7;
SELECT private.the_cards_made_true(8) AS part_8;
SELECT private.the_cards_made_true(9) AS part_9;
SELECT private.the_cards_made_true(10) AS part_a;
SELECT private.the_cards_made_true(11) AS part_b;
SELECT private.the_cards_made_true(12) AS part_c;
SELECT private.the_cards_made_true(13) AS part_d;
SELECT private.the_cards_made_true(14) AS part_e;
SELECT private.the_cards_made_true(15) AS part_f;
