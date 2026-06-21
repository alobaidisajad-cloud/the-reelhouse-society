-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Society Report System — Full Schema
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- This migration implements the complete database schema for the Society Report
-- System, including:
--   1. Reports table extensions (new columns, constraints, indexes)
--   2. User blocks table (block/mute relationships)
--   3. Moderation actions audit log table
--   4. Warnings table
--   5. Profile extensions (suspension, ban, warning tracking)
--   6. Row Level Security (RLS) policies for all new tables
--   7. RPC functions for atomic operations and admin tooling
--
-- EXECUTION ORDER:
--   - Tables and columns first (schema)
--   - Constraints and indexes second
--   - RLS policies third
--   - RPC functions last (depend on tables existing)
--
-- IDEMPOTENCY:
--   - Uses IF NOT EXISTS for CREATE TABLE / CREATE INDEX
--   - Uses IF NOT EXISTS for ADD COLUMN (safe to re-run)
--   - Uses CREATE OR REPLACE for functions
--   - Constraint creation may fail on re-run if already exists — wrap in DO blocks
--
-- TO APPLY:
--   supabase db push
--   OR: psql -f supabase/migrations/society_report_system.sql
--
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 1: Extend reports table
-- ═══════════════════════════════════════════════════════════════════════════════
-- The existing reports table is extended with:
--   - target_user_id: the user who authored the reported content
--   - resolved_at/resolved_by: resolution tracking
--   - resolution_action/resolution_notes: what action was taken
--   - CHECK constraints for content_type and reason enums
--   - Performance indexes for admin queries

ALTER TABLE reports 
  ALTER COLUMN content_type TYPE text;

-- Add new columns for enhanced report tracking
ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES profiles(id);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES profiles(id);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution_action text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution_notes text;

-- Add CHECK constraint for content_type values (all ReportableContentType enum values)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_content_type_check'
  ) THEN
    ALTER TABLE reports ADD CONSTRAINT reports_content_type_check 
      CHECK (content_type IN (
        'log', 'list', 'log_comment', 'list_comment',
        'dossier', 'dossier_comment', 'lounge_message', 'profile'
      ));
  END IF;
END $$;

-- Add CHECK constraint for reason values (all ReportReason enum values)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_reason_check'
  ) THEN
    ALTER TABLE reports ADD CONSTRAINT reports_reason_check
      CHECK (reason IN (
        'spoiler_unmarked', 'harassment', 'hate_speech', 'spam',
        'inappropriate', 'impersonation', 'misinformation', 'copyright', 'other'
      ));
  END IF;
END $$;

-- Performance indexes for admin report queries
CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_target_user ON reports(target_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_content ON reports(content_type, content_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 2: User blocks table
-- ═══════════════════════════════════════════════════════════════════════════════
-- Stores block and mute relationships between users.
-- Key constraints:
--   - UNIQUE(blocker_id, blocked_id): one relationship per pair
--   - CHECK(blocker_id != blocked_id): cannot block yourself
--   - type must be 'block' or 'mute'
-- Upgrading mute→block replaces existing row (UPSERT on unique constraint)

CREATE TABLE IF NOT EXISTS user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('block', 'mute')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

-- Index for fetching a user's full block list (used by client sync)
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id);
-- Index for checking if a specific user is blocked by anyone (admin queries)
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);
-- Composite index for filtering by type (blocks vs mutes)
CREATE INDEX IF NOT EXISTS idx_user_blocks_type ON user_blocks(blocker_id, type);


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 3: Moderation actions audit log
-- ═══════════════════════════════════════════════════════════════════════════════
-- Records every moderation action taken by admins for full audit trail.
-- Links to the originating report (nullable for manual actions).
-- Tracks duration and expiry for time-limited actions (suspend, mute).

CREATE TABLE IF NOT EXISTS mod_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES reports(id) ON DELETE SET NULL,
  target_user_id uuid NOT NULL REFERENCES profiles(id),
  admin_id uuid NOT NULL REFERENCES profiles(id),
  action text NOT NULL CHECK (action IN (
    'dismiss', 'delete_content', 'warn', 'mute_user',
    'suspend', 'ban', 'permanent_exile'
  )),
  reason text NOT NULL,
  duration_hours int,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for viewing a user's full moderation history
CREATE INDEX IF NOT EXISTS idx_mod_actions_target ON mod_actions(target_user_id, created_at DESC);
-- Index for admin action audit by admin_id
CREATE INDEX IF NOT EXISTS idx_mod_actions_admin ON mod_actions(admin_id, created_at DESC);
-- Index for linking actions back to their source report
CREATE INDEX IF NOT EXISTS idx_mod_actions_report ON mod_actions(report_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 4: Warnings table
-- ═══════════════════════════════════════════════════════════════════════════════
-- Stores individual warnings issued to users by admins.
-- Users can acknowledge warnings (one-way boolean flip).
-- Unacknowledged warnings can be surfaced in-app.

CREATE TABLE IF NOT EXISTS warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES profiles(id),
  reason text NOT NULL,
  acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fetching a user's warning history
CREATE INDEX IF NOT EXISTS idx_warnings_user ON warnings(user_id, created_at DESC);
-- Partial index for quickly finding unacknowledged warnings (for in-app prompts)
CREATE INDEX IF NOT EXISTS idx_warnings_unacknowledged ON warnings(user_id) WHERE acknowledged = false;


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 5: Profile extensions for suspension/ban tracking
-- ═══════════════════════════════════════════════════════════════════════════════
-- Adds columns to the existing profiles table for:
--   - Temporary suspension with expiry and reason
--   - Warning counter for graduated enforcement
--   - Permanent ban status with timestamp

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_until timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspension_reason text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS warning_count int NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at timestamptz;


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 6: Row Level Security (RLS) Policies
-- ═══════════════════════════════════════════════════════════════════════════════
-- Enforces data access rules at the database level:
--   - user_blocks: users can only manage their own block rows
--   - reports: users can submit/view own, admins can view/update all
--   - mod_actions: admins have full access, users see only their own history
--   - warnings: admins insert, users view/acknowledge own, admins view all

-- ── user_blocks RLS ──
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

-- Users can only see their own block/mute relationships
CREATE POLICY "users_select_own_blocks" ON user_blocks
  FOR SELECT USING (blocker_id = auth.uid());

-- Users can only create blocks/mutes from their own account
CREATE POLICY "users_insert_own_blocks" ON user_blocks
  FOR INSERT WITH CHECK (blocker_id = auth.uid());

-- Users can only remove their own blocks/mutes
CREATE POLICY "users_delete_own_blocks" ON user_blocks
  FOR DELETE USING (blocker_id = auth.uid());

-- No UPDATE policy: must delete + re-insert to change type (block↔mute)
-- This prevents accidental data corruption from partial updates

-- ── reports RLS ──
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Users can submit reports (INSERT their own)
CREATE POLICY "users_insert_own_reports" ON reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid());

-- Users can view their own submitted reports
CREATE POLICY "users_select_own_reports" ON reports
  FOR SELECT USING (reporter_id = auth.uid());

-- Admins can view all reports (for Tribunal moderation)
CREATE POLICY "admins_select_all_reports" ON reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can update reports (resolve them)
CREATE POLICY "admins_update_reports" ON reports
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── mod_actions RLS ──
ALTER TABLE mod_actions ENABLE ROW LEVEL SECURITY;

-- Only admins can insert moderation actions
CREATE POLICY "admins_insert_mod_actions" ON mod_actions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can view all moderation actions
CREATE POLICY "admins_select_mod_actions" ON mod_actions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Users can view moderation actions taken against them (transparency)
CREATE POLICY "users_select_own_mod_actions" ON mod_actions
  FOR SELECT USING (target_user_id = auth.uid());

-- ── warnings RLS ──
ALTER TABLE warnings ENABLE ROW LEVEL SECURITY;

-- Only admins can issue warnings
CREATE POLICY "admins_insert_warnings" ON warnings
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Users can view their own warnings
CREATE POLICY "users_select_own_warnings" ON warnings
  FOR SELECT USING (user_id = auth.uid());

-- Users can acknowledge their own warnings (one-way boolean flip to true)
CREATE POLICY "users_acknowledge_own_warnings" ON warnings
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND acknowledged = true);

-- Admins can view all warnings (for context during moderation)
CREATE POLICY "admins_select_all_warnings" ON warnings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 7: RPC Functions
-- ═══════════════════════════════════════════════════════════════════════════════
-- Server-side functions for atomic multi-table operations:
--   - is_blocked_by: check if viewer has blocked an author
--   - get_user_blocks: fetch full block/mute list for client sync
--   - submit_report: create report with rate limiting
--   - resolve_moderation_report_v2: atomic admin resolution with enforcement
--   - bulk_dismiss_reports: batch dismiss multiple reports
--   - get_priority_reports: priority queue ordered by report count

-- ── Block-aware content filtering helper ──
-- Used by server-side queries to exclude content from blocked users
CREATE OR REPLACE FUNCTION is_blocked_by(viewer_id uuid, author_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_blocks 
    WHERE blocker_id = viewer_id AND blocked_id = author_id AND type = 'block'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- ── Get full block/mute list for a user (used by client sync) ──
-- Returns all blocked and muted user IDs for the given user
-- Called on app launch and periodically to sync cross-device changes
CREATE OR REPLACE FUNCTION get_user_blocks(p_user_id uuid)
RETURNS TABLE(blocked_id uuid, type text, created_at timestamptz) AS $$
  SELECT ub.blocked_id, ub.type, ub.created_at
  FROM user_blocks ub
  WHERE ub.blocker_id = p_user_id
  ORDER BY ub.created_at DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- ── Submit report (with rate limiting check) ──
-- Atomic report creation with abuse prevention:
--   - Rate limited to 10 reports per user per hour
--   - Prevents self-reporting on profile content type
--   - Returns the new report UUID on success
CREATE OR REPLACE FUNCTION submit_report(
  p_reporter_id uuid,
  p_content_id uuid,
  p_content_type text,
  p_reason text,
  p_details text DEFAULT NULL,
  p_target_user_id uuid DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_report_id uuid;
  v_recent_count int;
BEGIN
  -- Rate limit: max 10 reports per user per hour
  SELECT COUNT(*) INTO v_recent_count
  FROM reports
  WHERE reporter_id = p_reporter_id
    AND created_at > now() - interval '1 hour';
  
  IF v_recent_count >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum 10 reports per hour';
  END IF;

  -- Prevent self-reporting on profile content type
  IF p_content_type = 'profile' AND p_reporter_id = p_target_user_id THEN
    RAISE EXCEPTION 'Cannot report your own profile';
  END IF;

  -- Insert report
  INSERT INTO reports (reporter_id, content_id, content_type, reason, details, target_user_id, status)
  VALUES (p_reporter_id, p_content_id, p_content_type, p_reason, p_details, p_target_user_id, 'pending')
  RETURNING id INTO v_report_id;

  RETURN v_report_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── Resolve report (atomic admin action) ──
-- Performs the full resolution workflow in a single transaction:
--   1. Validates admin role
--   2. Fetches report details and verifies it's pending
--   3. Executes the enforcement action on the target user
--   4. Updates report status to resolved
--   5. Inserts audit log into mod_actions
--   6. Creates notifications for reporter and offender (if requested)
CREATE OR REPLACE FUNCTION resolve_moderation_report_v2(
  p_report_id uuid,
  p_action text,
  p_admin_id uuid,
  p_reason text,
  p_duration_hours int DEFAULT NULL,
  p_notify_user boolean DEFAULT true
)
RETURNS void AS $$
DECLARE
  v_target_user_id uuid;
  v_reporter_id uuid;
  v_content_id uuid;
  v_content_type text;
  v_expires_at timestamptz;
BEGIN
  -- Verify admin role
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  -- Fetch report details (only pending reports can be resolved)
  SELECT target_user_id, reporter_id, content_id, content_type
  INTO v_target_user_id, v_reporter_id, v_content_id, v_content_type
  FROM reports
  WHERE id = p_report_id AND status = 'pending';

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Report not found or already resolved';
  END IF;

  -- Calculate expiry for time-limited actions (suspend, mute_user)
  IF p_action = 'suspend' AND p_duration_hours IS NOT NULL THEN
    v_expires_at := now() + (p_duration_hours || ' hours')::interval;
  END IF;

  -- 1. Update report status to resolved
  UPDATE reports
  SET status = 'resolved',
      resolved_at = now(),
      resolved_by = p_admin_id,
      resolution_action = p_action
  WHERE id = p_report_id;

  -- 2. Execute enforcement action on target user
  CASE p_action
    WHEN 'warn' THEN
      -- Insert warning record and increment counter
      INSERT INTO warnings (user_id, admin_id, reason)
      VALUES (v_target_user_id, p_admin_id, p_reason);
      UPDATE profiles SET warning_count = warning_count + 1
      WHERE id = v_target_user_id;

    WHEN 'suspend' THEN
      -- Set suspension expiry and reason
      UPDATE profiles
      SET suspended_until = v_expires_at, suspension_reason = p_reason
      WHERE id = v_target_user_id;

    WHEN 'ban' THEN
      -- Permanent ban
      UPDATE profiles
      SET is_banned = true, banned_at = now(), suspension_reason = p_reason
      WHERE id = v_target_user_id;

    WHEN 'permanent_exile' THEN
      -- Permanent exile (strongest enforcement)
      UPDATE profiles
      SET is_banned = true, banned_at = now(), suspension_reason = 'PERMANENT EXILE: ' || p_reason
      WHERE id = v_target_user_id;

    WHEN 'delete_content' THEN
      -- Content deletion is handled by Edge Function (content-type-specific logic)
      -- This case intentionally performs no direct DB operation on profiles
      NULL;

    WHEN 'mute_user' THEN
      -- Temporary mute (uses suspension mechanism with reason prefix)
      UPDATE profiles
      SET suspended_until = v_expires_at, suspension_reason = 'Muted: ' || p_reason
      WHERE id = v_target_user_id;

    WHEN 'dismiss' THEN
      -- No action on user; report is simply closed
      NULL;
  END CASE;

  -- 3. Insert audit log entry
  INSERT INTO mod_actions (report_id, target_user_id, admin_id, action, reason, duration_hours, expires_at)
  VALUES (p_report_id, v_target_user_id, p_admin_id, p_action, p_reason, p_duration_hours, v_expires_at);

  -- 4. Create notifications (if requested)
  IF p_notify_user THEN
    -- Notify reporter that their report was reviewed
    INSERT INTO notifications (user_id, type, title, body, metadata)
    VALUES (
      v_reporter_id,
      'moderation',
      'Report Reviewed',
      'The Tribunal has reviewed your report. Action: ' || p_action,
      jsonb_build_object('report_id', p_report_id, 'action', p_action)
    );

    -- Notify offender (if action taken beyond dismiss)
    IF p_action != 'dismiss' THEN
      INSERT INTO notifications (user_id, type, title, body, metadata)
      VALUES (
        v_target_user_id,
        'moderation',
        'Moderation Notice',
        'The Tribunal has taken action on your account: ' || p_action || '. Reason: ' || p_reason,
        jsonb_build_object('action', p_action, 'reason', p_reason, 'expires_at', v_expires_at)
      );
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── Bulk dismiss reports (admin convenience) ──
-- Allows admins to dismiss multiple low-priority reports at once.
-- Atomically updates all specified pending reports and creates audit entries.
-- Returns the count of reports actually dismissed.
CREATE OR REPLACE FUNCTION bulk_dismiss_reports(
  p_report_ids uuid[],
  p_admin_id uuid,
  p_reason text DEFAULT 'Bulk dismissed'
)
RETURNS int AS $$
DECLARE
  v_count int;
BEGIN
  -- Verify admin role
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  -- Dismiss all specified pending reports
  UPDATE reports
  SET status = 'resolved', resolved_at = now(), resolved_by = p_admin_id, resolution_action = 'dismiss'
  WHERE id = ANY(p_report_ids) AND status = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Insert audit log entry for each dismissed report
  INSERT INTO mod_actions (report_id, target_user_id, admin_id, action, reason)
  SELECT r.id, r.target_user_id, p_admin_id, 'dismiss', p_reason
  FROM reports r WHERE r.id = ANY(p_report_ids);

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── Get priority queue (reports with most duplicates first) ──
-- Returns pending reports ordered by how many times the same content has been
-- reported (most-reported first). Supports cursor-based pagination via p_cursor.
-- Used by admins in the Tribunal priority view to focus on high-impact content.
CREATE OR REPLACE FUNCTION get_priority_reports(p_limit int DEFAULT 20, p_cursor timestamptz DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  content_id uuid,
  content_type text,
  reason text,
  details text,
  reporter_id uuid,
  target_user_id uuid,
  created_at timestamptz,
  report_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.content_id,
    r.content_type,
    r.reason,
    r.details,
    r.reporter_id,
    r.target_user_id,
    r.created_at,
    COUNT(*) OVER (PARTITION BY r.content_id) as report_count
  FROM reports r
  WHERE r.status = 'pending'
    AND (p_cursor IS NULL OR r.created_at < p_cursor)
  ORDER BY report_count DESC, r.created_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


COMMIT;
