-- ════════════════════════════════════════════════════════════════════════════
-- BATCH 20 · PART 3 — stack ordering becomes a server invariant
-- ════════════════════════════════════════════════════════════════════════════
-- WHY. The client assigns a film's position from the length of the array it is
-- holding (`rank_position: films.length`). That is why the owner's stack query
-- cannot be bounded today: shrink the array and every new film is assigned the
-- same position. Moving the assignment to the server removes the dependency, and
-- the client no longer needs the whole stack in memory to add one film.
--
-- The uniqueness rule that stops a film appearing twice ALREADY EXISTS — probed
-- live: on_conflict=list_id,film_id resolves (42501/RLS) while a bogus target
-- returns 42P10. So this migration does not add it.
--
-- STATE OF THE DATA: rank_position is NULL on all 247 rows, so ordering by it is
-- currently a no-op — ties fall through to created_at. The back-fill therefore
-- numbers rows IN created_at ORDER, which reproduces exactly what members see
-- today. Nothing visibly reorders.

BEGIN;

-- ── 1 · back-fill, preserving the order members already see ──────────────────
WITH ordered AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY list_id ORDER BY created_at ASC, id ASC) - 1 AS pos
  FROM public.list_items
  WHERE rank_position IS NULL
)
UPDATE public.list_items li
   SET rank_position = o.pos
  FROM ordered o
 WHERE li.id = o.id;

-- ── 2 · the server assigns the position when the client does not ────────────
-- BEFORE INSERT so the value is in place before any uniqueness arbitration.
-- Only fires when rank_position IS NULL, so every existing client — including
-- the build on TestFlight, which always sends one — behaves exactly as before.
CREATE OR REPLACE FUNCTION public.assign_list_item_position()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
BEGIN
  IF NEW.rank_position IS NULL THEN
    SELECT COALESCE(MAX(li.rank_position) + 1, 0)
      INTO NEW.rank_position
      FROM public.list_items li
     WHERE li.list_id = NEW.list_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_assign_list_item_position ON public.list_items;
CREATE TRIGGER trg_assign_list_item_position
  BEFORE INSERT ON public.list_items
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_list_item_position();

-- ── 3 · refuse to commit a half-applied change ──────────────────────────────
DO $$
DECLARE n_null int; n_trg int;
BEGIN
  SELECT count(*) INTO n_null FROM public.list_items WHERE rank_position IS NULL;
  IF n_null > 0 THEN
    RAISE EXCEPTION 'back-fill missed % rows. NOTHING changed — rolled back.', n_null;
  END IF;

  SELECT count(*) INTO n_trg FROM pg_trigger
   WHERE tgname = 'trg_assign_list_item_position' AND NOT tgisinternal;
  IF n_trg <> 1 THEN
    RAISE EXCEPTION 'the position trigger was not created. NOTHING changed — rolled back.';
  END IF;

  RAISE NOTICE 'OK — every stack item has a position, and the server assigns new ones.';
END $$;

COMMIT;
