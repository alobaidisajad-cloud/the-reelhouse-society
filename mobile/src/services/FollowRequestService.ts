/**
 * FollowRequestService — the "At the Door" inbox (incoming follow requests).
 * ─────────────────────────────────────────────────────────────────────────
 * Data access for follow requests addressed to the current member. Reads are
 * RLS-safe (interactions_select_authorized lets the target read its own
 * requests); accept/decline route through the audited SECURITY DEFINER RPCs.
 *
 * Built for scale: cursor pagination (created_at keyset), server-side search
 * via a profiles pre-filter, and a single-statement bulk decline. Never loads
 * the whole queue — 3 requests or 3,000 cost the same on the client.
 */
import { supabase } from '@/src/lib/supabase';
import { logger } from '@/src/utils/logger';

export interface FollowRequest {
  /** The requester's user id (argument for accept/decline RPCs). */
  requesterId: string;
  username: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface FollowRequestPage {
  items: FollowRequest[];
  nextCursor: string | null;
}

const PAGE_SIZE = 30;

export const FollowRequestService = {
  /** Live count of pending requests addressed to `myId`. */
  async count(myId: string): Promise<number> {
    const { count, error } = await supabase
      .from('interactions')
      .select('id', { count: 'exact', head: true })
      .eq('target_user_id', myId)
      .eq('type', 'follow_request');
    if (error) {
      logger.warn('[FollowRequestService.count] failed:', error.message);
      return 0;
    }
    return count ?? 0;
  },

  /**
   * One page of requests, newest first. `cursor` is the previous page's last
   * createdAt (keyset). `search` filters by requester username (server-side).
   */
  async fetchPage({ myId, cursor, search }: { myId: string; cursor?: string | null; search?: string }): Promise<FollowRequestPage> {
    const trimmed = (search ?? '').trim().toLowerCase();

    // Server-side search: resolve matching requester ids first, then page.
    let restrictIds: string[] | null = null;
    if (trimmed) {
      const { data: matches, error: matchErr } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', `%${trimmed}%`)
        .limit(500);
      if (matchErr) {
        logger.warn('[FollowRequestService.fetchPage] search resolve failed:', matchErr.message);
        return { items: [], nextCursor: null };
      }
      restrictIds = (matches ?? []).map((m: { id: string }) => m.id);
      if (restrictIds.length === 0) return { items: [], nextCursor: null };
    }

    let q = supabase
      .from('interactions')
      .select('user_id, created_at')
      .eq('target_user_id', myId)
      .eq('type', 'follow_request')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (cursor) q = q.lt('created_at', cursor);
    if (restrictIds) q = q.in('user_id', restrictIds);

    const { data: rows, error } = await q;
    if (error) {
      logger.warn('[FollowRequestService.fetchPage] failed:', error.message);
      return { items: [], nextCursor: null };
    }

    const page = (rows ?? []) as { user_id: string; created_at: string }[];
    const hasMore = page.length > PAGE_SIZE;
    const sliced = hasMore ? page.slice(0, PAGE_SIZE) : page;
    if (sliced.length === 0) return { items: [], nextCursor: null };

    // Resolve requester profiles (FK-name independent — avoids embed fragility).
    const ids = sliced.map(r => r.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', ids);
    const pmap = new Map((profiles ?? []).map((p: { id: string; username: string; avatar_url: string | null }) => [p.id, p]));

    const items: FollowRequest[] = sliced
      .map(r => {
        const p = pmap.get(r.user_id);
        if (!p?.username) return null;
        return { requesterId: r.user_id, username: p.username, avatarUrl: p.avatar_url ?? null, createdAt: r.created_at };
      })
      .filter((x): x is FollowRequest => x !== null);

    const nextCursor = hasMore ? sliced[sliced.length - 1].created_at : null;
    return { items, nextCursor };
  },

  /** Approve a requester → converts follow_request to follow (RPC). */
  async accept(requesterId: string): Promise<boolean> {
    const { error } = await supabase.rpc('accept_follow_request', { requester_id: requesterId });
    if (error) { logger.warn('[FollowRequestService.accept] failed:', error.message); return false; }
    return true;
  },

  /** Turn a requester away → deletes the follow_request (RPC). */
  async decline(requesterId: string): Promise<boolean> {
    const { error } = await supabase.rpc('decline_follow_request', { requester_id: requesterId });
    if (error) { logger.warn('[FollowRequestService.decline] failed:', error.message); return false; }
    return true;
  },

  /** Clear the whole queue in one statement. Returns count cleared, or -1 on error. */
  async declineAll(): Promise<number> {
    const { data, error } = await supabase.rpc('decline_all_follow_requests');
    if (error) { logger.warn('[FollowRequestService.declineAll] failed:', error.message); return -1; }
    return typeof data === 'number' ? data : 0;
  },
};
