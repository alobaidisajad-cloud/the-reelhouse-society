-- ════════════════════════════════════════════════════════════════════════════
-- HOTFIX — the Tribunal's report queue has been dead since batch 26. Mine.
-- ════════════════════════════════════════════════════════════════════════════
--
-- get_priority_reports declares `content_id uuid`. public.reports.content_id is
-- `text`. PostgreSQL validates a RETURNS TABLE tuple descriptor against the
-- actual query result, so EVERY call fails with:
--
--   ERROR: structure of query does not match function result type
--   DETAIL: Returned type text does not match expected type uuid in column 2.
--
-- It fails with zero pending reports too — this is not data-dependent. Admins
-- cannot open the docket at all; ModerationService.getPriorityQueue rethrows.
--
-- I introduced this in 20260809_02_priority_reports_keyset.sql (line 71) and
-- recorded that batch as "live-verified". That verification was vacuous: it
-- clearly never executed the function, because one call would have raised. The
-- lesson is the one that keeps recurring — a check that never runs the thing it
-- claims to check proves nothing.
--
-- Found while smoke-testing the app's hot paths after batch 29. Batch 29 did NOT
-- cause it: proven by reverting this one function to its old
-- `SET search_path = public` and re-calling — it fails identically either way.
--
-- THE FIX: declare the column as the table actually stores it. `text` is chosen
-- over casting to uuid because a cast would raise on any content_id that is not
-- uuid-shaped, trading a total outage for an intermittent one. The clients are
-- unaffected — ModerationService reads rows as Record<string, unknown>, and
-- ReportPayloadSchema validates report SUBMISSION, not this queue.
--
-- A return type cannot be changed by CREATE OR REPLACE, so this drops and
-- recreates. The grants are restored explicitly below; dropping loses them, and
-- a silently ungranted admin RPC is exactly the failure this batch is about.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_type text;
BEGIN
  SET LOCAL lock_timeout = '3s';
  SET LOCAL statement_timeout = '30s';

  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'content_id';

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'ABORTED — public.reports.content_id does not exist.';
  ELSIF v_type <> 'text' THEN
    -- If the column has since become uuid, the declaration was right and this
    -- file is the wrong fix. Stop rather than "repair" it in the wrong direction.
    RAISE EXCEPTION
      'ABORTED — reports.content_id is %, not text. Re-check before changing the function.', v_type;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.get_priority_reports(integer, bigint, timestamptz, uuid);

CREATE FUNCTION public.get_priority_reports(
  p_limit           integer     DEFAULT 20,
  p_cursor_count    bigint      DEFAULT NULL,
  p_cursor_created  timestamptz DEFAULT NULL,
  p_cursor_id       uuid        DEFAULT NULL
)
RETURNS TABLE(
  id             uuid,
  content_id     text,          -- was uuid; reports.content_id is text
  content_type   text,
  reason         text,
  details        text,
  reporter_id    uuid,
  target_user_id uuid,
  created_at     timestamptz,
  report_count   bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Carried over verbatim: this reads reporter_id and target_user_id for every
  -- pending report, and the gate is all that stands between that and any member.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH scored AS (
    -- No cursor filter here, deliberately: the count must describe the whole
    -- pending set, not the tail of it.
    SELECT
      r.id, r.content_id, r.content_type, r.reason, r.details,
      r.reporter_id, r.target_user_id, r.created_at,
      COUNT(*) OVER (PARTITION BY r.content_id) AS report_count
    FROM reports r
    WHERE r.status = 'pending'
  )
  SELECT
    s.id, s.content_id, s.content_type, s.reason, s.details,
    s.reporter_id, s.target_user_id, s.created_at, s.report_count
  FROM scored s
  WHERE
    p_cursor_count IS NULL
    OR s.report_count < p_cursor_count
    OR (s.report_count = p_cursor_count AND s.created_at > p_cursor_created)
    OR (s.report_count = p_cursor_count AND s.created_at = p_cursor_created
        AND s.id > p_cursor_id)
  ORDER BY s.report_count DESC, s.created_at ASC, s.id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
END;
$function$;

-- Restore the grants the DROP removed, matching what was live beforehand.
-- anon is included deliberately: it was granted before, and the function's own
-- first act is to refuse a null auth.uid(), so the grant is inert. Changing the
-- permission surface is a separate decision from fixing a type declaration, and
-- bundling the two would make this hotfix harder to reason about.
GRANT EXECUTE ON FUNCTION public.get_priority_reports(integer, bigint, timestamptz, uuid)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
