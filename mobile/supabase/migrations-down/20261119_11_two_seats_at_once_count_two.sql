-- Undo of 20261119_11: a salon's member count is taken after the salon is held, so two seats at once count two, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A4 undone · the salon's member count recounted from its seats again, as it was ──
-- The counts set right once are not set wrong again: they equal the seats, which the old function
-- would count the same.
CREATE OR REPLACE FUNCTION public.recount_lounge_members() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_lounge uuid := COALESCE(NEW.lounge_id, OLD.lounge_id);
BEGIN
  UPDATE public.lounges
     SET member_count = (SELECT count(*) FROM public.lounge_members
                          WHERE lounge_id = v_lounge AND status = 'approved')
   WHERE id = v_lounge;
  RETURN COALESCE(NEW, OLD);
END $$;
