-- ═══════════════════════════════════════════════════════════════════════════════
-- BATCH 1A · finding #32 — get_featured_critique must stop publishing every column
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
--
-- THE LEAK. The function is SECURITY DEFINER and `RETURNS SETOF public.logs` with
-- `SELECT l.*`, so it hands an anonymous caller ALL 27 columns of the logs table —
-- including private_notes, viewing_history, watched_with and autopsy. Verified live:
--   POST /rest/v1/rpc/get_featured_critique?select=private_notes  ->  HTTP 200
-- The Lead Story is shown to every viewer, so whichever member is featured has their
-- private archivist notes served to the entire userbase. Because the function is
-- SECURITY DEFINER, fixing the logs RLS policy would NOT close this path.
--
-- THE FIX. Keep `RETURNS SETOF public.logs` and return NULL for the 10 columns the
-- Lead Story never renders. The client (FeaturedCritique.tsx:32) selects exactly 17
-- columns plus an embedded profiles row, so it cannot observe the change.
--
-- WHY NOT `RETURNS TABLE(...)` — the fix originally filed. The client embeds
-- `profiles!logs_user_id_fkey(...)`, and PostgREST can only embed off a function that
-- returns SETOF <table>. Proven live: the embed works here and fails with PGRST200 on
-- an existing RETURNS TABLE function. FeaturedCritique returns null on error, so that
-- fix would have made the Lead Story silently vanish. It would also require DROP +
-- CREATE, discarding EXECUTE grants and leaving a window where every call 500s.
--
-- PROVEN ON A REPLICA of the exact 27-column table before writing this:
--   • the projection compiles and runs
--   • NULL is accepted for watched_date even though the column is NOT NULL
--     (composite row values do not enforce table constraints)
--   • CREATE OR REPLACE preserves the EXECUTE grant (anon=X/postgres before AND after)
--   • prorettype/proretset/proargtypes/prosecdef are byte-identical across the
--     replace, and logs_user_id_fkey is untouched — so the embed cannot break
--
-- ⚠️ INVARIANT: this projection is positional. Adding a column to public.logs will
-- break this function at call time with "Number of returned columns (27) does not
-- match expected column count (28)". That is deliberate — a security boundary must
-- fail closed. Today's `SELECT *` publishes any new column automatically instead.
-- Record this in the migration ledger (batch 32).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_featured_critique()
RETURNS SETOF public.logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id,                              -- 1
    l.user_id,                         -- 2
    l.film_id,                         -- 3
    l.film_title,                      -- 4
    l.rating,                          -- 5
    l.review,                          -- 6
    NULL::date,                        -- 7  watched_date    (unused by the card)
    NULL::text,                        -- 8  format          (unused)
    l.created_at,                      -- 9
    l.poster_path,                     -- 10
    NULL::text,                        -- 11 year            (unused)
    l.status,                          -- 12
    l.is_spoiler,                      -- 13
    l.watched_with,                    -- 14
    NULL::text,                        -- 15 private_notes   ⛔ never leaves the DB
    l.abandoned_reason,                -- 16
    NULL::text,                        -- 17 physical_media  (unused)
    l.is_autopsied,                    -- 18
    l.autopsy,                         -- 19
    NULL::text,                        -- 20 alt_poster      (unused)
    l.editorial_header,                -- 21
    l.drop_cap,                        -- 22
    l.pull_quote,                      -- 23
    NULL::timestamptz,                 -- 24 updated_at      (unused)
    NULL::text,                        -- 25 video_url       (unused)
    NULL::jsonb,                       -- 26 viewing_history ⛔ unused + sensitive
    NULL::integer                      -- 27 view_count      (unused)
  FROM public.logs l
  JOIN public.profiles p ON p.id = l.user_id
  WHERE l.review IS NOT NULL
    AND l.review <> ''
    AND LENGTH(l.review) > 100
    AND l.rating >= 4
    AND COALESCE(p.is_social_private, false) = false
  ORDER BY l.created_at DESC
  LIMIT 1;
END;
$$;

-- ── Verify (run after) ─────────────────────────────────────────────────────────
--   1. private_notes is NULL, not a note:
--      SELECT private_notes FROM public.get_featured_critique();
--   2. the embed still resolves — the Lead Story's author MUST survive:
--      POST /rest/v1/rpc/get_featured_critique
--        ?select=id,user_id,profiles!logs_user_id_fkey(username,role,avatar_url)
--   3. viewing_history is NULL.
--   4. Open the app home screen: author, avatar, rating, review, pull-quote,
--      drop-cap and autopsy all render exactly as before.
--
-- ── Rollback (proven on a replica: restores the note exactly) ───────────────────
-- CREATE OR REPLACE FUNCTION public.get_featured_critique()
-- RETURNS SETOF public.logs
-- LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
-- AS $$
-- BEGIN
--   RETURN QUERY
--   SELECT l.* FROM public.logs l
--   JOIN public.profiles p ON p.id = l.user_id
--   WHERE l.review IS NOT NULL AND l.review != ''
--     AND LENGTH(l.review) > 100 AND l.rating >= 4
--     AND COALESCE(p.is_social_private, false) = false
--   ORDER BY l.created_at DESC LIMIT 1;
-- END;
-- $$;
