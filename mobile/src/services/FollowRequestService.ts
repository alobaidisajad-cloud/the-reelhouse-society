/**
 * FollowRequestService — the "At the Door" inbox (incoming follow requests).
 * ─────────────────────────────────────────────────────────────────────────
 * Data access for follow requests addressed to the current member. Reads are
 * RLS-safe (interactions_select_authorized lets the target read its own
 * requests); accept/decline route through the audited SECURITY DEFINER RPCs.
 *
 * Built for scale: cursor pagination (created_at keyset), server-side search
 * joined in a single statement, and a single-statement bulk decline. Never
 * loads the whole queue — 3 requests or 3,000 cost the same on the client.
 */
import { supabase } from '@/src/lib/supabase';
import { logger } from '@/src/utils/logger';
import { buildSearchPattern } from '@/src/utils/searchPattern';

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
    // No .toLowerCase(): ilike is already case-insensitive, and lowercasing a
    // term can alter it in some locales for no gain.
    const raw = (search ?? '').trim();
    const pattern = raw ? buildSearchPattern(raw) : null;
    // A term of only separators carries nothing searchable — refuse it rather
    // than fall through and list the whole queue.
    if (raw && pattern === null) return { items: [], nextCursor: null };

    // ── One statement, joined server-side ─────────────────────────────────────
    // This used to resolve matching profile ids first and pass them to the page
    // query with .in(). That had a hard ceiling: the ids travel in the request
    // URL, and the request FAILS OUTRIGHT past roughly 350 of them — measured
    // against production, 300 ids succeed and 400 do not. The cap here was 500,
    // i.e. above the breaking point, and the failure surfaced as an empty door
    // rather than an error. Joining removes the id list entirely, so there is no
    // ceiling to stay under and no second round trip to resolve names.
    //
    // The old note here warned that naming the foreign key is fragile. It is
    // named because a bare embed IS ambiguous — `interactions` has two links to
    // `profiles` (requester and target) and PostgREST rejects the choice. The
    // same named form already ships in LogService and FeedService.
    //
    // !inner is deliberate: a request whose requester profile is not readable is
    // dropped, exactly as the previous code dropped it after the fact — but now
    // the page length is honest instead of silently short.
    let q = supabase
      .from('interactions')
      .select('user_id, created_at, profiles!interactions_user_id_fkey!inner(username, avatar_url)')
      .eq('target_user_id', myId)
      .eq('type', 'follow_request')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (cursor) q = q.lt('created_at', cursor);
    if (pattern) q = q.ilike('profiles.username', `*${pattern}*`);

    const { data: rows, error } = await q;
    if (error) {
      logger.warn('[FollowRequestService.fetchPage] failed:', error.message);
      return { items: [], nextCursor: null };
    }

    type Requester = { username: string; avatar_url: string | null };
    type Row = { user_id: string; created_at: string; profiles: Requester | Requester[] | null };
    const page = (rows ?? []) as Row[];
    const hasMore = page.length > PAGE_SIZE;
    const sliced = hasMore ? page.slice(0, PAGE_SIZE) : page;
    if (sliced.length === 0) return { items: [], nextCursor: null };

    const items: FollowRequest[] = sliced
      .map(r => {
        const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
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
