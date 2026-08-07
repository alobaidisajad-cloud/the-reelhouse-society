-- ════════════════════════════════════════════════════════════════════════════
-- BATCH 21 · the Dispatch feed stops carrying whole essays
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
--
-- MEASURED: the feed reads `select('*')`, which includes `full_content`. The feed
-- CARD renders only the excerpt — the body travels solely to pre-load the reader.
-- Today that is 83% of the payload on a single 2,770-character essay; at the
-- sanitiser's cap it would be up to 500KB of essay per page of 20, and raising
-- that cap so a 6,000-word essay can publish would take it past a megabyte.
--
-- WHY A FUNCTION AND NOT AN EXPLICIT CLIENT SELECT. `select('*')` is deliberate:
--   "never error on a renamed/missing column (dispatch_dossiers has a history of
--    remote column renames)"
-- and that caution is correct — an explicit client list returns 42703 and breaks
-- hard (verified live). With the app build frozen until launch, a client-side
-- break could not be fixed without a release. A function moves the column names
-- to the one place that CAN be fixed without one, and a rename then breaks at
-- migration time, visibly, instead of silently for every member.
--
-- EVERY COLUMN IS CAST. The declared types are authoritative, so a column whose
-- type drifts (int -> bigint, uuid -> text) cannot break this the way a bare
-- RETURNS TABLE would.
--
-- SECURITY INVOKER: row security still decides what is visible. This function
-- cannot widen what a member could already read — the worst it can do is return
-- less. It also keeps the `is_published` filter the client applies today.

CREATE OR REPLACE FUNCTION public.get_dispatch_feed(
  p_limit integer DEFAULT 20,
  p_cursor_created_at timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id text,
  title text,
  excerpt text,
  author_username text,
  user_id text,
  views integer,
  certify_count integer,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  SELECT
    d.id::text,
    d.title::text,
    d.excerpt::text,
    d.author_username::text,
    d.user_id::text,
    d.views::integer,
    d.certify_count::integer,
    d.created_at
  FROM public.dispatch_dossiers d
  WHERE d.is_published = true
    AND (p_cursor_created_at IS NULL OR d.created_at < p_cursor_created_at)
  ORDER BY d.created_at DESC
  -- Clamped: callable by anyone, and an unbounded page would undo the point.
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 0), 50);
$function$;

REVOKE ALL ON FUNCTION public.get_dispatch_feed(integer, timestamptz) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_dispatch_feed(integer, timestamptz) TO anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_dispatch_feed(integer, timestamptz) TO authenticated';
  END IF;
END $$;
