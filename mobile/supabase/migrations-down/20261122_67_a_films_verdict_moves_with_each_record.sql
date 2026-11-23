-- Undo of 20261122_67: a film's verdict counted again from all its records at each record, as production held it.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (1): no shipped client uses it: the triggers this car made
DROP TRIGGER IF EXISTS trg_verdict_film_logs_insert ON public.logs;
-- add-only (1): no shipped client uses it: the triggers this car made
DROP TRIGGER IF EXISTS trg_verdict_film_logs_update ON public.logs;
-- add-only (1): no shipped client uses it: the triggers this car made
DROP TRIGGER IF EXISTS trg_verdict_film_logs_delete ON public.logs;

-- add-only (3): it only fixes: as production held it
CREATE OR REPLACE FUNCTION public.note_film_verdict() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_film_verdict(OLD.film_id);
    RETURN OLD;
  END IF;

  PERFORM public.refresh_film_verdict(NEW.film_id);

  IF TG_OP = 'UPDATE' AND OLD.film_id IS DISTINCT FROM NEW.film_id THEN
    PERFORM public.refresh_film_verdict(OLD.film_id);
  END IF;

  RETURN NEW;
END;
$$;

-- add-only (3): it only fixes: as production held it
CREATE OR REPLACE FUNCTION public.refresh_film_verdict(p_film_id integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF p_film_id IS NULL OR p_film_id <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.films AS f (id, avg_rating, rating_count, log_count)
  SELECT
    p_film_id,
    ROUND(AVG(l.rating) FILTER (WHERE l.rating > 0), 2),
    COUNT(*) FILTER (WHERE l.rating > 0),
    COUNT(*)
  FROM public.logs l
  WHERE l.film_id = p_film_id
    AND l.withheld_at IS NULL  -- a log the house withholds is in no film's verdict (H-B10)
  ON CONFLICT (id) DO UPDATE
    SET avg_rating   = EXCLUDED.avg_rating,
        rating_count = EXCLUDED.rating_count,
        log_count    = EXCLUDED.log_count;
END;
$$;

-- add-only (3): it only fixes: as production held it
CREATE OR REPLACE TRIGGER trg_verdict_film_logs AFTER INSERT OR DELETE OR UPDATE OF film_id, rating ON public.logs FOR EACH ROW EXECUTE FUNCTION public.note_film_verdict();

-- add-only (1): no shipped client uses it: the function this car made, in private
DROP FUNCTION IF EXISTS private.a_films_verdict_moves(integer, integer, integer, numeric);
-- add-only (1): no shipped client uses it: the sums this car made, in private
DROP TABLE IF EXISTS private.film_tallies;
