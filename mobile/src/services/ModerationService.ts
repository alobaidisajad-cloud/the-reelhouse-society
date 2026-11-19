import { supabase } from '@/src/lib/supabase';
import type { ModActionRecord } from '@/src/types/moderation';

export const REPORTS_PAGE_SIZE = 30;

/** Compound keyset cursor matching get_priority_reports' ordering. */
export interface PriorityCursor {
  report_count: number;
  created_at: string;
  id: string;
}

/** The words of a piece as the house reads them: a page's display name and picture, a salon's cover too. */
export interface PieceWords {
  title?: string | null;
  body?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  cover_image?: string | null;
}

/**
 * Evidence bundle returned by the admin-verified get_report_evidence RPC: the piece as it stands now,
 * and (for a report filed since round 14) the words as they stood when it was reported, and whether
 * they have changed since. A piece deleted since reads found: false, with the words reported beside it.
 */
export interface ReportEvidence extends PieceWords {
  found: boolean;
  /** Not found because an earlier verdict withholds it (round 14): not destroyed; it may come back on appeal. */
  withheld?: boolean;
  /** Withheld, and its appeal filed: it waits for the hearing. */
  appealed?: boolean;
  route?: string;
  reported?: PieceWords;
  changed?: boolean;
}

/** A verdict of the house's, as its member reads it (get_my_verdict). */
export interface MyVerdict {
  id: string;
  action: 'warn' | 'suspend' | 'mute_user' | 'ban' | 'permanent_exile' | 'delete_content';
  reason: string;
  created_at: string;
  duration_hours: number | null;
  expires_at: string | null;
  /** What a removal took: the member's own words, kept with the verdict. */
  removed: { title?: string; body?: string } | null;
  /** Whether an overturned removal puts the piece back where it stood (else only its words come back). */
  restorable: boolean;
  /**
   * A removed log, stack, critique or filing withheld, not yet deleted (round 14): seen by its author
   * alone, kept whole until `appeal_by` unappealed, or until its appeal is heard (no end once filed).
   */
  withheld?: boolean;
  appeal_by?: string | null;
  /** Overturned: whether what it removed was put back where it stood (whole, for a piece withheld). */
  put_back?: boolean;
  /**
   * Its appeal waits and no moderator may hear it yet (the house's only moderator ruled it, or it is about
   * them): it waits for another, never heard by one refused; what it removed stays withheld, whole.
   */
  no_moderator_yet?: boolean;
  lifted_at: string | null;
  lift_reason: string | null;
  appeal: { text: string; filed_at: string; status: 'pending' | 'upheld' | 'overturned'; judged_at: string | null; note: string | null } | null;
  can_appeal: boolean;
}

/** An appeal waiting for the Tribunal (get_pending_appeals). */
export interface PendingAppeal {
  id: string;
  action: MyVerdict['action'];
  reason: string;
  created_at: string;
  duration_hours: number | null;
  expires_at: string | null;
  lifted_at: string | null;
  appeal: string;
  appeal_filed_at: string;
  /** The moderator reading it gave the verdict: they may not hear its appeal. */
  ruled_by_you: boolean;
  /** Why the moderator reading it may not hear it: they ruled, or the verdict is about them; none when they may. */
  refused?: 'OWN_VERDICT' | 'OWN_CASE' | null;
  /** No moderator of the house may hear it yet: it waits for another to be appointed. */
  no_moderator_yet?: boolean;
  ruled_by: string | null;
  member: { id: string | null; username: string | null; avatar_url: string | null; is_banned: boolean; exiled: boolean; suspended_until: string | null };
  case: { content_type: string; reason: string; details: string | null } | null;
  removed: { title?: string; body?: string } | null;
  restorable: boolean;
  /** The piece it removed is withheld whole for this hearing (round 14). */
  withheld?: boolean;
}

/** A member under a ban or a suspension now (get_sanctioned_members). */
export interface SanctionedMember {
  id: string;
  username: string | null;
  avatar_url: string | null;
  is_banned: boolean;
  exiled: boolean;
  suspended_until: string | null;
  reason: string | null;
  since: string | null;
}

/** The Tribunal door's count: the cases pending, and the appeals this moderator may hear. */
export interface TribunalWaiting { cases: number; appeals: number }

/** One of the member's own pieces the house withholds (get_my_withheld_pieces, round 14). */
export interface WithheldPiece {
  kind: 'log' | 'list' | 'log_comment' | 'list_comment' | 'dispatch_comment' | 'dispatch_post';
  piece_id: string;
  verdict_id: string;
  /** Kept whole until then unappealed; none once an appeal is filed (kept until it is heard). */
  appeal_by: string | null;
  appealed: boolean;
}

const asCount = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0);

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

  /**
   * Dismisses the cases named, and answers how many the house closed: only those still pending
   * are, so a case another moderator judged meanwhile is not counted. Null when the answer is not
   * a count, so the screen never states a number the house did not give.
   */
  async bulkDismiss(reportIds: string[], adminId: string, reason?: string): Promise<number | null> {
    const { data, error } = await supabase.rpc('bulk_dismiss_reports', {
      p_report_ids: reportIds,
      p_admin_id: adminId,
      p_reason: reason ?? 'Bulk dismissed',
    });
    if (error) throw error;
    return typeof data === 'number' && Number.isInteger(data) && data >= 0 ? data : null;
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
      // The accused is who the case is AGAINST. Without them a card reads "No
      // member named — this case can only be dismissed": a verdict drawn from a
      // read that failed, offering a real case up for dismissal. So the docket
      // fails whole, and the Tribunal says it could not be read.
      const { data: profs, error: profError } = await supabase
        .from('profiles')
        .select('id, username, warning_count, avatar_url')
        .in('id', targetIds);
      if (profError) throw profError;
      const byId = new Map((profs ?? []).map(p => [p.id as string, p]));
      for (const r of rows) {
        const p = byId.get(r.target_user_id as string);
        if (p) r.target_user = p;
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
    // Thrown, not answered with {}: an empty record reads as a clean one, and a
    // moderator must never judge a repeat offender by a read that failed.
    if (error) throw error;

    const byUser: Record<string, ModActionRecord[]> = {};
    for (const row of (data ?? []) as ModActionRecord[]) {
      (byUser[row.target_user_id] ??= []).push(row);
    }
    return byUser;
  },

  // ── A verdict read whole, appealed once, heard by another; a ban or suspension lifted (round 14) ──

  /** One verdict on the member asking, whole. Refused VERDICT_GONE for another's, or one no longer there. */
  async getMyVerdict(actionId: string): Promise<MyVerdict> {
    const { data, error } = await supabase.rpc('get_my_verdict', { p_action_id: actionId });
    if (error) throw error;
    return data as MyVerdict;
  },

  /** The member's one appeal of a verdict on them. Refused ALREADY_APPEALED for a second. */
  async fileAppeal(actionId: string, appeal: string): Promise<void> {
    const { error } = await supabase.rpc('file_appeal', { p_action_id: actionId, p_appeal: appeal });
    if (error) throw error;
  },

  /** The appeals waiting, oldest first, a page at a time (keyset on the moment filed and the verdict). */
  async getPendingAppeals(cursor?: { appeal_filed_at: string; id: string }, limit = 20): Promise<PendingAppeal[]> {
    const { data, error } = await supabase.rpc('get_pending_appeals', {
      p_cursor_at: cursor?.appeal_filed_at ?? null,
      p_cursor_id: cursor?.id ?? null,
      p_limit: limit,
    });
    if (error) throw error;
    return Array.isArray(data) ? (data as PendingAppeal[]) : [];
  },

  /** An appeal heard: upheld or overturned, with the house's word to the member. Never by the one who ruled. */
  async judgeAppeal(actionId: string, outcome: 'upheld' | 'overturned', note: string): Promise<void> {
    const { error } = await supabase.rpc('judge_appeal', { p_action_id: actionId, p_outcome: outcome, p_note: note });
    if (error) throw error;
  },

  /** The members under a ban or a suspension now, by handle, a page at a time. */
  async getSanctionedMembers(cursor?: { username: string | null; id: string }, limit = 30): Promise<SanctionedMember[]> {
    const { data, error } = await supabase.rpc('get_sanctioned_members', {
      p_cursor_name: cursor ? (cursor.username ?? '') : null,
      p_cursor_id: cursor?.id ?? null,
      p_limit: limit,
    });
    if (error) throw error;
    return Array.isArray(data) ? (data as SanctionedMember[]) : [];
  },

  /** A member's ban and suspension lifted, with a reason they are told. Refused EXILE_STANDS for an exile. */
  async liftSanction(userId: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('lift_sanction', { p_user_id: userId, p_reason: reason });
    if (error) throw error;
  },

  /** The member's own pieces the house withholds: each page of theirs marks them, never as standing. */
  async getMyWithheldPieces(): Promise<WithheldPiece[]> {
    const { data, error } = await supabase.rpc('get_my_withheld_pieces');
    if (error) throw error;
    return Array.isArray(data) ? (data as WithheldPiece[]) : [];
  },

  /** The Tribunal door's count: the cases pending and the appeals this moderator may hear. */
  async getTribunalWaiting(): Promise<TribunalWaiting> {
    const { data, error } = await supabase.rpc('tribunal_waiting');
    if (error) throw error;
    const d = (data ?? {}) as Record<string, unknown>;
    return { cases: asCount(d.cases), appeals: asCount(d.appeals) };
  },

  /** The member's own record of verdicts, newest first, a page at a time (each opens whole: getMyVerdict). */
  async getMyVerdicts(cursor?: { created_at: string; id: string }, limit = 30): Promise<MyVerdictEntry[]> {
    const { data, error } = await supabase.rpc('get_my_verdicts', {
      p_cursor_at: cursor?.created_at ?? null,
      p_cursor_id: cursor?.id ?? null,
      p_limit: limit,
    });
    if (error) throw error;
    return Array.isArray(data) ? (data as MyVerdictEntry[]) : [];
  },
};

/** One verdict on the member's own record (get_my_verdicts): how it stands, opened whole from here. */
export interface MyVerdictEntry {
  id: string;
  action: MyVerdict['action'];
  reason: string;
  created_at: string;
  duration_hours: number | null;
  expires_at: string | null;
  lifted_at: string | null;
  appeal_status: 'pending' | 'upheld' | 'overturned' | null;
  content_type: string | null;
}
