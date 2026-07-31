-- ═══════════════════════════════════════════════════════════════════════════════
-- BATCH 4 · finding #113 — make a block mutual, and sever the follow graph
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
-- ⚠️ PRE-FLIGHT: confirm the index exists live (query at the bottom). The schema
--    dump has been stale three times in this audit; do not trust it here either.
--
-- THE MECHANISM, reproduced on a replica. If Alice blocks Bob:
--     Alice sees Bob's content hidden   -> true   (correct)
--     Bob   sees Alice's content hidden -> FALSE  (the finding)
--     the mutual follow                 -> still intact, both directions
-- Blocking currently only filters the blocker's own feeds. It does not sever
-- anything.
--
-- CONFIRMED, and wider than the finding states: NO RLS POLICY ANYWHERE ENFORCES
-- BLOCKS. The only policies touching user_blocks govern who manages their own
-- list. A blocked member can still comment (log_comments INSERT is
-- `WITH CHECK (auth.uid() = user_id)`, no block test), still follow, and still
-- open the blocker's profile — can_view_user_data never reads user_blocks.
-- Blocks live exclusively inside three feed RPCs.
--
-- ⚠️ THIS IS PARTLY A PRODUCT DECISION, and it was taken deliberately.
-- The app's own copy — "User blocked. Their content is now hidden." — is
-- ACCURATE for one-directional blocking, so this is not a broken promise the way
-- #42 or #26 were. But the action sits in a Report/Block/Mute sheet framed around
-- abuse, where a block is expected to sever contact. Decision: BLOCK BECOMES
-- MUTUAL, MUTE STAYS ONE-DIRECTIONAL. Muting is personal quieting; blocking is a
-- safety action.
--
-- SCOPE, STATED HONESTLY. This makes the *feeds* mutual and severs the follow
-- graph. It does NOT stop a blocked member from opening the blocker's profile or
-- commenting on their logs — blocks are not enforced in RLS at all, and adding
-- that is a larger change belonging to the block-enforcement batch (11). This
-- closes the directionality defect, not the whole enforcement gap.
--
-- PROVEN ON A REPLICA before applying:
--     BEFORE  Bob sees Alice hidden -> false;  follows intact
--     AFTER   Bob sees Alice hidden -> TRUE
--             a new block severs follows BOTH ways -> 0
--             an unrelated member's follow          -> untouched
--             MUTE: muter sees muted hidden -> true
--                   muted sees muter hidden -> FALSE (stays one-way)
--                   mute does NOT sever follows
--             UNBLOCK restores visibility both ways
--             ANON unaffected: nothing hidden, feed rows still shown
--     ROLLBACK restores the previous behaviour exactly
--
-- PERFORMANCE — the gap the finding explicitly flagged, now settled.
-- EXPLAIN ANALYZE against 200,000 block rows:
--     Bitmap Heap Scan -> BitmapOr -> two Bitmap Index Scans on
--     idx_user_blocks_blocker.  ZERO sequential scans.  0.100 ms.
-- No new index is required. The finding feared the reversed branch would need one
-- on blocked_id; because BOTH branches filter on blocker_id, the existing index
-- covers them.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1 · a block hides both ways; a mute stays one-way
CREATE OR REPLACE FUNCTION public.is_hidden_by(viewer_id uuid, author_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- viewer_id is deliberately ignored; the session decides who the viewer is
  -- (batch 2, finding #23). The second branch is intentionally narrower: only a
  -- 'block' is mutual, never a 'mute'.
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = auth.uid()  AND blocked_id = author_id)
       OR (blocker_id = author_id   AND blocked_id = auth.uid() AND type = 'block')
  );
$$;

-- 2 · blocking severs the relationship in both directions
CREATE OR REPLACE FUNCTION public.sever_follows_on_block()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.type = 'block' THEN
    DELETE FROM public.interactions
    WHERE type = 'follow'
      AND ((user_id = NEW.blocker_id AND target_user_id = NEW.blocked_id)
        OR (user_id = NEW.blocked_id AND target_user_id = NEW.blocker_id));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_sever_follows_on_block ON public.user_blocks;
CREATE TRIGGER tr_sever_follows_on_block
  AFTER INSERT OR UPDATE OF type ON public.user_blocks
  FOR EACH ROW EXECUTE FUNCTION public.sever_follows_on_block();

-- ── PRE-FLIGHT (run BEFORE the above; must return the blocker index) ───────────
--   SELECT indexname, indexdef FROM pg_indexes
--    WHERE tablename = 'user_blocks';
--   -- idx_user_blocks_blocker (blocker_id) MUST exist, or the symmetric
--   -- predicate degrades to a sequential scan as the table grows.
--
-- ── Verify (run after) ─────────────────────────────────────────────────────────
--   -- with two throwaway ids, inside a transaction you ROLL BACK:
--   BEGIN;
--     INSERT INTO public.user_blocks(blocker_id, blocked_id, type)
--     VALUES ('<A>', '<B>', 'block');
--     SELECT set_config('request.jwt.claims', '{"sub":"<B>"}', true);
--     SELECT public.is_hidden_by('<B>','<A>');   -- must be TRUE (was false)
--     SELECT count(*) FROM public.interactions
--      WHERE (user_id='<A>' AND target_user_id='<B>')
--         OR (user_id='<B>' AND target_user_id='<A>');   -- must be 0
--   ROLLBACK;
--   -- and confirm the three feeds still return rows for anon.
--
-- ── Rollback (tested — restores the previous behaviour exactly) ────────────────
-- DROP TRIGGER IF EXISTS tr_sever_follows_on_block ON public.user_blocks;
-- DROP FUNCTION IF EXISTS public.sever_follows_on_block();
-- CREATE OR REPLACE FUNCTION public.is_hidden_by(viewer_id uuid, author_id uuid)
-- RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
-- AS $$
--   SELECT EXISTS (SELECT 1 FROM public.user_blocks
--     WHERE blocker_id = auth.uid() AND blocked_id = author_id);
-- $$;
-- NOTE: the rollback cannot restore follow rows the trigger has already deleted.
