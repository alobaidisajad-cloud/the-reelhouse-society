import { supabase } from '@/src/lib/supabase';
import { logger } from '@/src/utils/logger';
import type { ModActionRecord } from '@/src/types/moderation';

export const REPORTS_PAGE_SIZE = 30;

/** Compound keyset cursor matching get_priority_reports' ordering. */
export interface PriorityCursor {
  report_count: number;
  created_at: string;
  id: string;
}

/** Evidence bundle returned by the admin-verified get_report_evidence RPC. */
export interface ReportEvidence {
  found: boolean;
  title?: string;
  body?: string;
  route?: string;
}

export const ModerationService = {
  /**
   * One page of the pending docket, newest first (keyset on created_at).
   * The first page rides an exact total on the same round trip.
   */
  async getPendingReports(cursor?: string) {
    let query = supabase
      .from('reports')
      .select(`
        id, content_type, content_id, reason, details, status, created_at, target_user_id,
        reporter:profiles!reporter_id(id, username),
        target_user:profiles!target_user_id(id, username, warning_count, avatar_url)
      `, cursor ? undefined : { count: 'exact' })
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(REPORTS_PAGE_SIZE);
    // `lte` (not `lt`) so reports sharing the boundary's exact timestamp are
    // never skipped; the load-more path dedupes the one overlapping row by id.
    if (cursor) query = query.lte('created_at', cursor);

    const { data, error, count } = await query;
    if (error) throw error;
    return { rows: data || [], total: count ?? null };
  },

  /** Lightweight pending count for the Settings door badge. */
  async getPendingCount(): Promise<number> {
    const { count, error } = await supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    if (error) throw error;
    return count ?? 0;
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

  /**
   * Priority queue via the repaired RPC — the cursor is compound
   * (report_count, created_at, id) to match the RPC's own ordering,
   * so no page can skip or duplicate a case.
   * The RPC returns bare ids; the accused's face and name arrive via
   * one batched profiles lookup per page.
   */
  async getPriorityQueue(limit = 20, cursor?: PriorityCursor) {
    const { data, error } = await supabase.rpc('get_priority_reports', {
      p_limit: limit,
      p_cursor_count: cursor?.report_count ?? null,
      p_cursor_created: cursor?.created_at ?? null,
      p_cursor_id: cursor?.id ?? null,
    });
    if (error) throw error;
    const rows = (data || []) as Record<string, unknown>[];

    const targetIds = [...new Set(rows.map(r => r.target_user_id).filter(Boolean))] as string[];
    if (targetIds.length > 0) {
      try {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, username, warning_count, avatar_url')
          .in('id', targetIds);
        const byId = new Map((profs ?? []).map(p => [p.id as string, p]));
        for (const r of rows) {
          const p = byId.get(r.target_user_id as string);
          if (p) r.target_user = p;
        }
      } catch {
        // Names are context, not verdicts — the docket still renders without them.
      }
    }
    return rows;
  },

  /** The exhibit itself — admin-verified server-side via auth.uid(). */
  async getReportEvidence(reportId: string): Promise<ReportEvidence> {
    const { data, error } = await supabase.rpc('get_report_evidence', {
      p_report_id: reportId,
    });
    if (error) throw error;
    return (data ?? { found: false }) as ReportEvidence;
  },

  /**
   * Enforcement records for a whole page of reports, in ONE query.
   *
   * Replaces a per-card `select('*')` with no limit — 20 cards meant 20
   * unbounded queries, each capable of returning a member's entire audit log to
   * render five rows.
   *
   * ── WHY NOT A PLAIN `.in(userIds)` ──────────────────────────────────────────
   * Because it starves people. One prolific offender's records fill any overall
   * limit and the other nineteen render EMPTY — worse than the N+1 it replaces.
   * The RPC ranks WITHIN each member, so every member on the page gets their own
   * most recent records. Proven on PostgreSQL 18.4: a member with 50 records
   * yields 5 while two members with 2 each still yield 2 and 2.
   */
  async getModerationHistoryForUsers(userIds: string[], perUser = 5): Promise<Record<string, ModActionRecord[]>> {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (ids.length === 0) return {};

    const { data, error } = await supabase.rpc('get_moderation_history_for_users', {
      p_user_ids: ids,
      p_per_user: perUser,
    });
    if (error) {
      // The docket still renders; only the record strip is missing. Never silent.
      logger.warn('[ModerationService.getModerationHistoryForUsers] failed:', error.message);
      return {};
    }

    const byUser: Record<string, ModActionRecord[]> = {};
    for (const row of (data ?? []) as ModActionRecord[]) {
      (byUser[row.target_user_id] ??= []).push(row);
    }
    return byUser;
  },
};
