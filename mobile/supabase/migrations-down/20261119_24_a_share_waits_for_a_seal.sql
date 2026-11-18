-- Undo of 20261119_24: a share made at the moment of a seal waits for it, and is refused, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── B10 undone · the stack's row is read without a lock, as B3 made it ──
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
     AND l.id = v_named::uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STACK_GONE' USING ERRCODE = 'P0002';
  END IF;
  IF v_private THEN
    RAISE EXCEPTION 'STACK_SEALED' USING ERRCODE = '42501',
      HINT = 'A sealed stack is read by its curator alone; it cannot be shown in a salon.';
  END IF;
  RETURN NEW;
END $$;
