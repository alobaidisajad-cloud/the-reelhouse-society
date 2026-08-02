-- ═══════════════════════════════════════════════════════════════════════════════
-- Batch 11 · blocking someone now actually hides them
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
-- ⚠️ NO APP CHANGE REQUIRED — this works on the current TestFlight build and on
--    the live website the moment it runs.
--
-- ── WHAT IS BROKEN ────────────────────────────────────────────────────────────
-- You can block someone from a comment's action sheet and their comment stays on
-- screen. Verified in the client: app/log/[id].tsx, app/stacks/[id].tsx and
-- app/dossier/[id].tsx all import the block store ONLY to call blockUser/muteUser
-- — none of them filters what it renders. LogService.getLogComments and
-- StackService.getStackComments contain no block reference at all.
--
-- Notifications are worse: the client query does not even SELECT from_user_id, so
-- filtering there is currently impossible client-side.
--
-- ── WHY THIS IS SERVER-SIDE AND NOT A CLIENT PATCH ───────────────────────────
-- Two reasons, both measured rather than assumed.
--
-- 1. A CLIENT-ONLY FIX BREAKS THE DOSSIER. app/dossier/[id].tsx takes its comment
--    count from the server with `{ count: 'exact' }` — unfiltered — and drives the
--    "LOAD EARLIER · N MORE" button from `commentTotal > comments.length`. Its
--    keyset cursor is the oldest VISIBLE comment. Filter client-side and that
--    button never disappears, and once a blocked author owns the true oldest row
--    the next page re-fetches rows already seen, dedupes them to nothing, and the
--    list is stuck. Filtering here instead makes count and content agree for free,
--    because `count: 'exact'` runs through RLS.
--
-- 2. THIS PROJECT CANNOT SHIP A BUILD until all 33 batches are done. A client-only
--    fix would protect nobody for weeks. This protects everyone today, on the app
--    AND the website.
--
-- It is also the pattern this codebase already chose: 20260620_feed_block_filtering
-- moved feed filtering to the query layer for exactly the pagination reason above,
-- and kept the client filter only as a backstop. The client filters land alongside
-- this as defence in depth, not as the gate.
--
-- ── WHY RESTRICTIVE ──────────────────────────────────────────────────────────
-- Every existing SELECT policy on these tables is PERMISSIVE, and permissive
-- policies combine with OR — so a new permissive policy that restricts is silently
-- ignored. Proven during batch 5, not read somewhere. RESTRICTIVE policies AND
-- together with what is already there, which is the only thing that works.
--
-- ── THE HELPER, VERIFIED LIVE ────────────────────────────────────────────────
-- public.is_hidden_by(viewer_id uuid, author_id uuid) — STABLE, SECURITY DEFINER,
-- EXECUTE granted to authenticated, anon, service_role and PUBLIC. Checked before
-- writing this: an RLS expression is evaluated with the QUERYING role's privileges,
-- so a helper the caller cannot execute would have made these tables unreadable for
-- everyone. Its live body:
--
--     SELECT EXISTS (
--       SELECT 1 FROM public.user_blocks
--       WHERE (blocker_id = auth.uid() AND blocked_id = author_id)
--          OR (blocker_id = author_id  AND blocked_id = auth.uid() AND type = 'block')
--     );
--
-- It ignores its viewer_id argument and reads the session, so it cannot be spoofed
-- by passing someone else's id. It hides people you blocked OR muted, and people
-- who blocked you (block only — a mute is private and one-directional).
--
-- ⚠️ MUTE IS TREATED AS BLOCK HERE, DELIBERATELY. That matches BlockStore.isHidden()
-- and every other filtered surface in the app. One coherent rule beats a surface
-- that half-hides someone. The mute toast currently promises only "hidden from your
-- feeds" — the copy is being corrected to match, rather than the rule weakened.
--
-- ── ANON IS UNAFFECTED ───────────────────────────────────────────────────────
-- auth.uid() is NULL for a logged-out reader, so no row in user_blocks matches and
-- is_hidden_by returns false. Logged-out visitors see exactly what they see today.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1 · log comments  (#106, and the log third of #92)
DROP POLICY IF EXISTS log_comments_hide_blocked ON public.log_comments;
CREATE POLICY log_comments_hide_blocked ON public.log_comments
  AS RESTRICTIVE FOR SELECT TO authenticated, anon
  USING (NOT public.is_hidden_by(auth.uid(), user_id));

-- 2 · stack comments  (#114, and the stack third of #92)
DROP POLICY IF EXISTS list_comments_hide_blocked ON public.list_comments;
CREATE POLICY list_comments_hide_blocked ON public.list_comments
  AS RESTRICTIVE FOR SELECT TO authenticated, anon
  USING (NOT public.is_hidden_by(auth.uid(), user_id));

-- 3 · dossier comments  (the dossier third of #92 — and this is the one that also
--     repairs the LOAD EARLIER button, because the exact count now matches)
DROP POLICY IF EXISTS dossier_comments_hide_blocked ON public.dossier_comments;
CREATE POLICY dossier_comments_hide_blocked ON public.dossier_comments
  AS RESTRICTIVE FOR SELECT TO authenticated, anon
  USING (NOT public.is_hidden_by(auth.uid(), user_id));

-- 4 · notifications  (#112, in-app half)
--
-- from_user_id IS NULL must stay visible: system notices have no actor, and a
-- RESTRICTIVE policy that failed them would silently delete a whole class of
-- notification from every member's list.
DROP POLICY IF EXISTS notifications_hide_blocked ON public.notifications;
CREATE POLICY notifications_hide_blocked ON public.notifications
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    from_user_id IS NULL
    OR NOT public.is_hidden_by(auth.uid(), from_user_id)
  );

COMMIT;

-- ── Verify (run after) ────────────────────────────────────────────────────────
--   -- all four must report RESTRICTIVE:
--   SELECT c.relname, pol.polname,
--          CASE WHEN pol.polpermissive THEN 'permissive (INERT!)' ELSE 'RESTRICTIVE' END
--     FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
--    WHERE pol.polname LIKE '%hide_blocked';
--
--   In the app: block someone who has commented on a log, a stack and a dossier,
--   then reopen each — the comment is gone, and the dossier's LOAD EARLIER count
--   is correct rather than permanently offering more.
--
-- ── NOT DONE HERE, ON PURPOSE ────────────────────────────────────────────────
-- • Two redundant SELECT policies exist (dossier_comments has two `USING (true)`,
--   notifications has two `USING (auth.uid() = user_id)`). They are NOT dropped:
--   the roles each targets were not checked, and if one covers anon while the other
--   covers authenticated, dropping either silently changes who can read. Tidiness is
--   not worth that. Check polroles first, in its own migration.
-- • notify-push (the edge function that sends the lock-screen banner) has no block
--   awareness in EITHER of its two differing copies, so a blocked person's next
--   action still reaches the phone. Server-side, but outside this batch's scope and
--   needing its own live verification because deployed != repo.
--
-- ── Rollback ──────────────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS log_comments_hide_blocked     ON public.log_comments;
-- DROP POLICY IF EXISTS list_comments_hide_blocked    ON public.list_comments;
-- DROP POLICY IF EXISTS dossier_comments_hide_blocked ON public.dossier_comments;
-- DROP POLICY IF EXISTS notifications_hide_blocked    ON public.notifications;
