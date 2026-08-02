-- ═══════════════════════════════════════════════════════════════════════════════
-- Batch 11 · a blocked member's face still appeared on your salon cards
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
-- ⚠️ NO APP CHANGE. Works on the current TestFlight build and the live website.
--
-- ── NOT IN THE REGISTER ──────────────────────────────────────────────────────
-- Found by asking which paths read member data that RLS cannot reach. This one is
-- SECURITY DEFINER, so it runs as the owner and bypasses row-level security
-- entirely — the comment/notification policies in 20260802_02 do not touch it.
--
-- The client cannot fix it either: the function returns (lounge_id, username,
-- avatar_url, rn) and NO user id, so lounge.ts:421 has nothing to filter on. Same
-- shape as the notifications bug, where from_user_id was never selected.
--
-- Result today: block someone in a salon and their face and name still sit on the
-- salon card, every time the list loads.
--
-- ── THE FIX, AND WHY IT SITS WHERE IT DOES ───────────────────────────────────
-- One condition, added INSIDE the CTE's WHERE clause. SQL applies WHERE before
-- window functions, so row_number() never sees the hidden member and the ranking
-- closes up behind them: you still get three faces, drawn from the next members in
-- join order, rather than three slots with a hole where someone used to be.
--
-- Putting it outside the CTE (filtering after `rn <= 3`) would have been the
-- obvious one-liner and the wrong one — a salon whose three earliest members you
-- had all blocked would render an empty avatar stack while the salon was full.
--
-- ── EVERYTHING ELSE IS UNTOUCHED ─────────────────────────────────────────────
-- Body copied from the LIVE pg_proc read, not the repo file (this project has two
-- supabase/ trees and repo has diverged from deployed before — here they matched).
-- Signature, LANGUAGE sql, SECURITY DEFINER, STABLE, SET search_path and the
-- roster gate are all identical. CREATE OR REPLACE preserves the existing EXECUTE
-- grant to authenticated.
--
-- is_hidden_by is STABLE, SECURITY DEFINER and executable by authenticated —
-- verified live before use, the same check that made 20260802_02 safe.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_salon_member_faces(p_lounge_ids uuid[])
RETURNS TABLE(lounge_id uuid, username text, avatar_url text, rn integer)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      lm.lounge_id, p.username, p.avatar_url,
      row_number() OVER (PARTITION BY lm.lounge_id ORDER BY lm.joined_at ASC, lm.user_id ASC) AS rn
    FROM public.lounge_members lm
    JOIN public.profiles p ON p.id = lm.user_id
    WHERE lm.lounge_id = ANY(p_lounge_ids)
      AND lm.status = 'approved'
      AND p.username IS NOT NULL
      -- Blocked or muted members are removed BEFORE row_number() runs, so the
      -- stack still shows three faces instead of leaving a gap.
      AND NOT public.is_hidden_by(auth.uid(), lm.user_id)
      -- Roster gate (mirrors the lounge_members SELECT policy): the caller must
      -- be an approved member of, or the host of, this salon.
      AND (
        EXISTS (SELECT 1 FROM public.lounge_members me
                WHERE me.lounge_id = lm.lounge_id AND me.user_id = auth.uid() AND me.status = 'approved')
        OR auth.uid() = (SELECT creator_id FROM public.lounges WHERE id = lm.lounge_id)
      )
  )
  SELECT lounge_id, username, avatar_url, rn::integer
  FROM ranked WHERE rn <= 3 ORDER BY lounge_id, rn;
$$;

-- ── Verify (run after) ────────────────────────────────────────────────────────
--   SELECT prosrc LIKE '%is_hidden_by%' AS filter_present
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='get_salon_member_faces';
--   -- must be true
--
--   In the app: block a member of one of your salons, then reopen the salon list.
--   Their face is gone and the stack is still full.
--
-- ── Rollback ──────────────────────────────────────────────────────────────────
-- Re-run this file with the `AND NOT public.is_hidden_by(...)` line removed.
