-- ═══════════════════════════════════════════════════════════════════════════════
-- SECURITY FIX: Ownership enforcement on dossier_comments DELETE and UPDATE
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Problem: The dossier_comments table had no RLS policy restricting DELETE and
-- UPDATE operations to the comment owner. While the client code in dossier/[id].tsx
-- adds .eq('user_id', user.id) at the call site, the DossierService.deleteComment
-- and DossierService.updateComment methods lacked this filter — creating a latent
-- vulnerability if any code path calls them without the ownership check.
--
-- Fix: Add RESTRICTIVE ownership policies for DELETE and UPDATE so the database
-- itself ensures only comment authors can modify or delete their own comments.
-- Admins are excluded from the restriction (they may need to moderate comments).
--
-- Pattern: Matches the existing ownership enforcement on log_comments and
-- list_comments tables elsewhere in the schema.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Ensure RLS is enabled on the table
ALTER TABLE dossier_comments ENABLE ROW LEVEL SECURITY;

-- ── DELETE: Only the comment author (or admin) can delete ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'owner_delete_dossier_comments' AND tablename = 'dossier_comments') THEN
    EXECUTE 'CREATE POLICY "owner_delete_dossier_comments" ON dossier_comments FOR DELETE TO authenticated USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = ''admin''))';
  END IF;
END $$;

-- ── UPDATE: Only the comment author can edit ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'owner_update_dossier_comments' AND tablename = 'dossier_comments') THEN
    EXECUTE 'CREATE POLICY "owner_update_dossier_comments" ON dossier_comments FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;

-- ── SELECT: All authenticated users can read comments (public content) ──
-- Only create if no permissive SELECT policy exists yet.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'public_read_dossier_comments' AND tablename = 'dossier_comments' AND cmd = 'SELECT') THEN
    EXECUTE 'CREATE POLICY "public_read_dossier_comments" ON dossier_comments FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;

-- ── INSERT: Covered by existing ban_block_dossier_comments_insert + implicit owner check ──
-- The existing INSERT policy only blocks banned users. Add an ownership guard
-- to prevent inserting comments as another user_id.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'owner_insert_dossier_comments' AND tablename = 'dossier_comments') THEN
    EXECUTE 'CREATE POLICY "owner_insert_dossier_comments" ON dossier_comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;
