-- Undo of 20261117_02: its triggers go, and nothing else; their functions stay until the undo of
-- 20261117_01, which made them. A critique on a page gone is refused by the owner's rule, a
-- certification taken back leaves its notice, and a deleted stack leaves its cards, as before.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── Undo of A4's two triggers (a critique on a page gone is told as such, review round 11) ──
-- The triggers go first, in the undo of the car that made them; their function goes with the undo of
-- 20261117_01, which made it.
DROP TRIGGER IF EXISTS a_critique_has_its_page ON public.log_comments;
DROP TRIGGER IF EXISTS a_critique_has_its_page ON public.list_comments;

-- ── B6's two triggers undone · a certification taken back leaves its notice again ───────────────
--   The triggers go here; their functions go with the undo of 20261117_01, which made them.
DROP TRIGGER IF EXISTS a_certification_takes_its_notice ON public.interactions;
DROP TRIGGER IF EXISTS a_certification_takes_its_notice ON public.dispatch_certifications;

-- ── Undo of F4's trigger: a deleted stack leaves its cards as they were (review round 11) ──
-- The trigger goes here; its function goes with the undo of 20261117_01, which made it.
DROP TRIGGER IF EXISTS a_deleted_stack_leaves_its_cards ON public.lists;
