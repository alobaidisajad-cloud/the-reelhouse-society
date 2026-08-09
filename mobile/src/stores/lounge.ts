import * as Crypto from 'expo-crypto';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { create } from 'zustand';
import { queryClient } from '../lib/queryClient';
import { supabase } from '../lib/supabase';
import { LoungeMessagePayloadSchema } from '../services/LoungeService';
import { logger } from '../utils/logger';
import { isNetworkError } from '../utils/networkError';
import { enqueueMutation, flushOfflineQueue, getOfflineQueue } from '../utils/offlineQueue';
import reelToast from '../utils/reelToast';
import { sanitizeInput } from '../utils/sanitizeInput';
import type { LoungeMember } from '../types/social.types';
import { useAuthStore } from './auth';
import { memberUnchanged } from './domain/helpers/sessionGuard';
import { useBlockStore } from './blockStore';
import { registerStoreReset } from './resetAllStores';

// ── Types ──
export interface LoungeRoom {
  id: string;
  name: string;
  description: string;
  is_private: boolean;
  invite_code: string | null;
  creator_id: string;
  created_at: string;
  cover_image?: string | null;
  member_count?: number;
  unread_count?: number;
  last_message?: string;
  last_message_at?: string;
  is_member?: boolean;
  /** The current user's standing in this lounge (drives the "Awaiting" tag). */
  membership_status?: 'approved' | 'pending' | 'muted' | 'banned';
  /** For lounges you host: how many requests are at the door. */
  pending_count?: number;
  /** Up to 3 member faces for the salon card avatar stack (your salons only;
   *  fetched via get_salon_member_faces). Absent/empty → card shows the count. */
  memberFaces?: { username: string; avatar_url: string | null }[];
}

/**
 * The curated, on-theme reaction set (the Editorial Salon overhaul). Praise in
 * sepia (bravo/adored/riveting/quoted) + a single clean critique (panned, blood).
 * Stored as these stable string keys in `lounge_message_reactions.reaction`.
 */
export const LOUNGE_REACTIONS = ['bravo', 'adored', 'riveting', 'quoted', 'panned'] as const;
export type LoungeReaction = (typeof LOUNGE_REACTIONS)[number];

/** Aggregated reaction state for one dispatch (one row per distinct reaction). */
export interface ReactionSummary {
  reaction: string;
  count: number;
  /** Whether the current user has added this reaction (drives the highlighted chip). */
  mine: boolean;
}

export interface LoungeMessage {
  id: string;
  lounge_id: string;
  user_id: string;
  username: string;
  avatar_url?: string;
  content: string;
  type: 'text' | 'film_share' | 'log_share' | 'system' | string;
  reply_to_id?: string | null;
  reply_to_username?: string | null;
  reply_to_content?: string | null;
  film_id?: number | null;
  film_title?: string | null;
  film_poster?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  /** Soft-delete tombstone — set by `withdraw_lounge_message`; content is blanked. */
  deleted_at?: string | null;
  /** Client-only lifecycle for optimistic sends. Absent = persisted/sent. */
  status?: 'sending' | 'sent' | 'failed';
  /** Aggregated reactions, attached on fetch and kept live via realtime. */
  reactions?: ReactionSummary[];
}

export interface LoungeMessageMeta {
  film_id?: number;
  film_title?: string;
  film_poster?: string;
  reply_to_id?: string;
  reply_to_username?: string;
  reply_to_content?: string;
  [key: string]: unknown;
}

export interface LoungeState {
  lounges: LoungeRoom[];
  currentMessages: LoungeMessage[];
  currentLoungeId: string | null;
  loading: boolean;
  sending: boolean;
  /** THE HOUSE PULSE — members present on this salon's channel right now. */
  presentCount: number;
  /** Usernames currently at the typewriter (expire after 4s of silence). */
  typingUsers: string[];

  fetchLounges: () => Promise<void>;
  fetchMessages: (loungeId: string) => Promise<void>;
  loadMoreMessages: (loungeId: string) => Promise<void>;
  sendMessage: (loungeId: string, content: string, type?: string, meta?: LoungeMessageMeta) => Promise<boolean>;
  createLounge: (name: string, description: string, isPrivate: boolean) => Promise<string | null>;
  /** Host-only: set (or clear with null) the salon cover — a TMDB backdrop path. */
  setLoungeCover: (loungeId: string, cover: string | null) => Promise<boolean>;
  /** Public lounge: instant join via the SECURITY DEFINER RPC. */
  joinPublicLounge: (loungeId: string) => Promise<boolean>;
  /** Private lounge: ask the host to admit you. Returns the resulting standing. */
  requestMembership: (loungeId: string) => Promise<'requested' | 'joined' | 'error'>;
  leaveLounge: (loungeId: string) => Promise<void>;
  deleteLounge: (loungeId: string) => Promise<boolean>;
  subscribeToLounge: (loungeId: string, opts?: { onMembership?: () => void }) => () => void;
  markRead: (loungeId: string) => Promise<void>;

  // ── Membership roster + host controls (Editorial Salon overhaul) ──
  /** All membership rows visible to the caller (approved roster + pending for the host). */
  fetchMembers: (loungeId: string) => Promise<LoungeMember[]>;
  approveMember: (loungeId: string, userId: string) => Promise<boolean>;
  declineMember: (loungeId: string, userId: string) => Promise<boolean>;
  setMemberStatus: (loungeId: string, userId: string, status: 'approved' | 'muted' | 'banned') => Promise<boolean>;
  removeMember: (loungeId: string, userId: string) => Promise<boolean>;

  // ── THE HOUSE PULSE ──
  /** Throttled "at the typewriter" broadcast on the active salon channel. */
  broadcastTyping: (loungeId: string) => void;

  // ── Reactions · lifecycle (Editorial Salon overhaul) ──
  toggleReaction: (messageId: string, reaction: string) => Promise<void>;
  withdrawMessage: (messageId: string) => Promise<void>;
  retryMessage: (messageId: string) => Promise<void>;
  clearMessages: (loungeId?: string) => void;
  /**
   * Drops messages from anyone the viewer now hides, in place.
   *
   * The lounge already filters on load, on pagination, on realtime insert and on
   * the typing indicator — but nothing re-examined what was ALREADY on screen. So
   * blocking someone mid-conversation showed "User blocked. Their content is now
   * hidden." while their messages sat there until you left the salon and came back.
   */
  purgeHiddenMessages: () => void;
  canSendMessage: (loungeId?: string) => boolean;
  syncGlobalAvatar: (userId: string, avatarUrl: string | null) => void;
  _pendingLeaveLoungeIds: Set<string>;
  _lastMarkReadMap: Record<string, number>;
}

// ── Throttle ── (800ms between sends, matching web)
let _lastSendAt = 0;
const SEND_THROTTLE = 800;

/**
 * Ceiling on messages held in memory for an open lounge — four pages of the
 * 100 loadOlderMessages fetches, so ordinary scroll-back never reaches it.
 *
 * Without a ceiling the array grows for the entire session: the initial page,
 * every page scrolled back, every realtime arrival, every message sent. Each
 * reaction event then maps over the whole array, so a long evening in a busy
 * lounge degrades steadily.
 *
 * Trimming the OLDEST is safe, and the earlier note claiming it would break
 * scroll-back was wrong: loadOlderMessages pages with
 * `.lt('created_at', currentMessages[0].created_at)` — a cursor taken from
 * whatever is oldest at that moment. Dropped history is simply re-fetched on
 * the next scroll up. Applied ONLY when appending; the prepend path must stay
 * free to grow or scrolling back would fight the cap.
 */
export const MESSAGE_WINDOW = 400;
export const capMessages = (msgs: LoungeMessage[]): LoungeMessage[] =>
  msgs.length > MESSAGE_WINDOW ? msgs.slice(msgs.length - MESSAGE_WINDOW) : msgs;

// ── Create lounge cooldown — prevents spam-creation ──
let _lastCreateAt = 0;
const CREATE_COOLDOWN = 30000; // 30s between lounge creations

// ── THE HOUSE PULSE — typing broadcast throttle + expiry ──
let _lastTypingBroadcastAt = 0;
const TYPING_THROTTLE = 2000; // max one broadcast per 2s per member
const TYPING_TTL = 4000;      // a typist goes quiet after 4s of silence
const _typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** The active salon channel — lets broadcastTyping ride the same socket. */
let _activeChannel: RealtimeChannel | null = null;

function clearTypingState(set: (partial: Partial<LoungeState>) => void) {
  for (const t of _typingTimers.values()) clearTimeout(t);
  _typingTimers.clear();
  set({ presentCount: 0, typingUsers: [] });
}

// ── Username cache for Realtime messages — prevents N+1 profile queries ──
const _profileCache = new Map<string, { username: string; avatar_url?: string; ts: number }>();
const _PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const _PROFILE_CACHE_MAX = 100;
async function resolveProfile(userId: string): Promise<{ username: string; avatar_url?: string }> {
  const cached = _profileCache.get(userId);
  if (cached && Date.now() - cached.ts < _PROFILE_CACHE_TTL) return cached;
  if (cached) _profileCache.delete(userId);
  const { data: profile, error } = await supabase.from('profiles').select('username, avatar_url').eq('id', userId).single();

  // A failure must NOT be cached. The fallback below is the string "unknown", and
  // caching it pinned that name to a real member for the full 5-minute TTL — every
  // live dispatch they sent rendered as from "unknown", and because the cache is
  // consulted first, retrying could not clear it. An error path writing a bad value
  // into a cache that is then trusted is the same shape as the notification-badge bug.
  if (error || !profile) {
    if (error) logger.error('[LoungeStore.resolveProfile] lookup failed:', error);
    return { username: 'unknown', avatar_url: undefined };
  }

  const result = { username: profile.username ?? 'unknown', avatar_url: profile.avatar_url };
  if (_profileCache.size >= _PROFILE_CACHE_MAX) {
    const oldest = _profileCache.keys().next().value;
    if (oldest !== undefined) _profileCache.delete(oldest);
  }
  _profileCache.set(userId, { ...result, ts: Date.now() });
  return result;
}

// ── Reaction aggregation ──
interface ReactionRow { message_id: string; reaction: string; user_id: string }

/** Group raw reaction rows into per-message summaries (count + whether mine). */
function summarizeReactions(rows: ReactionRow[], myId: string | undefined): Map<string, ReactionSummary[]> {
  const byMsg = new Map<string, Map<string, ReactionSummary>>();
  for (const r of rows) {
    let perReaction = byMsg.get(r.message_id);
    if (!perReaction) { perReaction = new Map(); byMsg.set(r.message_id, perReaction); }
    const existing = perReaction.get(r.reaction) ?? { reaction: r.reaction, count: 0, mine: false };
    existing.count += 1;
    if (r.user_id === myId) existing.mine = true;
    perReaction.set(r.reaction, existing);
  }
  const out = new Map<string, ReactionSummary[]>();
  for (const [msgId, perReaction] of byMsg) {
    // Stable order = the curated reaction order, with any unknowns appended.
    const ordered = Array.from(perReaction.values()).sort(
      (a, b) => LOUNGE_REACTIONS.indexOf(a.reaction as LoungeReaction) - LOUNGE_REACTIONS.indexOf(b.reaction as LoungeReaction)
    );
    out.set(msgId, ordered);
  }
  return out;
}

/** Apply a single reaction delta to a message's summary array (realtime/optimistic). */
function applyReactionDelta(
  reactions: ReactionSummary[] | undefined,
  reaction: string,
  delta: 1 | -1,
  mine: boolean,
): ReactionSummary[] {
  const next = (reactions ?? []).map(r => ({ ...r }));
  const idx = next.findIndex(r => r.reaction === reaction);
  if (idx === -1) {
    if (delta === 1) next.push({ reaction, count: 1, mine });
  } else {
    next[idx].count += delta;
    if (mine) next[idx].mine = delta === 1;
    if (next[idx].count <= 0) next.splice(idx, 1);
  }
  return next.sort(
    (a, b) => LOUNGE_REACTIONS.indexOf(a.reaction as LoungeReaction) - LOUNGE_REACTIONS.indexOf(b.reaction as LoungeReaction)
  );
}

// ── Raw Realtime payload shape ──
interface RawLoungePayload {
  id: string;
  lounge_id: string;
  user_id: string;
  content: string;
  type: string;
  reply_to_id?: string | null;
  reply_to_username?: string | null;
  reply_to_content?: string | null;
  film_id?: number | null;
  film_title?: string | null;
  film_poster?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  deleted_at?: string | null;
}

// ── Supabase join result shape for lounge_messages + profiles ──
interface LoungeMessageRow {
  id: string;
  lounge_id: string;
  user_id: string;
  content: string;
  type: string;
  reply_to_id?: string | null;
  reply_to_username?: string | null;
  reply_to_content?: string | null;
  film_id?: number | null;
  film_title?: string | null;
  film_poster?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  deleted_at?: string | null;
  profiles: { username: string; avatar_url?: string } | { username: string; avatar_url?: string }[] | null;
}

export const useLoungeStore = create<LoungeState>()((set, get) => ({
  lounges: [],
  currentMessages: [],
  currentLoungeId: null,
  loading: false,
  sending: false,
  presentCount: 0,
  typingUsers: [],
  _pendingLeaveLoungeIds: new Set(),
  _lastMarkReadMap: {},

  fetchLounges: async () => {
    const user = useAuthStore.getState().user;
    const startedAs = user?.id ?? null;
    if (!user) return;
    set({ loading: true });
    try {
      // Fetch lounges where user is a member
      // #55 — this one is the worst of them. On failure `memberRows` was simply
      // undefined, so `memberships` fell back to [] and the salon list rendered as
      // though the member belonged to NOTHING: joined rooms missing, every unread
      // count zero, no message of any kind. Thrown so the existing catch below
      // surfaces it — a visible error beats a confidently wrong list.
      const { data: memberRows, error: memberError } = await supabase
        .from('lounge_members')
        .select('lounge_id, last_read_at, status')
        .eq('user_id', user.id)
        .limit(100);
      if (memberError) throw memberError;

      const memberships = memberRows ?? [];
      const myLoungeIds = memberships.map(r => r.lounge_id);
      const statusMap = new Map(memberships.map(r => [r.lounge_id, (r as { status?: string }).status]));

      // Fetch from three sources to guarantee visibility:
      // 1) Public lounges (browsable by anyone)
      // 2) Lounges user has explicitly joined (via lounge_members)
      // 3) Lounges user created (fallback if lounge_members insert failed)
      // Fetch ALL browsable lounges (public + private — both are visible, private just needs approval)
      const browsablePromise = supabase.from('lounges')
        .select('id, name, description, is_private, invite_code, creator_id, created_at, member_count')
        .order('created_at', { ascending: false })
        .limit(50);

      const myJoinedPromise = myLoungeIds.length > 0 
        ? supabase.from('lounges')
            .select('id, name, description, is_private, invite_code, creator_id, created_at, member_count')
            .in('id', myLoungeIds)
        : Promise.resolve({ data: [] as { id: string; name: string; description: string; is_private: boolean; invite_code: string | null; creator_id: string; created_at: string; member_count: number }[] });

      const myCreatedPromise = supabase.from('lounges')
        .select('id, name, description, is_private, invite_code, creator_id, created_at, member_count')
        .eq('creator_id', user.id);

      const [browsableRes, myJoinedRes, myCreatedRes] = await Promise.all([
        browsablePromise, myJoinedPromise, myCreatedPromise,
      ]);

      // Merge all three, deduplicating by id
      const allLoungesMap = new Map<string, { id: string; name: string; description: string; is_private: boolean; invite_code: string | null; creator_id: string; created_at: string; member_count: number }>();
      if (browsableRes.data) browsableRes.data.forEach(l => allLoungesMap.set(l.id, l));
      if (myJoinedRes.data) myJoinedRes.data.forEach(l => allLoungesMap.set(l.id, l));
      if (myCreatedRes.data) myCreatedRes.data.forEach(l => allLoungesMap.set(l.id, l));

      // Build the combined set of IDs the user "owns or joined"
      const ownedOrJoinedIds = new Set(myLoungeIds);
      if (myCreatedRes.data) myCreatedRes.data.forEach(l => ownedOrJoinedIds.add(l.id));

      // ── #54 · unread counts, computed once on the server ──────────────────────
      // These two numbers used to be worked out here, with two UNBOUNDED queries:
      //   1. every message in every lounge you belong to — no LIMIT and no filter at
      //      all — downloaded solely to find the newest timestamp per room
      //   2. every message newer than the OLDEST last_read_at across all your rooms —
      //      no LIMIT and, worse, NO ORDER BY
      //
      // The second is the dangerous one: with no ordering, any row cap the server
      // applies returns an arbitrary subset, so the count came out silently WRONG —
      // not late, not slow, wrong, with no way for the client to notice.
      //
      // The register said to call the existing get_user_lounges. That one takes a
      // caller-supplied user id instead of reading auth.uid(), returns invite_code,
      // and had its access revoked in batch 7 after it was found returning every
      // lounge regardless of the id passed. This is a new function: no parameter to
      // forge, no invite_code, and SECURITY INVOKER so row security still decides
      // what may be counted.
      //
      // Degrades rather than fails: if the call errors — including before the
      // migration is applied — the salon list still renders, with counts at zero and
      // the reason in the log. A list without badges beats no list.
      const unreadCounts: Record<string, number> = {};
      const lastMessageTimestamps: Record<string, string> = {};

      const loungeIds = memberships.map(m => m.lounge_id);
      if (loungeIds.length > 0) {
        const { data: unreadRows, error: unreadError } = await supabase.rpc('get_lounge_unread_counts');
        if (unreadError) {
          logger.error('[LoungeStore.fetchLounges] unread counts failed:', unreadError);
        } else if (unreadRows) {
          for (const row of unreadRows as { lounge_id: string; unread_count: number; last_message_at: string | null }[]) {
            unreadCounts[row.lounge_id] = Number(row.unread_count) || 0;
            if (row.last_message_at) lastMessageTimestamps[row.lounge_id] = row.last_message_at;
          }
        }
        // Every room the member belongs to gets an entry, whether or not the call
        // returned one — the UI reads these maps directly.
        for (const id of loungeIds) {
          if (!(id in unreadCounts)) unreadCounts[id] = 0;
        }
      }

      // How many requests are at the door, per lounge you host (RLS lets the
      // creator see pending rows). Powers the landing card "at the door" badge.
      const pendingCounts: Record<string, number> = {};
      const ownedIds = (myCreatedRes.data ?? []).map(l => l.id);
      if (ownedIds.length > 0) {
        // Logged, not surfaced: the salon list itself is still correct, and a toast
        // for a badge would be noise. But a silent zero means a host never learns
        // somebody is waiting at their door, so it must be diagnosable.
        const { data: pendingRows, error: pendingError } = await supabase
          .from('lounge_members')
          .select('lounge_id')
          .in('lounge_id', ownedIds)
          .eq('status', 'pending');
        if (pendingError) logger.error('[LoungeStore.fetchLounges] pending-request count failed:', pendingError);
        if (pendingRows) for (const r of pendingRows) pendingCounts[r.lounge_id] = (pendingCounts[r.lounge_id] || 0) + 1;
      }

      // Member faces (avatar stack) — ONLY for salons you host or joined, where
      // the roster is readable. Bounded to 3 per salon by the RPC's window, so a
      // 200-member salon costs the same as a 2-member one. Best-effort: any
      // failure leaves the map empty and every card falls back to its count.
      const facesMap: Record<string, { username: string; avatar_url: string | null }[]> = {};
      const facesIds = Array.from(ownedOrJoinedIds);
      if (facesIds.length > 0) {
        try {
          const { data: faceRows } = await supabase.rpc('get_salon_member_faces', { p_lounge_ids: facesIds });
          if (Array.isArray(faceRows)) {
            for (const r of faceRows as { lounge_id: string; username: string; avatar_url: string | null }[]) {
              (facesMap[r.lounge_id] ??= []).push({ username: r.username, avatar_url: r.avatar_url });
            }
          }
        } catch { /* faces are decorative; the card degrades to the plain count */ }
      }

      // Sort by recent activity
      const loungesList = Array.from(allLoungesMap.values());
      loungesList.sort((a, b) => {
        const aTime = lastMessageTimestamps[a.id] || a.created_at;
        const bTime = lastMessageTimestamps[b.id] || b.created_at;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });

      // Enrich — rooms the user owns or joined get unread_count and last_message_at
      const enriched: LoungeRoom[] = loungesList.map((l) => ({
        id: l.id,
        name: l.name,
        description: l.description ?? '',
        is_private: l.is_private ?? false,
        invite_code: l.invite_code ?? null,
        creator_id: l.creator_id,
        created_at: l.created_at,
        member_count: l.member_count ?? 0,
        unread_count: ownedOrJoinedIds.has(l.id) ? (unreadCounts[l.id] || 0) : undefined,
        last_message_at: lastMessageTimestamps[l.id],
        membership_status: statusMap.get(l.id) as LoungeRoom['membership_status'],
        pending_count: pendingCounts[l.id] || 0,
        memberFaces: facesMap[l.id],
      }));

      // Left mid-flight — see sessionGuard. Writing here would repopulate a store
      // the logout reset has already cleared.
      if (!memberUnchanged(startedAs)) return;
      set({ lounges: enriched, loading: false });
    } catch (err) {
      if (__DEV__) console.warn('[Lounge] fetchLounges failed:', err);
      reelToast.error('Could not retrieve salons — check your connection.');
      set({ loading: false });
    }
  },

  fetchMessages: async (loungeId: string) => {
        const startedAs = useAuthStore.getState().user?.id ?? null;
    set({ currentLoungeId: loungeId, loading: true });
    try {
      const { data, error } = await supabase
        .from('lounge_messages')
        .select('id, lounge_id, user_id, content, type, reply_to_id, reply_to_username, reply_to_content, film_id, film_title, film_poster, metadata, created_at, deleted_at, profiles!lounge_messages_user_id_fkey(username, avatar_url)')
        .eq('lounge_id', loungeId)
        .order('created_at', { ascending: false })
        .limit(100);

      // #55 — supabase-js RESOLVES on a backend failure; it does not throw. So the
      // guard below (`if (data && !error)`) simply skipped the block, the catch never
      // fired, and the screen sat empty with no message, no log and no report. The
      // finding blamed the catch — the catch was always fine. This is the line.
      //
      // Branch rather than return: `set({ loading: false })` runs after the try, so an
      // early return would leave the spinner up forever.
      if (error) {
        logger.error('[LoungeStore.fetchMessages] load failed:', error);
        reelToast.error('Could not load messages — check your connection.');
      } else if (data) {
        const messages: LoungeMessage[] = (data as LoungeMessageRow[]).reverse().map((m) => ({
          id: m.id,
          lounge_id: m.lounge_id,
          user_id: m.user_id,
          username: Array.isArray(m.profiles) ? m.profiles[0]?.username : m.profiles?.username ?? 'unknown',
          avatar_url: Array.isArray(m.profiles) ? m.profiles[0]?.avatar_url : m.profiles?.avatar_url,
          content: m.content,
          type: (m.type as LoungeMessage['type']) ?? 'text',
          reply_to_id: m.reply_to_id,
          reply_to_username: m.reply_to_username,
          reply_to_content: m.reply_to_content,
          film_id: m.film_id,
          film_title: m.film_title,
          film_poster: m.film_poster,
          metadata: m.metadata,
          created_at: m.created_at,
          deleted_at: m.deleted_at,
        }));
        // Offline Queue Stitching
        const queue = getOfflineQueue();
        const pendingMessages = queue.filter(q => q.type === 'send_lounge_message' && q.payload.lounge_id === loungeId);
        
        let finalMessages = [...messages];
        for (const pa of pendingMessages) {
            const p = pa.payload;
            // Append, don't prepend. The fetch above orders created_at
            // descending and then reverses, so `messages` is oldest-first and
            // the newest message is last. A queued message is newer than
            // anything fetched, so its place is the end of the array.
            finalMessages.push({
                id: p._tempId || `offline-${Date.now()}-${Math.random()}`,
                lounge_id: p.lounge_id,
                user_id: p.user_id,
                username: useAuthStore.getState().user?.username || 'anonymous',
                content: p.content,
                type: p.type || 'text',
                reply_to_id: p.reply_to_id,
                reply_to_username: p.reply_to_username,
                reply_to_content: p.reply_to_content,
                film_id: p.film_id,
                film_title: p.film_title,
                film_poster: p.film_poster,
                metadata: p.metadata,
                created_at: new Date().toISOString(),
            } as unknown as LoungeMessage);
        }
        // Attach reactions for the loaded dispatches in one batched query.
        const persistedIds = messages.map(m => m.id);
        if (persistedIds.length > 0) {
          const myId = useAuthStore.getState().user?.id;
          // Logged, not surfaced: the dispatches themselves are correct; only their
          // reactions are missing. Worth knowing about, not worth interrupting for.
          const { data: reactionRows, error: reactionError } = await supabase
            .from('lounge_message_reactions')
            .select('message_id, reaction, user_id')
            .in('message_id', persistedIds);
          if (reactionError) logger.error('[LoungeStore.fetchMessages] reactions failed:', reactionError);
          if (reactionRows && reactionRows.length > 0) {
            const summaries = summarizeReactions(reactionRows as ReactionRow[], myId);
            finalMessages = finalMessages.map(m =>
              summaries.has(m.id) ? { ...m, reactions: summaries.get(m.id) } : m
            );
          }
        }
        set({ currentMessages: finalMessages.filter(m => !useBlockStore.getState().isHidden(m.user_id)) });
      }
    } catch {
      reelToast.error('Could not load messages — check your connection.');
    }
    // Left mid-flight — see sessionGuard. Writing here would repopulate a store
    // the logout reset has already cleared.
    if (!memberUnchanged(startedAs)) return;
    set({ loading: false });
  },

  loadMoreMessages: async (loungeId: string) => {
        const startedAs = useAuthStore.getState().user?.id ?? null;
    const current = get().currentMessages;
    if (current.length === 0) return;
    
    // The oldest message is at index 0 because fetchMessages reverses the chronological array
    const oldestMessage = current[0];
    if (oldestMessage.id.startsWith('optimistic')) return; // Safety

    try {
      const { data, error } = await supabase
        .from('lounge_messages')
        .select('id, lounge_id, user_id, content, type, reply_to_id, reply_to_username, reply_to_content, film_id, film_title, film_poster, metadata, created_at, deleted_at, profiles!lounge_messages_user_id_fkey(username, avatar_url)')
        .eq('lounge_id', loungeId)
        // #57 — a COMPOUND cursor. A bare "created_at <" cursor silently skips every
        // message sharing the boundary timestamp with the oldest one loaded — which is
        // exactly what a burst of chat produces — and the skip is PERMANENT, because
        // the next page starts below them. The id tiebreaker makes the ordering total.
        //
        // Matches the pattern already proven in notificationStore, logSlice,
        // watchlistSlice and FeedService. The sort must carry the same second key, or
        // the filter and the ordering disagree and the cursor means nothing.
        //
        // Both interpolated values come from a row the server produced — a timestamp
        // and a uuid — so neither can carry a character this filter grammar reads.
        .or(`created_at.lt.${oldestMessage.created_at},and(created_at.eq.${oldestMessage.created_at},id.lt.${oldestMessage.id})`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(100);

      // #55, same shape: a backend failure resolved here and was skipped in silence.
      if (error) {
        logger.error('[LoungeStore.loadMoreMessages] load failed:', error);
        reelToast.error('Could not load older messages.');
      } else if (data && data.length > 0) {
        const olderMessages: LoungeMessage[] = (data as LoungeMessageRow[]).reverse().map((m) => ({
          id: m.id,
          lounge_id: m.lounge_id,
          user_id: m.user_id,
          username: Array.isArray(m.profiles) ? m.profiles[0]?.username : m.profiles?.username ?? 'unknown',
          avatar_url: Array.isArray(m.profiles) ? m.profiles[0]?.avatar_url : m.profiles?.avatar_url,
          content: m.content,
          type: (m.type as LoungeMessage['type']) ?? 'text',
          reply_to_id: m.reply_to_id,
          reply_to_username: m.reply_to_username,
          reply_to_content: m.reply_to_content,
          film_id: m.film_id,
          film_title: m.film_title,
          film_poster: m.film_poster,
          metadata: m.metadata,
          created_at: m.created_at,
          deleted_at: m.deleted_at,
        }));
        
        // Prepend older messages (filter blocked/muted)
        const filteredOlder = olderMessages.filter(m => !useBlockStore.getState().isHidden(m.user_id));
        // Left mid-flight — see sessionGuard. Writing here would repopulate a store
        // the logout reset has already cleared.
        if (!memberUnchanged(startedAs)) return;
        set({ currentMessages: [...filteredOlder, ...current] });
      }
    } catch {
      // FIX #10: Surface pagination failures instead of silently swallowing
      reelToast.error('Could not load older messages.');
    }
  },

  clearMessages: () => set({ currentMessages: [] }),

  // Uses the same isHidden() check as fetchMessages, loadMoreMessages, the realtime
  // insert handler and the typing indicator — so a message that survives here is
  // exactly one that would survive a fresh load. No second definition of "hidden".
  purgeHiddenMessages: () => set(state => ({
    currentMessages: state.currentMessages.filter(
      m => !useBlockStore.getState().isHidden(m.user_id)
    ),
  })),

  canSendMessage: (loungeId) => {
    const s = get();
    const targetId = loungeId || s.currentLoungeId;
    return s.currentLoungeId === targetId && !s.sending;
  },

  syncGlobalAvatar: (userId, avatarUrl) => {
    set(state => ({
      currentMessages: state.currentMessages.map(msg =>
        msg.user_id === userId ? { ...msg, avatar_url: avatarUrl ?? undefined } : msg
      ),
    }));
  },

  sendMessage: async (loungeId: string, content: string, type = 'text', meta: LoungeMessageMeta = {}) => {
    const user = useAuthStore.getState().user;
    const startedAs = user?.id ?? null;
    const ALLOWED_TYPES = ['text', 'film_share', 'log_share', 'list_share', 'dossier_share', 'system'] as const;
    const safeType = (ALLOWED_TYPES as readonly string[]).includes(type) ? type : 'text';
    
    // Parity with the offline mutationExecutor path: strip zero-width/control
    // chars and length-cap via the shared sanitizer (was a bare trim+slice).
    // No second, hardcoded cap here. `sanitizeInput` already enforces
    // MAX_LENGTHS.loungeMessage; a `.slice(0, 500)` in front of it was a
    // stricter duplicate that silently truncated at 500 no matter what the
    // composer allowed — so widening the box alone would have changed nothing.
    // One cap, one place.
    const cleanContent = sanitizeInput(content, 'loungeMessage');
    if (!user || (!cleanContent && type === 'text')) return false;

    const now = Date.now();
    if (now - _lastSendAt < SEND_THROTTLE) return false;
    _lastSendAt = now;

    set({ sending: true });

    // Smart schema boundary validation & metadata packaging
    const explicitMetaKeys = ['film_id', 'film_title', 'film_poster', 'reply_to_id', 'reply_to_username', 'reply_to_content'];
    const explicitMeta: Record<string, unknown> = {};
    const nestedMeta: Record<string, unknown> = {};
    
    for (const key in meta) {
      if (explicitMetaKeys.includes(key)) {
        explicitMeta[key] = meta[key];
      } else if (key !== 'metadata') {
        nestedMeta[key] = meta[key];
      }
    }
    
    if (meta.metadata) {
      Object.assign(nestedMeta, meta.metadata);
    }

    const messageId = Crypto.randomUUID();
    const rawPayload = {
      id: messageId,
      lounge_id: loungeId,
      user_id: user.id,
      content: cleanContent,
      type: safeType,
      ...explicitMeta,
      metadata: Object.keys(nestedMeta).length > 0 ? nestedMeta : undefined,
    };
    
    const parseResult = LoungeMessagePayloadSchema.safeParse(rawPayload);
    if (!parseResult.success) {
      logger.warn('[LoungeStore.sendMessage] Payload failed schema validation:', parseResult.error.message);
      set({ sending: false });
      reelToast.error('Message could not be sent.');
      return false;
    }
    const payload = parseResult.data;

    const optimisticMsg = {
      id: messageId,
      username: user.username,
      avatar_url: user.avatar_url,
      created_at: new Date().toISOString(),
      status: 'sending',
      ...payload,
    } as unknown as LoungeMessage;

    set(s => {
      if (s.currentLoungeId === loungeId) {
        return {
          currentMessages: capMessages([...s.currentMessages, optimisticMsg]),
          sending: false,
        };
      }
      return { sending: false };
    });

    try {
      const { data, error } = await supabase.from('lounge_messages')
        .upsert([payload], { onConflict: 'id' })
        .select('id, created_at')
        .single();
      
      if (error) throw error;
      
      // Left mid-flight — see sessionGuard. Writing here would repopulate a store
      // the logout reset has already cleared.
      if (!memberUnchanged(startedAs)) return false;
      set(s => {
        if (s.currentLoungeId !== loungeId) return s;
        const alreadyReplaced = s.currentMessages.some(m => m.id === data.id);
        if (alreadyReplaced) {
          return { currentMessages: s.currentMessages.filter(m => m.id !== optimisticMsg.id) };
        }
        return {
          currentMessages: s.currentMessages.map(m =>
            m.id === optimisticMsg.id
              ? { ...m, id: data.id, created_at: data.created_at, status: 'sent' as const }
              : m
          ).sort((a, b) => {
            const diff = (new Date(a.created_at).getTime() || 0) - (new Date(b.created_at).getTime() || 0);
            return diff !== 0 ? diff : a.id.localeCompare(b.id);
          })
        };
      });
      return true;
    } catch (error: unknown) {
      if (isNetworkError(error)) {
        enqueueMutation({
          type: 'send_lounge_message',
          payload: { ...payload, _tempId: payload.id }
        });
        flushOfflineQueue();
        reelToast('Message queued for offline network transmission.');
        return true;
      }
      // Keep the dispatch and mark it failed so the transcript shows a discreet
      // "Failed · tap to retry" line (lifecycle state) instead of it vanishing.
      set(s => {
        if (s.currentLoungeId !== loungeId) return s;
        return {
          currentMessages: s.currentMessages.map(m =>
            m.id === optimisticMsg.id ? { ...m, status: 'failed' as const } : m
          ),
        };
      });
      reelToast.error('Failed to send message.');
      return false;
    }
  },

  createLounge: async (name, description, isPrivate) => {
    const user = useAuthStore.getState().user;
    const startedAs = user?.id ?? null;
    if (!user) return null;

    const trimmedName = sanitizeInput(name, 'loungeName');
    const trimmedDesc = sanitizeInput(description, 'listDescription');
    if (!trimmedName || trimmedName.length < 2) {
      reelToast.error('Lounge name must be at least 2 characters.');
      return null;
    }
    if (trimmedName.length > 50) {
      reelToast.error('Lounge name cannot exceed 50 characters.');
      return null;
    }

    const now = Date.now();
    if (now - _lastCreateAt < CREATE_COOLDOWN) {
        reelToast.error('Please wait before creating another lounge.');
        return null;
    }
    _lastCreateAt = now;
    
    try {
      // No-code create (Editorial Salon overhaul) — private rooms are gated by
      // the request/admit flow, not an invite code.
      const { data: loungeId, error } = await supabase.rpc('create_lounge', {
        p_name: trimmedName,
        p_description: trimmedDesc,
        p_is_private: isPrivate,
      });

      if (error || !loungeId) {
        logger.error('[LoungeStore.createLounge] RPC failed:', error);
        reelToast.error('Failed to create lounge.');
        // #58 — release the cooldown. It is set BEFORE the call on purpose (it is the
        // anti-double-tap guard while the request is in flight), so the fix is to clear
        // it on the failure paths rather than to move it after success — moving it
        // would leave a window where two taps fire two create_lounge calls.
        _lastCreateAt = 0;
        return null;
      }

      const newLounge: LoungeRoom = {
        id: loungeId,
        name: trimmedName,
        description: trimmedDesc,
        is_private: isPrivate,
        invite_code: null,
        creator_id: user.id,
        created_at: new Date().toISOString(),
        member_count: 1,
        unread_count: 0,
        is_member: true,
      };

      // Left mid-flight — see sessionGuard. Writing here would repopulate a store
      // the logout reset has already cleared.
      //
      // `null`, not bare: this op is declared Promise<string | null>, so a bare
      // return hands back `undefined` and a caller testing `=== null` misses it.
      // tsc did NOT catch this one — the store creator types these methods
      // loosely — which is why the inserted guards were read rather than trusted.
      if (!memberUnchanged(startedAs)) return null;
      set(s => ({ lounges: [newLounge, ...s.lounges] }));

      get().fetchLounges();
      return loungeId;
    } catch (e) {
      logger.error('[LoungeStore.createLounge] Unhandled error:', e);
      reelToast.error('Could not create lounge. Check your connection and try again.');
      // The finding named only the branch above. A throw — the offline case — burns the
      // cooldown just as completely, and is the likelier one in practice.
      _lastCreateAt = 0;
      return null;
    }
  },

  setLoungeCover: async (loungeId, cover) => {
        const startedAs = useAuthStore.getState().user?.id ?? null;
    const prev = get().lounges.find(l => l.id === loungeId)?.cover_image ?? null;
    // Optimistic: patch the single lounges collection so the card updates instantly.
    set(s => ({ lounges: s.lounges.map(l => l.id === loungeId ? { ...l, cover_image: cover } : l) }));
    try {
      const { error } = await supabase.rpc('set_lounge_cover', { p_lounge_id: loungeId, p_cover_image: cover });
      if (error) throw error;
      return true;
    } catch (e) {
      logger.warn('[LoungeStore.setLoungeCover] failed:', e);
      // Revert the optimistic patch on failure — the host sees the truth.
      // Left mid-flight — see sessionGuard. Writing here would repopulate a store
      // the logout reset has already cleared.
      if (!memberUnchanged(startedAs)) return false;
      set(s => ({ lounges: s.lounges.map(l => l.id === loungeId ? { ...l, cover_image: prev } : l) }));
      reelToast.error('Could not update the salon cover.');
      return false;
    }
  },

  joinPublicLounge: async (loungeId) => {
    const user = useAuthStore.getState().user;
    const startedAs = user?.id ?? null;
    if (!user) return false;
    try {
      const { error } = await supabase.rpc('join_public_lounge', { p_lounge_id: loungeId });
      if (error) throw error;
      // Left mid-flight — see sessionGuard. Writing here would repopulate a store
      // the logout reset has already cleared.
      // `false`, not bare — this op's contract is Promise<boolean>. Nobody is
      // reading the result once the member has gone, but the type is the type.
      if (!memberUnchanged(startedAs)) return false;
      set(s => ({
        lounges: s.lounges.map(l => l.id === loungeId
          ? { ...l, is_member: true, member_count: (l.member_count || 0) + 1 }
          : l),
      }));
      await get().fetchLounges();
      queryClient.invalidateQueries({ queryKey: ['lounge_membership', loungeId] });
      queryClient.invalidateQueries({ queryKey: ['lounge_members', loungeId] });
      return true;
    } catch (e) {
      logger.error('[LoungeStore.joinPublicLounge] failed:', e);
      reelToast.error('Could not take a seat. Check your connection and try again.');
      return false;
    }
  },

  requestMembership: async (loungeId) => {
    const user = useAuthStore.getState().user;
    if (!user) return 'error';
    try {
      const { error } = await supabase.rpc('request_lounge_membership', { p_lounge_id: loungeId });
      if (error) throw error;
      return 'requested';
    } catch (e) {
      logger.error('[LoungeStore.requestMembership] failed:', e);
      reelToast.error('Could not send your request. Check your connection and try again.');
      return 'error';
    }
  },

  fetchMembers: async (loungeId) => {
    try {
      const { data, error } = await supabase
        .from('lounge_members')
        .select('user_id, status, created_at, profiles!lounge_members_user_id_fkey(username, avatar_url)')
        .eq('lounge_id', loungeId);
      if (error || !data) return [];
      return data.map((m: Record<string, unknown>) => {
        const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        const p = profile as { username?: string; avatar_url?: string } | undefined;
        return {
          user_id: m.user_id as string,
          username: p?.username ?? 'user',
          avatar_url: p?.avatar_url,
          status: (m.status as LoungeMember['status']) ?? 'approved',
          created_at: m.created_at as string | undefined,
        } satisfies LoungeMember;
      });
    } catch (e) {
      logger.warn('[LoungeStore.fetchMembers] failed:', e);
      return [];
    }
  },

  approveMember: async (loungeId, userId) => {
    try {
      const { error } = await supabase.rpc('approve_lounge_member', { p_lounge_id: loungeId, p_user_id: userId });
      if (error) throw error;
      return true;
    } catch (e) {
      logger.error('[LoungeStore.approveMember] failed:', e);
      reelToast.error('Could not admit this guest.');
      return false;
    }
  },

  declineMember: async (loungeId, userId) => {
    try {
      const { error } = await supabase.rpc('decline_lounge_member', { p_lounge_id: loungeId, p_user_id: userId });
      if (error) throw error;
      return true;
    } catch (e) {
      logger.error('[LoungeStore.declineMember] failed:', e);
      reelToast.error('Could not decline this request.');
      return false;
    }
  },

  setMemberStatus: async (loungeId, userId, status) => {
    try {
      const { error } = await supabase.rpc('set_lounge_member_status', { p_lounge_id: loungeId, p_user_id: userId, p_status: status });
      if (error) throw error;
      return true;
    } catch (e) {
      logger.error('[LoungeStore.setMemberStatus] failed:', e);
      reelToast.error('Could not update this member.');
      return false;
    }
  },

  removeMember: async (loungeId, userId) => {
    try {
      const { error } = await supabase.rpc('remove_lounge_member', { p_lounge_id: loungeId, p_user_id: userId });
      if (error) throw error;
      return true;
    } catch (e) {
      logger.error('[LoungeStore.removeMember] failed:', e);
      reelToast.error('Could not remove this member.');
      return false;
    }
  },

  toggleReaction: async (messageId, reaction) => {
    const user = useAuthStore.getState().user;
    const startedAs = user?.id ?? null;
    if (!user) return;
    const msg = get().currentMessages.find(m => m.id === messageId);
    if (!msg) return;
    // Optimistic toggle from current state.
    const existing = msg.reactions?.find(r => r.reaction === reaction);
    const wasMine = !!existing?.mine;
    const delta: 1 | -1 = wasMine ? -1 : 1;
    set(s => ({
      currentMessages: s.currentMessages.map(m =>
        m.id === messageId ? { ...m, reactions: applyReactionDelta(m.reactions, reaction, delta, !wasMine) } : m
      ),
    }));
    try {
      if (wasMine) {
        const { error } = await supabase
          .from('lounge_message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', user.id)
          .eq('reaction', reaction);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('lounge_message_reactions')
          .insert([{ message_id: messageId, lounge_id: msg.lounge_id, user_id: user.id, reaction }]);
        if (error && error.code !== '23505') throw error; // ignore duplicate
      }
    } catch (e) {
      logger.warn('[LoungeStore.toggleReaction] failed, reverting:', e);
      // Revert the optimistic delta.
      // Left mid-flight — see sessionGuard. Writing here would repopulate a store
      // the logout reset has already cleared.
      if (!memberUnchanged(startedAs)) return;
      set(s => ({
        currentMessages: s.currentMessages.map(m =>
          m.id === messageId ? { ...m, reactions: applyReactionDelta(m.reactions, reaction, (wasMine ? 1 : -1) as 1 | -1, wasMine) } : m
        ),
      }));
    }
  },

  withdrawMessage: async (messageId) => {
        const startedAs = useAuthStore.getState().user?.id ?? null;
    const target = get().currentMessages.find(m => m.id === messageId);
    if (!target) return;
    // Optimistic tombstone (continuity over a jarring disappearance).
    set(s => ({
      currentMessages: s.currentMessages.map(m =>
        m.id === messageId ? { ...m, content: '', deleted_at: new Date().toISOString(), reactions: [] } : m
      ),
    }));
    try {
      const { error } = await supabase.rpc('withdraw_lounge_message', { p_message_id: messageId });
      if (error) throw error;
    } catch (e) {
      // Offline is not a refusal — keep the tombstone and finish the withdrawal
      // when the connection returns. Snapping the message back would resurrect
      // something the member deliberately took down, on a dropped bar of signal.
      if (isNetworkError(e)) {
        enqueueMutation({ type: 'withdraw_lounge_message', payload: { message_id: messageId } });
        flushOfflineQueue();
        reelToast('Withdrawal queued — it will complete when you reconnect.');
        return;
      }
      // A real refusal (not yours to withdraw, row gone) — restore it intact.
      logger.error('[LoungeStore.withdrawMessage] failed, reverting:', e);
      // Left mid-flight — see sessionGuard. Writing here would repopulate a store
      // the logout reset has already cleared.
      if (!memberUnchanged(startedAs)) return;
      set(s => ({
        currentMessages: s.currentMessages.map(m => m.id === messageId ? target : m),
      }));
      reelToast.error('Could not withdraw this dispatch.');
    }
  },

  retryMessage: async (messageId) => {
    const user = useAuthStore.getState().user;
    const startedAs = user?.id ?? null;
    const msg = get().currentMessages.find(m => m.id === messageId);
    if (!user || !msg || msg.status !== 'failed') return;
    set(s => ({
      currentMessages: s.currentMessages.map(m => m.id === messageId ? { ...m, status: 'sending' as const } : m),
    }));
    const payload = {
      id: msg.id,
      lounge_id: msg.lounge_id,
      user_id: user.id,
      content: msg.content,
      type: msg.type,
      reply_to_id: msg.reply_to_id ?? undefined,
      reply_to_username: msg.reply_to_username ?? undefined,
      reply_to_content: msg.reply_to_content ?? undefined,
      film_id: msg.film_id ?? undefined,
      film_title: msg.film_title ?? undefined,
      film_poster: msg.film_poster ?? undefined,
      metadata: msg.metadata,
    };
    try {
      const { data, error } = await supabase.from('lounge_messages')
        .upsert([payload], { onConflict: 'id' })
        .select('id, created_at')
        .single();
      if (error) throw error;
      // Left mid-flight — see sessionGuard. Writing here would repopulate a store
      // the logout reset has already cleared.
      if (!memberUnchanged(startedAs)) return;
      set(s => ({
        currentMessages: s.currentMessages.map(m =>
          m.id === messageId ? { ...m, id: data.id, created_at: data.created_at, status: 'sent' as const } : m
        ),
      }));
    } catch (e) {
      if (isNetworkError(e)) {
        enqueueMutation({ type: 'send_lounge_message', payload: { ...payload, _tempId: payload.id } });
        flushOfflineQueue();
        set(s => ({ currentMessages: s.currentMessages.map(m => m.id === messageId ? { ...m, status: 'sending' as const } : m) }));
        return;
      }
      set(s => ({ currentMessages: s.currentMessages.map(m => m.id === messageId ? { ...m, status: 'failed' as const } : m) }));
      reelToast.error('Still could not send. Try again.');
    }
  },

  leaveLounge: async (loungeId) => {
    const user = useAuthStore.getState().user;
    const startedAs = user?.id ?? null;
    if (!user) return;

    const lounge = get().lounges.find(l => l.id === loungeId);
    if (lounge && lounge.creator_id === user.id) {
        reelToast.error('You created this lounge. Delete it instead of leaving.');
        return;
    }

    set(s => {
      const newSet = new Set(s._pendingLeaveLoungeIds);
      newSet.add(loungeId);
      return { _pendingLeaveLoungeIds: newSet };
    });
    const timeoutId = setTimeout(() => {
      if (get()._pendingLeaveLoungeIds.has(loungeId)) {
        set(s => {
          const newSet = new Set(s._pendingLeaveLoungeIds);
          newSet.delete(loungeId);
          return { _pendingLeaveLoungeIds: newSet };
        });
      }
    }, 5000);

    set(s => {
      const target = s.lounges.find(l => l.id === loungeId);
      if (!target || !target.is_member) return s;
      if (target.is_private) {
        return { lounges: s.lounges.filter(l => l.id !== loungeId) };
      }
      return { 
        lounges: s.lounges.map(l => l.id === loungeId ? { 
          ...l, 
          is_member: false,
          member_count: Math.max(0, (l.member_count || 1) - 1)
        } : l) 
      };
    });

    const { error } = await supabase.from('lounge_members').delete()
      .eq('lounge_id', loungeId)
      .eq('user_id', user.id);

    if (error) {
      // Left mid-flight — see sessionGuard. Writing here would repopulate a store
      // the logout reset has already cleared.
      if (!memberUnchanged(startedAs)) return;
      set(s => {
        const newSet = new Set(s._pendingLeaveLoungeIds);
        newSet.delete(loungeId);
        return { _pendingLeaveLoungeIds: newSet };
      });
      clearTimeout(timeoutId);
      reelToast.error('Failed to leave — please try again.');
      await get().fetchLounges();
    } else {
      queryClient.invalidateQueries({ queryKey: ['lounge_membership', loungeId] });
      queryClient.invalidateQueries({ queryKey: ['lounge_members', loungeId] });
    }
  },

  deleteLounge: async (loungeId) => {
    // No session capture here, deliberately: this op's rollback is a REFETCH
    // (`fetchLounges`), which carries its own guard. There is no direct write
    // after the await to protect, so a capture would be dead weight.
    const user = useAuthStore.getState().user;
    if (!user) return false;
    
    // Optimistic removal
    set(s => ({ lounges: s.lounges.filter(l => l.id !== loungeId) }));
    
    const { error } = await supabase.from('lounges').delete()
      .eq('id', loungeId)
      .eq('creator_id', user.id);
    
    if (error) {
      reelToast.error('Failed to incinerate lounge.');
      await get().fetchLounges(); // Revert
      return false;
    }
    queryClient.invalidateQueries({ queryKey: ['lounge_membership', loungeId] });
    queryClient.invalidateQueries({ queryKey: ['lounge_members', loungeId] });
    return true;
  },

  subscribeToLounge: (loungeId: string, opts?: { onMembership?: () => void }) => {
    const me = useAuthStore.getState().user;
    const channel = supabase
      .channel(`lounge-${loungeId}`, {
        // THE HOUSE PULSE rides the same socket as the transcript —
        // presence keyed by member id; our own typing echoes are muted.
        config: { presence: { key: me?.id ?? 'anon' }, broadcast: { self: false } },
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lounge_messages',
          filter: `lounge_id=eq.${loungeId}`,
        },
        async (payload) => {
          if (!payload.new) return;
          const msg = payload.new as RawLoungePayload;
          // Ignore our own optimistic messages (they're already rendered)
          const existing = get().currentMessages.find(m => m.id === msg.id);
          if (existing) return;

          // Filter messages from blocked/muted users
          if (useBlockStore.getState().isHidden(msg.user_id)) return;

          // Resolve username via cache — prevents N+1 queries in busy lounges
          const { username, avatar_url } = await resolveProfile(msg.user_id);

          const newMsg: LoungeMessage = {
            id: msg.id,
            lounge_id: msg.lounge_id,
            user_id: msg.user_id,
            username,
            avatar_url,
            content: msg.content?.replace(/<[^>]*>/g, '') ?? '',
            type: (msg.type ?? 'text') as LoungeMessage['type'],
            reply_to_id: msg.reply_to_id,
            reply_to_username: msg.reply_to_username,
            reply_to_content: msg.reply_to_content,
            film_id: msg.film_id,
            film_title: msg.film_title,
            film_poster: msg.film_poster,
            metadata: msg.metadata,
            created_at: msg.created_at,
          };

          // Dedup incoming message and re-sort
          //
          // Deliberately NOT session-guarded like the async operations above.
          // This is a long-lived realtime callback, not a call with a member
          // captured at its start — there is nothing to compare against. Its
          // equivalent protection is UNSUBSCRIBING on logout, which the reset at
          // the bottom of this file now actually does; it used to null the
          // channel reference and leave the subscription running.
          set(s => {
            const messagesWithoutOpt = s.currentMessages.filter(m => m.id !== newMsg.id);
            
            return {
              currentMessages: capMessages([...messagesWithoutOpt, newMsg].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())),
            };
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'lounge_messages', filter: `lounge_id=eq.${loungeId}` },
        (payload) => {
          const deletedId = (payload.old as RawLoungePayload)?.id;
          if (deletedId) {
            set(s => ({ currentMessages: s.currentMessages.filter(m => m.id !== deletedId) }));
          }
        }
      )
      // Withdrawn (soft-deleted) dispatches arrive as UPDATEs — flip to a tombstone live.
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'lounge_messages', filter: `lounge_id=eq.${loungeId}` },
        (payload) => {
          const row = payload.new as RawLoungePayload;
          if (!row?.id) return;
          set(s => ({
            currentMessages: s.currentMessages.map(m =>
              m.id === row.id
                ? { ...m, content: row.deleted_at ? '' : (row.content?.replace(/<[^>]*>/g, '') ?? m.content), deleted_at: row.deleted_at ?? m.deleted_at }
                : m
            ),
          }));
        }
      )
      // Reactions appear/disappear live.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lounge_message_reactions', filter: `lounge_id=eq.${loungeId}` },
        (payload) => {
          const r = payload.new as ReactionRow;
          if (!r?.message_id) return;
          const myId = useAuthStore.getState().user?.id;
          // Own reaction is already applied optimistically in toggleReaction —
          // ignore the realtime echo of it so the count can't double.
          if (r.user_id === myId) return;
          set(s => ({
            currentMessages: s.currentMessages.map(m =>
              m.id === r.message_id ? { ...m, reactions: applyReactionDelta(m.reactions, r.reaction, 1, false) } : m
            ),
          }));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'lounge_message_reactions', filter: `lounge_id=eq.${loungeId}` },
        (payload) => {
          const r = payload.old as ReactionRow;
          if (!r?.message_id) return;
          const myId = useAuthStore.getState().user?.id;
          // Own un-react is already applied optimistically — ignore the echo so
          // it can't double-decrement.
          if (r.user_id === myId) return;
          set(s => ({
            currentMessages: s.currentMessages.map(m =>
              m.id === r.message_id ? { ...m, reactions: applyReactionDelta(m.reactions, r.reaction, -1, false) } : m
            ),
          }));
        }
      )
      // Membership changes (a host admits a pending guest, mutes/removes a member,
      // etc.) — let the screen react: a pending member's gate flips to the chat,
      // the host's roster + "at the door" badge refresh.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lounge_members', filter: `lounge_id=eq.${loungeId}` },
        () => { opts?.onMembership?.(); }
      )
      // ── THE HOUSE PULSE: who's in the room right now ──
      .on('presence', { event: 'sync' }, () => {
        set({ presentCount: Object.keys(channel.presenceState()).length });
      })
      // ── THE HOUSE PULSE: who's at the typewriter ──
      .on('broadcast', { event: 'typing' }, (payload) => {
        const p = payload?.payload as { user_id?: string; username?: string } | undefined;
        if (!p?.user_id || !p?.username) return;
        const self = useAuthStore.getState().user;
        if (p.user_id === self?.id) return;
        if (useBlockStore.getState().isHidden(p.user_id)) return;
        const username = p.username;
        // Reset this typist's silence timer.
        const existing = _typingTimers.get(username);
        if (existing) clearTimeout(existing);
        _typingTimers.set(username, setTimeout(() => {
          _typingTimers.delete(username);
          set(s => ({ typingUsers: s.typingUsers.filter(u => u !== username) }));
        }, TYPING_TTL));
        set(s => s.typingUsers.includes(username) ? s : { typingUsers: [...s.typingUsers, username] });
      })
      .subscribe((status) => {
        // Announce presence only once the channel is live.
        if (status === 'SUBSCRIBED' && me) {
          channel.track({ username: me.username });
        }
      });

    _activeChannel = channel;
    return () => {
      supabase.removeChannel(channel);
      if (_activeChannel === channel) _activeChannel = null;
      clearTypingState(set);
    };
  },

  broadcastTyping: (loungeId: string) => {
    const now = Date.now();
    if (now - _lastTypingBroadcastAt < TYPING_THROTTLE) return;
    const me = useAuthStore.getState().user;
    if (!me || !_activeChannel || get().currentLoungeId !== loungeId) return;
    _lastTypingBroadcastAt = now;
    void _activeChannel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: me.id, username: me.username },
    });
  },

  markRead: async (loungeId) => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    
    set(s => ({
      lounges: s.lounges.map(l => l.id === loungeId ? { ...l, unread_count: 0 } : l),
      _lastMarkReadMap: { ...s._lastMarkReadMap, [loungeId]: Date.now() }
    }));

    try {
      const { error } = await supabase
        .from('lounge_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('lounge_id', loungeId)
        .eq('user_id', user.id);
      
      if (error) throw error;
    } catch (e) {
      logger.warn('[Lounge] markRead failed:', e);
    }
  },
}));

// Register cleanup handler for centralized logout
registerStoreReset(() => {
    useLoungeStore.setState({ lounges: [], currentMessages: [], currentLoungeId: null, loading: false, sending: false, presentCount: 0, typingUsers: [], _pendingLeaveLoungeIds: new Set(), _lastMarkReadMap: {} });
    _lastCreateAt = 0;
    _lastTypingBroadcastAt = 0;
    for (const t of _typingTimers.values()) clearTimeout(t);
    _typingTimers.clear();
    // Actually UNSUBSCRIBE, not just forget the reference. Nulling the variable
    // left the channel live, so a message arriving after logout still reached
    // the realtime handler and wrote it into the store this reset had just
    // cleared — the one path the per-operation session guards cannot cover,
    // because a subscription has no caller to capture a member from.
    // notificationStore tears its channel down properly; this one did not.
    if (_activeChannel) {
        try { supabase.removeChannel(_activeChannel); } catch { /* already gone */ }
    }
    _activeChannel = null;
    // Purge profile cache to prevent cross-session PII leakage
    _profileCache.clear();
});
