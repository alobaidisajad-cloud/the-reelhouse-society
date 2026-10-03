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
import { showTierDoor } from '../utils/tierDoor';
import { sanitizeInput, MAX_LENGTHS } from '../utils/sanitizeInput';
import type { LoungeMember } from '../types/social.types';
import { useAuthStore } from './auth';
import { memberUnchanged } from './domain/helpers/sessionGuard';
import { useBlockStore } from './blockStore';
import { registerStoreReset } from './resetAllStores';
import { DEPARTED_HANDLE } from '../constants/departed';

// ── Types ──
export interface LoungeRoom {
  id: string;
  name: string;
  description: string;
  is_private: boolean;
  // No invite_code: a private room is entered by asking at the door and being admitted.
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
  /** Up to 3 faces for the card (rooms you host or joined); without them it shows the count. */
  memberFaces?: { username: string; avatar_url: string | null }[];
}

/** The five reactions, in display order; the database refuses any other (…_reaction_curated). */
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
  /** Null once its author has left: the database keeps the words and clears the id. */
  user_id: string | null;
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
  /** The last read of the salons could not be answered. The screens say so. */
  loungesFailed: boolean;
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
  /** True once the member is out; false when the house refused or could not be reached (said). */
  leaveLounge: (loungeId: string) => Promise<boolean>;
  deleteLounge: (loungeId: string) => Promise<boolean>;
  subscribeToLounge: (loungeId: string, opts?: { onMembership?: () => void }) => () => void;
  markRead: (loungeId: string) => Promise<void>;

  // ── Membership roster + host controls (Editorial Salon overhaul) ──
  /** The membership rows the caller may see; null when unread, which is not an empty room. */
  fetchMembers: (loungeId: string) => Promise<LoungeMember[] | null>;
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
  /** Drops, from the transcript already on screen, messages by anyone the viewer now hides. */
  purgeHiddenMessages: () => void;
  canSendMessage: (loungeId?: string) => boolean;
  syncGlobalAvatar: (userId: string, avatarUrl: string | null) => void;
  _pendingLeaveLoungeIds: Set<string>;
  _lastMarkReadMap: Record<string, number>;
}

// 800ms between sends PER ROOM: stops a double-tap, silently, without eating a
// share sent to two rooms in a row.
const _lastSendAt = new Map<string, number>();
const SEND_THROTTLE = 800;

/** Messages held for an open room: four of loadMoreMessages' pages of 100. */
export const MESSAGE_WINDOW = 400;
// Drops the OLDEST, which loadMoreMessages fetches again on scroll-up. Used only when
// appending: a cap on the prepend would fight the scroll back.
export const capMessages = (msgs: LoungeMessage[]): LoungeMessage[] =>
  msgs.length > MESSAGE_WINDOW ? msgs.slice(msgs.length - MESSAGE_WINDOW) : msgs;

/** A salon as the corridor draws it: its cover too, or a cover set by its host
 *  showed until the next refresh and then nowhere. */
const ROOM_COLUMNS = 'id, name, description, is_private, creator_id, created_at, member_count, cover_image';
type RoomRow = { id: string; name: string; description: string; is_private: boolean; creator_id: string; created_at: string; member_count: number; cover_image: string | null };

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

/**
 * A deleted account nulls user_id and keeps the words: the database's mark, a
 * settled fact. A user_id whose profile did not load has no handle here (''),
 * and the room names them as a member: "unknown" read as somebody's handle, and
 * a reply to them saved it into the database as one.
 */
function authorHandle(userId: string | null | undefined, username?: string | null): string {
  if (!userId) return DEPARTED_HANDLE;
  return username || '';
}

// Authors of realtime messages, cached so a busy room costs one query per author.
const _profileCache = new Map<string, { username: string; avatar_url?: string; ts: number }>();
const _PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const _PROFILE_CACHE_MAX = 100;
async function resolveProfile(userId: string): Promise<{ username: string; avatar_url?: string }> {
  const cached = _profileCache.get(userId);
  if (cached && Date.now() - cached.ts < _PROFILE_CACHE_TTL) return cached;
  if (cached) _profileCache.delete(userId);
  const { data: profile, error } = await supabase.from('profiles').select('username, avatar_url').eq('id', userId).single();

  // A failure is never cached: an empty name would stick to a real member for the
  // whole TTL, and the cache is read first, so nothing could clear it.
  if (error || !profile) {
    if (error) logger.error('[LoungeStore.resolveProfile] lookup failed:', error);
    return { username: '', avatar_url: undefined };
  }

  const result = { username: profile.username ?? '', avatar_url: profile.avatar_url };
  if (_profileCache.size >= _PROFILE_CACHE_MAX) {
    const oldest = _profileCache.keys().next().value;
    if (oldest !== undefined) _profileCache.delete(oldest);
  }
  _profileCache.set(userId, { ...result, ts: Date.now() });
  return result;
}

// ── Reaction aggregation ──
interface ReactionRow { message_id: string; reaction: string; user_id: string }

/**
 * A reaction's place in the row. indexOf's -1 would put an unknown FIRST; the database
 * refuses unknowns, but one from an old row or a newer build goes LAST.
 */
const reactionRank = (reaction: string): number => {
  const i = LOUNGE_REACTIONS.indexOf(reaction as LoungeReaction);
  return i === -1 ? LOUNGE_REACTIONS.length : i;
};

/** Group raw reaction rows into per-message summaries (count + whether mine). */
export function summarizeReactions(rows: ReactionRow[], myId: string | undefined): Map<string, ReactionSummary[]> {
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
      (a, b) => reactionRank(a.reaction) - reactionRank(b.reaction)
    );
    out.set(msgId, ordered);
  }
  return out;
}

/** Apply a single reaction delta to a message's summary array (realtime/optimistic). */
export function applyReactionDelta(
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
  return next.sort((a, b) => reactionRank(a.reaction) - reactionRank(b.reaction));
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

/**
 * Whether this member may post in a salon: the server's rule ("Approved members can
 * send"), read from the status it gave, or — for a salon just founded or joined, before
 * that status arrives — from the seat this phone took.
 */
export function canPostIn(room: Pick<LoungeRoom, 'membership_status' | 'is_member'>): boolean {
  return room.membership_status ? room.membership_status === 'approved' : !!room.is_member;
}

export const useLoungeStore = create<LoungeState>()((set, get) => ({
  lounges: [],
  loungesFailed: false,
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
      // Thrown, not read as []: an empty list would say the member belongs to nothing.
      const { data: memberRows, error: memberError } = await supabase
        .from('lounge_members')
        .select('lounge_id, last_read_at, status')
        .eq('user_id', user.id)
        .limit(100);
      if (memberError) throw memberError;

      const memberships = memberRows ?? [];
      const myLoungeIds = memberships.map(r => r.lounge_id);
      const statusMap = new Map(memberships.map(r => [r.lounge_id, (r as { status?: string }).status]));

      // Three sources, merged: the newest rooms (private ones too; they need admission),
      // the rooms joined, and the rooms hosted, whose door requests are counted below.
      const browsablePromise = supabase.from('lounges')
        .select(ROOM_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(50);

      const myJoinedPromise = myLoungeIds.length > 0 
        ? supabase.from('lounges')
            .select(ROOM_COLUMNS)
            .in('id', myLoungeIds)
        : Promise.resolve({ data: [] as RoomRow[], error: null });

      const myCreatedPromise = supabase.from('lounges')
        .select(ROOM_COLUMNS)
        .eq('creator_id', user.id);

      const [browsableRes, myJoinedRes, myCreatedRes] = await Promise.all([
        browsablePromise, myJoinedPromise, myCreatedPromise,
      ]);
      // A source that failed would draw a short list as the whole house: the read failed.
      const unread = browsableRes.error ?? myJoinedRes.error ?? myCreatedRes.error;
      if (unread) throw unread;

      // Merge all three, deduplicating by id
      const allLoungesMap = new Map<string, RoomRow>();
      if (browsableRes.data) browsableRes.data.forEach(l => allLoungesMap.set(l.id, l));
      if (myJoinedRes.data) myJoinedRes.data.forEach(l => allLoungesMap.set(l.id, l));
      if (myCreatedRes.data) myCreatedRes.data.forEach(l => allLoungesMap.set(l.id, l));

      // Build the combined set of IDs the user "owns or joined"
      const ownedOrJoinedIds = new Set(myLoungeIds);
      if (myCreatedRes.data) myCreatedRes.data.forEach(l => ownedOrJoinedIds.add(l.id));

      const unreadCounts: Record<string, number> = {};
      const lastMessageTimestamps: Record<string, string> = {};

      const loungeIds = memberships.map(m => m.lounge_id);
      if (loungeIds.length > 0) {
        // Counted on the server, for auth.uid() and under row security (no id to forge,
        // no unbounded download). A failure leaves the badges at zero, not the list empty.
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
        creator_id: l.creator_id,
        created_at: l.created_at,
        member_count: l.member_count ?? 0,
        cover_image: l.cover_image ?? null,
        unread_count: ownedOrJoinedIds.has(l.id) ? (unreadCounts[l.id] || 0) : undefined,
        last_message_at: lastMessageTimestamps[l.id],
        membership_status: statusMap.get(l.id) as LoungeRoom['membership_status'],
        pending_count: pendingCounts[l.id] || 0,
        memberFaces: facesMap[l.id],
      }));

      // Left mid-flight — see sessionGuard. Writing here would repopulate a store
      // the logout reset has already cleared.
      if (!memberUnchanged(startedAs)) return;
      set({ lounges: enriched, loungesFailed: false, loading: false });
    } catch (err) {
      if (__DEV__) console.warn('[Lounge] fetchLounges failed:', err);
      // Said by the screen that asked, not here: the Lounge polls every thirty
      // seconds while open, and a toast here would be a toast every thirty
      // seconds for as long as the signal is gone.
      set({ loungesFailed: true, loading: false });
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

      // supabase-js resolves on a server failure rather than throwing, so the error is read
      // here. Branch, don't return: the spinner comes down after the try.
      if (error) {
        logger.error('[LoungeStore.fetchMessages] load failed:', error);
        reelToast.error('Could not load messages — check your connection.');
      } else if (data) {
        const messages: LoungeMessage[] = (data as LoungeMessageRow[]).reverse().map((m) => ({
          id: m.id,
          lounge_id: m.lounge_id,
          user_id: m.user_id,
          username: authorHandle(m.user_id, Array.isArray(m.profiles) ? m.profiles[0]?.username : m.profiles?.username),
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
        // Only if this room is still the open one: a slower fetch for a room left
        // behind would put its words under the new room's name.
        set(s => (s.currentLoungeId !== loungeId ? s : {
          currentMessages: finalMessages.filter(m => !useBlockStore.getState().isHidden(m.user_id)),
        }));
      }
    } catch {
      reelToast.error('Could not load messages — check your connection.');
    }
    if (!memberUnchanged(startedAs)) return;
    // A stale fetch must not lower the spinner of the room now open.
    set(s => (s.currentLoungeId !== loungeId ? s : { loading: false }));
  },

  loadMoreMessages: async (loungeId: string) => {
        const startedAs = useAuthStore.getState().user?.id ?? null;
    const current = get().currentMessages;
    if (current.length === 0) return;
    
    // The oldest message is at index 0 because fetchMessages reverses the chronological array
    const oldestMessage = current[0];
    if (oldestMessage.id.startsWith('optimistic')) return; // Safety

    try {
      // A (created_at, id) cursor, with the same two keys in the order: created_at alone
      // skips for good every message sharing the oldest one's timestamp, as a burst does.
      // Both values come from a server row, so neither can carry filter syntax.
      const { data, error } = await supabase
        .from('lounge_messages')
        .select('id, lounge_id, user_id, content, type, reply_to_id, reply_to_username, reply_to_content, film_id, film_title, film_poster, metadata, created_at, deleted_at, profiles!lounge_messages_user_id_fkey(username, avatar_url)')
        .eq('lounge_id', loungeId)
        .or(`created_at.lt.${oldestMessage.created_at},and(created_at.eq.${oldestMessage.created_at},id.lt.${oldestMessage.id})`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(100);

      if (error) {
        logger.error('[LoungeStore.loadMoreMessages] load failed:', error);
        reelToast.error('Could not load older messages.');
      } else if (data && data.length > 0) {
        const olderMessages: LoungeMessage[] = (data as LoungeMessageRow[]).reverse().map((m) => ({
          id: m.id,
          lounge_id: m.lounge_id,
          user_id: m.user_id,
          username: authorHandle(m.user_id, Array.isArray(m.profiles) ? m.profiles[0]?.username : m.profiles?.username),
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
        if (!memberUnchanged(startedAs)) return;
        // Into the LIVE list, not `current` (read before the await), which would erase what
        // arrived over realtime during the scroll; and only into this room.
        set(s => {
          if (s.currentLoungeId !== loungeId) return s;
          const have = new Set(s.currentMessages.map(m => m.id));
          const older = filteredOlder.filter(m => !have.has(m.id));
          return older.length === 0 ? s : { currentMessages: [...older, ...s.currentMessages] };
        });
      }
    } catch {
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
    
    // The sanitizer the offline path uses, and the one length cap (MAX_LENGTHS.loungeMessage):
    // a second cap here would silently overrule the composer's.
    const cleanContent = sanitizeInput(content, 'loungeMessage');
    if (!user || (!cleanContent && type === 'text')) return false;

    const now = Date.now();
    if (now - (_lastSendAt.get(loungeId) ?? 0) < SEND_THROTTLE) return false;
    _lastSendAt.set(loungeId, now);

    set({ sending: true });

    // Known columns go top-level; anything else rides in metadata.
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
        reelToast('Message saved offline. Will send when connected.');
        return true;
      }
      // Keep the dispatch and mark it failed so the transcript shows a discreet
      // "Failed · tap to retry" line (lifecycle state) instead of it vanishing.
      //
      // That holds for a RANK refusal too, deliberately. The retry is what
      // carries the member's sentence across the trip to the Society and back:
      // renew, return, tap it, and it sends. Removing it would make them type
      // it again as the price of paying.
      set(s => {
        if (s.currentLoungeId !== loungeId) return s;
        return {
          currentMessages: s.currentMessages.map(m =>
            m.id === optimisticMsg.id ? { ...m, status: 'failed' as const } : m
          ),
        };
      });
      // The server said why, in a sentence written for this member. Say it,
      // instead of "Failed to send message." over a retry that cannot succeed.
      if (showTierDoor(error, { returnTo: `/lounge/${loungeId}` })) return false;
      reelToast.error('Failed to send message.');
      return false;
    }
  },

  createLounge: async (name, description, isPrivate) => {
    const user = useAuthStore.getState().user;
    const startedAs = user?.id ?? null;
    if (!user) return null;

    const trimmedName = sanitizeInput(name, 'loungeName');
    const trimmedDesc = sanitizeInput(description, 'loungeDescription');
    if (!trimmedName || trimmedName.length < 2) {
      reelToast.error('Lounge name must be at least 2 characters.');
      return null;
    }
    // Cannot fire while sanitizeInput trims to this same cap; it stands so that the two
    // can never come to disagree in silence.
    if (trimmedName.length > MAX_LENGTHS.loungeName) {
      reelToast.error(`Lounge name cannot exceed ${MAX_LENGTHS.loungeName} characters.`);
      return null;
    }

    const now = Date.now();
    if (now - _lastCreateAt < CREATE_COOLDOWN) {
        reelToast.error('Please wait before creating another lounge.');
        return null;
    }
    _lastCreateAt = now;
    
    try {
      // No invite code: a private room is entered by asking at the door.
      const { data: loungeId, error } = await supabase.rpc('create_lounge', {
        p_name: trimmedName,
        p_description: trimmedDesc,
        p_is_private: isPrivate,
      });

      if (error || !loungeId) {
        logger.error('[LoungeStore.createLounge] RPC failed:', error);
        // Set before the call, so a second tap can't create twice; a failure releases it.
        _lastCreateAt = 0;
        // A rank the house no longer sees (it lapsed since the screen asked) gets its door.
        if (!showTierDoor(error, { returnTo: '/lounge' })) reelToast.error('Failed to create lounge.');
        return null;
      }

      const newLounge: LoungeRoom = {
        id: loungeId,
        name: trimmedName,
        description: trimmedDesc,
        is_private: isPrivate,
        creator_id: user.id,
        created_at: new Date().toISOString(),
        member_count: 1,
        unread_count: 0,
        is_member: true,
      };

      // null, not a bare return: callers test === null, and tsc would let undefined pass.
      if (!memberUnchanged(startedAs)) return null;
      set(s => ({ lounges: [newLounge, ...s.lounges] }));

      get().fetchLounges();
      return loungeId;
    } catch (e) {
      logger.error('[LoungeStore.createLounge] Unhandled error:', e);
      reelToast.error('Could not create lounge. Check your connection and try again.');
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
      // A seat refused for the rank is its door, never "check your connection".
      if (!showTierDoor(e, { returnTo: `/lounge/${loungeId}` })) {
        reelToast.error('Could not take a seat. Check your connection and try again.');
      }
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
      if (!showTierDoor(e, { returnTo: `/lounge/${loungeId}` })) {
        reelToast.error('Could not send your request. Check your connection and try again.');
      }
      return 'error';
    }
  },

  fetchMembers: async (loungeId) => {
    try {
      const { data, error } = await supabase
        .from('lounge_members')
        .select('user_id, status, joined_at, profiles!lounge_members_user_id_fkey(username, avatar_url)')
        .eq('lounge_id', loungeId)
        .order('joined_at', { ascending: true });
      if (error || !data) {
        logger.warn('[LoungeStore.fetchMembers] could not read the roster:', error?.message);
        return null;
      }
      return data.map((m: Record<string, unknown>) => {
        const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        const p = profile as { username?: string; avatar_url?: string } | undefined;
        return {
          user_id: m.user_id as string,
          username: p?.username ?? '',
          avatar_url: p?.avatar_url,
          status: (m.status as LoungeMember['status']) ?? 'approved',
          joined_at: m.joined_at as string | undefined,
        } satisfies LoungeMember;
      });
    } catch (e) {
      logger.warn('[LoungeStore.fetchMembers] failed:', e);
      return null;
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
      if (!memberUnchanged(startedAs)) return;
      set(s => ({
        currentMessages: s.currentMessages.map(m =>
          m.id === messageId ? { ...m, reactions: applyReactionDelta(m.reactions, reaction, (wasMine ? 1 : -1) as 1 | -1, wasMine) } : m
        ),
      }));
      // A rank refusal is told why; any other failure reverts in silence.
      showTierDoor(e, { returnTo: `/lounge/${msg.lounge_id}` });
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
        reelToast('Withdrawal saved offline. Will complete when connected.');
        return;
      }
      // A real refusal (not yours to withdraw, row gone) — restore it intact.
      logger.error('[LoungeStore.withdrawMessage] failed, reverting:', e);
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
      // "Try again" is the one thing that cannot help a member without the
      // rank — so a refusal gets the door, and only a real failure gets that.
      if (showTierDoor(e, { returnTo: `/lounge/${msg.lounge_id}` })) return;
      reelToast.error('Still could not send. Try again.');
    }
  },

  leaveLounge: async (loungeId) => {
    const user = useAuthStore.getState().user;
    const startedAs = user?.id ?? null;
    if (!user) return false;

    const lounge = get().lounges.find(l => l.id === loungeId);
    if (lounge && lounge.creator_id === user.id) {
        reelToast.error('You created this lounge. Delete it instead of leaving.');
        return false;
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

    // A delete that row security refuses answers 200 with no error, so the rows are asked
    // for back: none means the member is still in the room (checked against production).
    const { data: removed, error } = await supabase.from('lounge_members').delete()
      .eq('lounge_id', loungeId)
      .eq('user_id', user.id)
      .select('id');

    if (error || !removed || removed.length === 0) {
      if (!memberUnchanged(startedAs)) return false;
      set(s => {
        const newSet = new Set(s._pendingLeaveLoungeIds);
        newSet.delete(loungeId);
        return { _pendingLeaveLoungeIds: newSet };
      });
      clearTimeout(timeoutId);
      reelToast.error('Failed to leave — please try again.');
      await get().fetchLounges();
      return false;
    }
    queryClient.invalidateQueries({ queryKey: ['lounge_membership', loungeId] });
    queryClient.invalidateQueries({ queryKey: ['lounge_members', loungeId] });
    return true;
  },

  deleteLounge: async (loungeId) => {
    // No session capture: after the await only fetchLounges writes, and it guards itself.
    const user = useAuthStore.getState().user;
    if (!user) return false;
    
    // Optimistic removal
    set(s => ({ lounges: s.lounges.filter(l => l.id !== loungeId) }));
    
    // As in leaveLounge: a non-creator's delete touches no rows and still answers 200,
    // so no rows back is the refusal (checked against production).
    const { data: destroyed, error } = await supabase.from('lounges').delete()
      .eq('id', loungeId)
      .eq('creator_id', user.id)
      .select('id');

    if (error || !destroyed || destroyed.length === 0) {
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
        // THE HOUSE PULSE shares the transcript's socket; own typing echoes are muted.
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
          // Our own message is already drawn. If it was still waiting — sent from
          // the offline queue once the connection returned — this echo is the house
          // saying it arrived: it stops reading as sending (dimmed, no reply, no
          // reaction), which it otherwise did until the room was opened again.
          const existing = get().currentMessages.find(m => m.id === msg.id);
          if (existing) {
            if (existing.status === 'sending' || existing.status === 'failed') {
              set(s => ({
                currentMessages: s.currentMessages.map(m =>
                  m.id === msg.id ? { ...m, created_at: msg.created_at ?? m.created_at, status: 'sent' as const } : m),
              }));
            }
            return;
          }

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

          // Dedup and re-sort. No session guard: a subscription has no caller to capture
          // a member from; the logout reset unsubscribes it instead.
          set(s => {
            // The member may change rooms while resolveProfile queries; this is the one
            // handler that ADDS a message, so it alone must check the room.
            if (s.currentLoungeId !== newMsg.lounge_id) return s;
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
      // Membership changes (admit, mute, remove) let the screen refresh its gate and roster.
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
    useLoungeStore.setState({ lounges: [], loungesFailed: false, currentMessages: [], currentLoungeId: null, loading: false, sending: false, presentCount: 0, typingUsers: [], _pendingLeaveLoungeIds: new Set(), _lastMarkReadMap: {} });
    _lastCreateAt = 0;
    _lastTypingBroadcastAt = 0;
    // Every module-level memory, or the next member on this phone inherits it.
    _lastSendAt.clear();
    for (const t of _typingTimers.values()) clearTimeout(t);
    _typingTimers.clear();
    // Unsubscribe, not just forget: a live channel would write the next message into
    // the store this reset just cleared.
    if (_activeChannel) {
        try { supabase.removeChannel(_activeChannel); } catch { /* already gone */ }
    }
    _activeChannel = null;
    // Purge profile cache to prevent cross-session PII leakage
    _profileCache.clear();
});
