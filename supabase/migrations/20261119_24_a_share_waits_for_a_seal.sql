-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_24 — a share made at the moment of a seal waits for it, and is refused.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A stack shared at the moment its curator sealed it read it still open and kept a full card: the
--      share reads the stack's row FOR SHARE, so a seal or a delete and a share take turns (review round 13).
--   The card trigger's function only (20261119_15's, hung by 20261119_21); one row lock per share, no table lock.
-- Undo: mobile/supabase/migrations-down/20261119_24_a_share_waits_for_a_seal.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── B10 · a share made at the moment of a seal waits for it, and is refused (review round 13) ──
--   a_sealed_stack_is_not_shared read the stack's row without a lock. A member sharing a stack at
--   the moment its curator sealed it (READ COMMITTED) read it still open, before the seal committed,
--   and wrote a full card; the seal's own turn of the cards (a_sealed_stack_takes_its_cards) had
--   already taken its snapshot and never saw that card, so the salon read the sealed stack's title,
--   count and curator. A share racing a delete had the same window against
--   a_deleted_stack_leaves_its_cards. Now the share reads the stack's row FOR SHARE: a seal (an UPDATE)
--   or a delete holding the row first makes the share wait for it, read the row as it then stands, and
--   be refused; a share holding it first makes the seal or the delete wait, and its turn of the cards
--   then sees the new card. FOR KEY SHARE would not do: it does not conflict with the seal's UPDATE
--   (is_private is no key). One row lock per share of a stack, no table lock. Every other step is as
--   B3 made it.
-- As B3 made it, the stack's row read FOR SHARE.
-- add-only (1): no shipped client uses it: a trigger's function round 13 makes (B3), called by no client (TestFlight build 41 and the website checked)
CREATE OR REPLACE FUNCTION public.a_sealed_stack_is_not_shared() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_named   text := NEW.metadata ->> 'listId';
  v_private boolean;
BEGIN
  -- A card that names no stack shows none: nothing to keep.
  IF NEW.type IS DISTINCT FROM 'list_share' OR v_named IS NULL THEN
    RETURN NEW;
  END IF;
  -- Read as the house, whoever shares: the sharer may not be the curator, and a sealed stack is
  -- refused to every sharer, its curator included.
  SELECT coalesce(l.is_private, false) INTO v_private
    FROM public.lists l
   WHERE v_named ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND l.id = v_named::uuid
     FOR SHARE OF l;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STACK_GONE' USING ERRCODE = 'P0002';
  END IF;
  IF v_private THEN
    RAISE EXCEPTION 'STACK_SEALED' USING ERRCODE = '42501',
      HINT = 'A sealed stack is read by its curator alone; it cannot be shown in a salon.';
  END IF;
  RETURN NEW;
END $$;
