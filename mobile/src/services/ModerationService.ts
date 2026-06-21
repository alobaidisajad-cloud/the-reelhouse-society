import { supabase } from '@/src/lib/supabase';

export const ModerationService = {
  async getPendingReports() {
    const { data, error } = await supabase
      .from('reports')
      .select(`
        id, content_type, content_id, reason, details, status, created_at, target_user_id,
        reporter:profiles!reporter_id(id, username),
        target_user:profiles!target_user_id(id, username, warning_count)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // ── Block/Mute CRUD ─────────────────────────────────────────────────────

  async getBlockList(userId: string) {
    const { data, error } = await supabase.rpc('get_user_blocks', { p_user_id: userId });
    if (error) throw error;
    return data || [];
  },

  async insertBlock(blockerId: string, blockedId: string, type: 'block' | 'mute') {
    const { error } = await supabase.from('user_blocks').upsert(
      { blocker_id: blockerId, blocked_id: blockedId, type },
      { onConflict: 'blocker_id,blocked_id' }
    );
    if (error) throw error;
  },

  async removeBlock(blockerId: string, blockedId: string) {
    const { error } = await supabase.from('user_blocks').delete()
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId);
    if (error) throw error;
  },

  // ── Admin Moderation (v2) ───────────────────────────────────────────────

  async resolveReportV2(reportId: string, action: string, meta: { admin_id: string; reason: string; duration_hours?: number; notify_user?: boolean }) {
    const { error } = await supabase.rpc('resolve_moderation_report_v2', {
      p_report_id: reportId,
      p_action: action,
      p_admin_id: meta.admin_id,
      p_reason: meta.reason,
      p_duration_hours: meta.duration_hours ?? null,
      p_notify_user: meta.notify_user ?? true,
    });
    if (error) throw error;
  },

  async bulkDismiss(reportIds: string[], adminId: string, reason?: string) {
    const { data, error } = await supabase.rpc('bulk_dismiss_reports', {
      p_report_ids: reportIds,
      p_admin_id: adminId,
      p_reason: reason ?? 'Bulk dismissed',
    });
    if (error) throw error;
    return data;
  },

  async getPriorityQueue(limit = 20, cursor?: string) {
    const { data, error } = await supabase.rpc('get_priority_reports', {
      p_limit: limit,
      p_cursor: cursor ?? null,
    });
    if (error) throw error;
    return data || [];
  },

  async getUserModerationHistory(userId: string) {
    const { data, error } = await supabase
      .from('mod_actions')
      .select('*')
      .eq('target_user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
};
