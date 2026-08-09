-- ============================================================================
-- BATCH 23 · #39 — the stack endorsement count must mean one thing
-- ============================================================================
--
-- The same number is computed three ways today, and ALL THREE are filtered by
-- who is looking:
--
--   1. StackService counts `interactions` client-side, as the viewer.
--   2. FeedService's fallback path builds a tally from rows fetched as the
--      viewer.
--   3. The two feed RPCs compute it in a subquery — and they are
--      SECURITY INVOKER (verified live: prosecdef = false on all three), so the
--      subquery runs under the caller's RLS exactly like the other two.
--
-- The register's fix says "use certify_count, one path is already
-- server-authoritative". That premise is FALSE — no path is. Following it would
-- have made two numbers agree on a wrong value and looked like a fix.
--
-- WHY IT IS WRONG: the SELECT policy on `interactions` is
--   (auth.uid() = user_id) OR (auth.uid() = target_user_id)
--   OR can_view_user_data(user_id) OR can_view_user_data(target_user_id)
-- and a stack endorsement carries NO target_user_id (verified live: null on all
-- four rows). can_view_user_data(NULL) returns FALSE on the deployed
-- fail-closed version (verified live). So visibility rests entirely on the
-- ENDORSER's privacy: a sealed member's endorsement is invisible to anyone who
-- does not follow them, and two people see different totals for one stack.
--
-- Latent only because all accounts are currently public. It becomes real the
-- day one member seals their profile.
--
-- THE FIX: one narrow SECURITY DEFINER function per shape, returning a COUNT
-- and nothing else. Narrow on purpose — it exposes an aggregate, never a row,
-- never an identity. The app already accepts exactly this trade for profile
-- counts (`get_profile_counts` is SECURITY DEFINER and returns true totals),
-- so this makes the two consistent rather than introducing a new posture.
--
-- Read-only and idempotent. Safe to re-run.
-- ============================================================================

-- ── Scalar: used inside the feed RPCs and by the stack screen ───────────────
CREATE OR REPLACE FUNCTION public.list_certify_count(p_list_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT count(*)::bigint
  FROM public.interactions i
  WHERE i.target_list_id = p_list_id
    AND i.type = 'endorse_list';
$function$;

COMMENT ON FUNCTION public.list_certify_count(uuid) IS
  'True endorsement count for a stack, independent of the viewer. SECURITY DEFINER because RLS on interactions hides a sealed member''s endorsement from non-followers, which made the displayed total differ per viewer. Returns an aggregate only — never a row, never an identity.';

-- ── Batch: one round trip for a page of stacks ─────────────────────────────
-- The feed's fallback path renders up to a full page; calling the scalar once
-- per stack would turn one query into sixty.
CREATE OR REPLACE FUNCTION public.list_certify_counts(p_list_ids uuid[])
RETURNS TABLE(list_id uuid, certify_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT t.id, (
    SELECT count(*)::bigint
    FROM public.interactions i
    WHERE i.target_list_id = t.id
      AND i.type = 'endorse_list'
  )
  FROM unnest(p_list_ids) AS t(id);
$function$;

COMMENT ON FUNCTION public.list_certify_counts(uuid[]) IS
  'Batch form of list_certify_count, for a page of stacks. Same guarantees.';

-- A DEFINER function is executable by PUBLIC unless told otherwise, and these
-- are readable aggregates rather than privileged actions — but the grants are
-- stated explicitly rather than inherited, so the intent is on the record.
REVOKE EXECUTE ON FUNCTION public.list_certify_count(uuid)   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_certify_counts(uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_certify_count(uuid)   TO anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.list_certify_counts(uuid[]) TO anon, authenticated;

-- ── The two feed RPCs now report the true count ────────────────────────────
-- Only the certify_count expression changes in each. Everything else — the
-- cursor, the poster cap, the film_count aggregate, the escaping — is carried
-- over byte-for-byte from 20260807_02_stacks_feed_v2.sql, because a rewrite is
-- where a working query quietly loses a clause.
--
-- NOTE: these stay SECURITY INVOKER. That is correct: RLS on `lists` decides
-- WHICH stacks a member may see, and that must keep applying. Only the count
-- subquery needed to escape it, and now it does, through the function above.

-- Copied verbatim from 20260807_02_stacks_feed_v2.sql. EXACTLY ONE line differs:
-- the certify_count expression. I first rewrote this body from memory and it
-- silently lost the block filter (`is_hidden_by`), the username search branch,
-- the null-safe COALESCE on p_search, and the poster clamp — i.e. blocked
-- members' stacks would have reappeared in the feed. Diff this against the
-- previous migration before applying; it should differ on one line only.
CREATE OR REPLACE FUNCTION public.get_filtered_stacks_auth_cursor_v2(
  p_search text DEFAULT ''::text,
  p_filter_following boolean DEFAULT false,
  p_limit integer DEFAULT 60,
  p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_cursor_id uuid DEFAULT NULL::uuid,
  p_poster_count integer DEFAULT 4
)
RETURNS TABLE(id uuid, title text, description text, username text, user_id uuid,
              created_at timestamp with time zone, films jsonb, film_count bigint,
              certify_count bigint, is_ranked boolean)
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  SELECT
    l.id, l.title, l.description,
    p.username, l.user_id, l.created_at,
    -- Only what the card draws. It shows three posters, and it already skips
    -- films with no poster, so that filter moves to the server and the order is
    -- unchanged. A fourth is fetched as headroom.
    COALESCE(
      (SELECT jsonb_agg(f ORDER BY f_created_at ASC)
       FROM (
         SELECT jsonb_build_object('id', li.film_id, 'title', li.film_title,
                                   'poster_path', li.poster_path) AS f,
                li.created_at AS f_created_at
         FROM list_items li
         WHERE li.list_id = l.id AND li.poster_path IS NOT NULL
         ORDER BY li.created_at ASC
         LIMIT LEAST(GREATEST(p_poster_count, 0), 10)
       ) top_films),
      '[]'::jsonb
    ) AS films,
    -- The TRUE size of the stack, independent of how many posters travel.
    (SELECT COUNT(*) FROM list_items li WHERE li.list_id = l.id) AS film_count,
    -- ↓↓↓ THE ONLY CHANGED LINE. Was an inline subquery over `interactions`,
    -- which runs under the caller's RLS because this function is INVOKER.
    public.list_certify_count(l.id) AS certify_count,
    l.is_ranked
  FROM lists l
  JOIN profiles p ON p.id = l.user_id
  WHERE l.is_private = false
    AND (auth.uid() IS NULL OR NOT is_hidden_by(auth.uid(), l.user_id))
    AND (
      COALESCE(p_search, '') = ''
      OR l.title    ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
      OR p.username ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
    )
    AND (
      p_filter_following = false
      OR EXISTS (
        SELECT 1 FROM interactions i
        WHERE i.target_user_id = l.user_id
          AND i.user_id = auth.uid()
          AND i.type = 'follow'
      )
    )
    AND (
      p_cursor_created_at IS NULL
      OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit;
$function$;

-- CREATE OR REPLACE preserves grants, but they are restated so a fresh database
-- built from these migrations alone ends up identical to production.
REVOKE ALL ON FUNCTION public.get_filtered_stacks_auth_cursor_v2(text, boolean, integer, timestamptz, uuid, integer) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_filtered_stacks_auth_cursor_v2(text, boolean, integer, timestamptz, uuid, integer) TO anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_filtered_stacks_auth_cursor_v2(text, boolean, integer, timestamptz, uuid, integer) TO authenticated';
  END IF;
END $$;

-- ============================================================================
-- VERIFY (read-only). Expect: is_definer = true for both new functions, and the
-- feed's count matching the function's for every stack.
-- ============================================================================
-- SELECT proname, prosecdef AS is_definer FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND proname LIKE 'list_certify_count%';
--
-- SELECT l.id, l.title,
--        public.list_certify_count(l.id) AS authoritative,
--        (SELECT count(*) FROM public.interactions i
--          WHERE i.target_list_id = l.id AND i.type = 'endorse_list') AS as_you_see_it
--   FROM public.lists l WHERE l.is_private = false ORDER BY 3 DESC LIMIT 10;
