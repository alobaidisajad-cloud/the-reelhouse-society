-- ═══════════════════════════════════════════════════════════════════════════════
-- get_salon_member_faces — bounded avatar stack for salon cards. APPLY MANUALLY.
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ do NOT `supabase db push` — same law as the other manual migrations.
--
-- Returns AT MOST 3 members per salon (a window ranks by join order), so a
-- 200-member salon costs the same as a 2-member one. SECURITY DEFINER, but it
-- re-checks the roster rule INSIDE the function (caller must be an approved
-- member or the host of each salon) — so it can never leak the roster of a
-- salon the caller isn't in, exactly like the lounge_members RLS policy.
--
-- The client only ever calls this for salons the user hosts/joined ("Your
-- Salons"); the in-function check is defence-in-depth.
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
      lm.lounge_id,
      p.username,
      p.avatar_url,
      row_number() OVER (
        PARTITION BY lm.lounge_id
        ORDER BY lm.joined_at ASC, lm.user_id ASC
      ) AS rn
    FROM public.lounge_members lm
    JOIN public.profiles p ON p.id = lm.user_id
    WHERE lm.lounge_id = ANY(p_lounge_ids)
      AND lm.status = 'approved'
      AND p.username IS NOT NULL
      -- Roster gate (mirrors the lounge_members SELECT policy): the caller must
      -- be an approved member of, or the host of, this salon.
      AND (
        EXISTS (
          SELECT 1 FROM public.lounge_members me
          WHERE me.lounge_id = lm.lounge_id
            AND me.user_id = auth.uid()
            AND me.status = 'approved'
        )
        OR auth.uid() = (SELECT creator_id FROM public.lounges WHERE id = lm.lounge_id)
      )
  )
  SELECT lounge_id, username, avatar_url, rn::integer
  FROM ranked
  WHERE rn <= 3
  ORDER BY lounge_id, rn;
$$;

GRANT EXECUTE ON FUNCTION public.get_salon_member_faces(uuid[]) TO authenticated;

-- ── Verification (run after) ──
-- As an authenticated user, for a salon you're in:
--   SELECT * FROM public.get_salon_member_faces(ARRAY['<your-lounge-id>']::uuid[]);
--   -> at most 3 rows, rn 1..3.
-- For a salon you are NOT a member/host of: expect 0 rows (roster gate holds).
