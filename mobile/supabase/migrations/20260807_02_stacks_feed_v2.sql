-- ════════════════════════════════════════════════════════════════════════════
-- BATCH 20 · #45 + the unescaped stack search
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
--
-- MEASURED, against production, before any of this was written:
--   • the stacks feed ships 247 films — every list_item row in the database —
--     to draw 24 posters. 88% of the payload is film arrays nobody sees.
--   • searching `_` or `%` returns EVERY stack: the function builds its own
--     LIKE pattern and never escapes the term.
--
-- Proven on PostgreSQL 18.4: 20 checks, plus 3 more as the `anon` role, because
-- the first proof ran as a superuser and therefore tested no permissions at all.
-- ════════════════════════════════════════════════════════════════════════════

-- ── PART 0 · one escape, in one place ───────────────────────────────────────
-- SQL LIKE has a CLOSED metacharacter set: `%`, `_`, and the escape character
-- itself. That is the whole list — unlike the PostgREST layer, where a parser
-- also owns `,` `(` `)` and `*` is a third wildcard. So this is complete, and it
-- is provable rather than hopeful.
--
-- Why escape instead of dropping the pattern language: `strpos(lower(t), lower(q))`
-- would need no escaping at all, but it CANNOT use a trigram index, while
-- `ILIKE '%x%'` can. Measured on 60k rows: ILIKE -> Bitmap Index Scan,
-- strpos -> Seq Scan. Since a trigram index is the answer when this table grows,
-- the form that can use one is the one to keep.
CREATE OR REPLACE FUNCTION public.like_escape(p_term text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT replace(replace(replace(COALESCE(p_term, ''), '\', '\\'), '%', '\%'), '_', '\_');
$function$;

REVOKE ALL ON FUNCTION public.like_escape(text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.like_escape(text) TO anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.like_escape(text) TO authenticated';
  END IF;
END $$;

-- ── A DELIBERATE BEHAVIOUR CHANGE, STATED OUT LOUD ──────────────────────────
-- A NULL p_search today returns ZERO stacks: the comparison yields NULL, so every
-- row is filtered out. That is a latent bug, not a feature — "no search term"
-- should show the feed, exactly as an empty string does.
--
-- After this change NULL behaves like '': the full feed. It is written as an
-- explicit COALESCE so the intent is visible, rather than falling out of the
-- helper by accident. The mobile app never sends NULL (it sends a trimmed
-- string), so this cannot affect it either way.

-- ── PART 1 · the search fix, applied IN PLACE to the shipped function ────────
-- Safe for the build already on TestFlight: no column is added or removed, and
-- results change only in the correct direction (searching `_` stops matching
-- every stack). The web app shares this backend and is fixed by the same change.
CREATE OR REPLACE FUNCTION public.get_filtered_stacks_auth_cursor(
  p_search text DEFAULT ''::text,
  p_filter_following boolean DEFAULT false,
  p_limit integer DEFAULT 60,
  p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_cursor_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(id uuid, title text, description text, username text, user_id uuid,
              created_at timestamp with time zone, films jsonb, certify_count bigint,
              is_ranked boolean)
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  SELECT
    l.id, l.title, l.description,
    p.username, l.user_id, l.created_at,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object('id', li.film_id, 'title', li.film_title, 'poster_path', li.poster_path)
        ORDER BY li.created_at ASC
      )
      FROM list_items li WHERE li.list_id = l.id),
      '[]'::jsonb
    ) AS films,
    (SELECT COUNT(*) FROM interactions i
     WHERE i.target_list_id = l.id AND i.type = 'endorse_list') AS certify_count,
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

-- ── PART 2 · the payload fix, as a NEW function ─────────────────────────────
-- NOT an edit of the one above. The shipped build derives "88 FILMS" by counting
-- the array it receives; capping that array there would make every stack read
-- "4 FILMS" for everyone currently on TestFlight, because its validator silently
-- drops fields it does not know about — reintroducing the exact defect batch 15
-- fixed. The new build calls this; the old function is dropped after launch.
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
    (SELECT COUNT(*) FROM interactions i
     WHERE i.target_list_id = l.id AND i.type = 'endorse_list') AS certify_count,
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
