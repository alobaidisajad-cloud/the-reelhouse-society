-- ═══════════════════════════════════════════════════════════════════════════════
-- SECURITY FIX: Server-side ban enforcement on write operations
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Problem: The useBanCheck() hook is client-side only. A banned user can bypass
-- it via the offline queue race window (banned while offline → queue flushes
-- before auth state refreshes) or a patched client. The offline queue verifies
-- session ownership but does NOT check is_banned.
--
-- Fix: Add a ban check to all INSERT/UPDATE RLS policies on user-content tables.
-- This is the canonical, unforgeable enforcement layer. Even if the client
-- bypasses all local checks, Supabase will reject the write at the DB level.
--
-- Implementation: Uses a reusable function to avoid duplicating the subquery
-- in every policy (and to make ban logic changes a single-point update).
--
-- IMPORTANT: Run this AFTER confirming which tables already have INSERT/UPDATE
-- policies. If a table uses permissive policies, you may need to convert to
-- restrictive or add the ban check to existing policies rather than creating
-- new ones. The approach below creates RESTRICTIVE policies that layer on top
-- of existing permissive ones.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Helper function: Is the current user banned? ──
-- Returns FALSE if user is banned (used in WITH CHECK clauses).
-- Using a function keeps policies DRY and avoids N+1 subquery per row.
CREATE OR REPLACE FUNCTION is_user_not_banned()
RETURNS boolean AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_banned = true
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ── Restrictive policies: block banned users from writing ──
-- These layer ON TOP of existing permissive policies. A request must pass
-- BOTH the existing permissive policy AND this restrictive policy.

-- logs table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ban_block_logs_insert' AND tablename = 'logs') THEN
    EXECUTE 'CREATE POLICY "ban_block_logs_insert" ON logs AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_user_not_banned())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ban_block_logs_update' AND tablename = 'logs') THEN
    EXECUTE 'CREATE POLICY "ban_block_logs_update" ON logs AS RESTRICTIVE FOR UPDATE TO authenticated WITH CHECK (is_user_not_banned())';
  END IF;
END $$;

-- interactions table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ban_block_interactions_insert' AND tablename = 'interactions') THEN
    EXECUTE 'CREATE POLICY "ban_block_interactions_insert" ON interactions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_user_not_banned())';
  END IF;
END $$;

-- list_items table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ban_block_list_items_insert' AND tablename = 'list_items') THEN
    EXECUTE 'CREATE POLICY "ban_block_list_items_insert" ON list_items AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_user_not_banned())';
  END IF;
END $$;

-- lists table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ban_block_lists_insert' AND tablename = 'lists') THEN
    EXECUTE 'CREATE POLICY "ban_block_lists_insert" ON lists AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_user_not_banned())';
  END IF;
END $$;

-- watchlists table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ban_block_watchlists_insert' AND tablename = 'watchlists') THEN
    EXECUTE 'CREATE POLICY "ban_block_watchlists_insert" ON watchlists AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_user_not_banned())';
  END IF;
END $$;

-- log_comments table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ban_block_log_comments_insert' AND tablename = 'log_comments') THEN
    EXECUTE 'CREATE POLICY "ban_block_log_comments_insert" ON log_comments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_user_not_banned())';
  END IF;
END $$;

-- list_comments table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ban_block_list_comments_insert' AND tablename = 'list_comments') THEN
    EXECUTE 'CREATE POLICY "ban_block_list_comments_insert" ON list_comments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_user_not_banned())';
  END IF;
END $$;

-- lounge_messages table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ban_block_lounge_messages_insert' AND tablename = 'lounge_messages') THEN
    EXECUTE 'CREATE POLICY "ban_block_lounge_messages_insert" ON lounge_messages AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_user_not_banned())';
  END IF;
END $$;

-- dispatch_dossiers table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ban_block_dossiers_insert' AND tablename = 'dispatch_dossiers') THEN
    EXECUTE 'CREATE POLICY "ban_block_dossiers_insert" ON dispatch_dossiers AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_user_not_banned())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ban_block_dossiers_update' AND tablename = 'dispatch_dossiers') THEN
    EXECUTE 'CREATE POLICY "ban_block_dossiers_update" ON dispatch_dossiers AS RESTRICTIVE FOR UPDATE TO authenticated WITH CHECK (is_user_not_banned())';
  END IF;
END $$;

-- dossier_comments table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ban_block_dossier_comments_insert' AND tablename = 'dossier_comments') THEN
    EXECUTE 'CREATE POLICY "ban_block_dossier_comments_insert" ON dossier_comments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_user_not_banned())';
  END IF;
END $$;

-- ── Note: DELETE operations are intentionally NOT blocked ──
-- A banned user should still be able to delete their own content
-- (e.g., removing a log they posted before being banned).
-- Only creation/modification of new content is blocked.
