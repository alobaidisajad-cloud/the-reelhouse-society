-- ════════════════════════════════════════════════════════════════════════════════
-- #54 · The salon list scans every message you can see, twice, on every load
-- ════════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
--
-- ── WHAT IS WRONG ─────────────────────────────────────────────────────────────
-- `fetchLounges` computes unread counts on the device with two queries, and both are
-- unbounded:
--
--   1. every message in every lounge you belong to — no LIMIT, no filter at all —
--      downloaded solely to find the newest timestamp per room
--   2. every message newer than the OLDEST last_read_at across all your rooms —
--      no LIMIT and, worse, NO ORDER BY
--
-- The second is the dangerous one. Without an ORDER BY, any row cap the server applies
-- returns an arbitrary subset, so the unread count is silently WRONG — not late, not
-- slow: wrong, with no way for the client to know.
--
-- The salon list's other four queries are all bounded (100 memberships, 50 browsable,
-- an IN over those ids, and your own rooms). They are left exactly as they are. Only
-- these two scans move.
--
-- ── WHY A NEW FUNCTION AND NOT `get_user_lounges` ─────────────────────────────
-- The register's fix says to call the existing `get_user_lounges(uuid)`. Do not:
--   • it takes a CALLER-SUPPLIED user id rather than using auth.uid()
--   • batch 7 read its LIVE body and found `WHERE TRUE OR …` — unconditionally true,
--     so it returns every lounge, private ones included, for whatever id you pass
--   • its EXECUTE was revoked from anon for that reason (re-probed: 42501)
--   • it returns `invite_code`, which the salon list has no business receiving
--
-- I could not verify that live body myself — EXECUTE is revoked and function sources
-- are not readable with the key I have. So this migration does not depend on it being
-- true: it neither calls nor alters that function, which keeps its zero callers.
--
-- ── SECURITY INVOKER, ON PURPOSE ──────────────────────────────────────────────
-- NOT `SECURITY DEFINER`. The leak above was a DEFINER function that forgot to filter.
-- Running with the caller's own rights means row-level security decides what may be
-- counted, and a mistake in this body cannot become a data leak — the worst it can do
-- is count too little. Every table it touches is already RLS-protected for exactly the
-- rows a member is entitled to.
--
-- auth.uid() is read directly. There is no parameter, so there is nothing to forge.
-- ════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── the index both this function and message paging need ─────────────────────
-- lounge_messages carries NO index at all today. Every read of it is a sequential
-- scan, which is invisible at six rows and is not what this table looks like after
-- launch. One index serves three call sites, all of which filter by room and order by
-- time:
--   • this function, aggregating per room
--   • fetchMessages      — lounge_id = X ORDER BY created_at DESC LIMIT 100
--   • loadMoreMessages   — the compound (created_at, id) cursor added alongside this
--
-- The column order matters: room first (the equality), then the two sort keys in the
-- direction they are read, so the planner can satisfy the cursor from the index
-- without a sort step.
--
-- Plain CREATE INDEX rather than CONCURRENTLY: this table holds 6 rows, so it is
-- instantaneous, and CONCURRENTLY cannot run inside the transaction that makes the
-- rest of this script all-or-nothing.
CREATE INDEX IF NOT EXISTS lounge_messages_lounge_created_id_idx
  ON public.lounge_messages (lounge_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.get_lounge_unread_counts()
RETURNS TABLE (
  lounge_id uuid,
  unread_count bigint,
  last_message_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH my_rooms AS (
    SELECT lm.lounge_id, lm.last_read_at
      FROM public.lounge_members lm
     WHERE lm.user_id = auth.uid()
  )
  SELECT
    r.lounge_id,
    COUNT(m.id) FILTER (
      WHERE r.last_read_at IS NULL OR m.created_at > r.last_read_at
    ) AS unread_count,
    MAX(m.created_at) AS last_message_at
  FROM my_rooms r
  LEFT JOIN public.lounge_messages m ON m.lounge_id = r.lounge_id
  GROUP BY r.lounge_id;
$$;

-- The salon list is a signed-in surface. anon has no memberships, so it would receive
-- an empty set anyway — but saying so explicitly costs nothing and states the intent.
REVOKE ALL ON FUNCTION public.get_lounge_unread_counts() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_lounge_unread_counts() FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_lounge_unread_counts() TO authenticated';
  END IF;
END $$;

-- ── refuse to commit a half-applied change ────────────────────────────────────
DO $$
DECLARE v_kind text; v_secdef boolean;
BEGIN
  SELECT p.prokind, p.prosecdef INTO v_kind, v_secdef
    FROM pg_proc p
   WHERE p.proname = 'get_lounge_unread_counts'
     AND p.pronamespace = 'public'::regnamespace;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'get_lounge_unread_counts was not created. NOTHING changed — the whole script rolled back.';
  END IF;

  IF v_secdef THEN
    RAISE EXCEPTION 'get_lounge_unread_counts is SECURITY DEFINER. That is the shape of the leak this deliberately avoids. Rolled back.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='lounge_messages_lounge_created_id_idx') THEN
    RAISE EXCEPTION 'the supporting index was not created. NOTHING changed — rolled back.';
  END IF;

  RAISE NOTICE 'OK — unread counts in one bounded server-side pass, and the index that serves it.';
END $$;

COMMIT;
