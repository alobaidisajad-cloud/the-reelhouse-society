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
  deleteMessage: (messageId: string) => Promise<void>;
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
  canSendMessage: (loungeId?: string) => boolean;
  syncGlobalAvatar: (userId: string, avatarUrl: string | null) => void;
  _pendingLeaveLoungeIds: Set<string>;
  _lastMarkReadMap: Record<string, number>;
}

// ── Throttle ── (800ms between sends, matching web)
let _lastSendAt = 0;
const SEND_THROTTLE = 800;
const MESSAGE_DEDUP_CAP = 100;

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
  const { data: profile } = await supabase.from('profiles').select('username, avatar_url').eq('id', userId).single();
  const result = { username: profile?.username ?? 'unknown', avatar_url: profile?.avatar_url };
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
    if (!user) return;
    set({ loading: true });
    try {
      // Fetch lounges where user is a member
      const { data: memberRows } = await supabase
        .from('lounge_members')
        .select('lounge_id, last_read_at, status')
        .eq('user_id', user.id)
        .limit(100);

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

      // Calculate unread counts and last message timestamps — BATCHED (no N+1)
      const unreadCounts: Record<string, number> = {};
      const lastMessageTimestamps: Record<string, string> = {};

      const loungeIds = memberships.map(m => m.lounge_id);
      if (loungeIds.length > 0) {
        // Batch 1: Get last message per lounge in a single query
        const { data: lastMsgs } = await supabase
          .from('lounge_messages')
          .select('lounge_id, created_at')
          .in('lounge_id', loungeIds)
          .order('created_at', { ascending: false });
        
        if (lastMsgs) {
          // Keep only the latest per lounge_id
          for (const msg of lastMsgs) {
            if (!lastMessageTimestamps[msg.lounge_id]) {
              lastMessageTimestamps[msg.lounge_id] = msg.created_at;
            }
          }
        }

        // Batch 2: Count unread per lounge — fetch messages newer than last_read_at
        // Build a map of last_read_at per lounge for comparison
        const lastReadMap = new Map(memberships.map(m => [m.lounge_id, m.last_read_at]));
        const oldestLastRead = memberships
          .filter(m => m.last_read_at)
          .map(m => m.last_read_at!)
          .sort()[0];
        
        // Single query: fetch all recent messages across all lounges
        let unreadQuery = supabase
          .from('lounge_messages')
          .select('lounge_id, created_at')
          .in('lounge_id', loungeIds);
        if (oldestLastRead) {
          unreadQuery = unreadQuery.gt('created_at', oldestLastRead);
        }
        const { data: recentMsgs } = await unreadQuery;
        
        // Count per lounge, respecting each membership's last_read_at
        if (recentMsgs) {
          for (const msg of recentMsgs) {
            const memberLastRead = lastReadMap.get(msg.lounge_id);
            if (!memberLastRead || msg.created_at > memberLastRead) {
              unreadCounts[msg.lounge_id] = (unreadCounts[msg.lounge_id] || 0) + 1;
            }
          }
        }
        // Ensure all lounges have an entry
        for (const id of loungeIds) {
          if (!(id in unreadCounts)) unreadCounts[id] = 0;
        }
      }

      // How many requests are at the door, per lounge you host (RLS lets the
      // creator see pending rows). Powers the landing card "at the door" badge.
      const pendingCounts: Record<string, number> = {};
      const ownedIds = (myCreatedRes.data ?? []).map(l => l.id);
      if (ownedIds.length > 0) {
        const { data: pendingRows } = await supabase
          .from('lounge_members')
          .select('lounge_id')
          .in('lounge_id', ownedIds)
          .eq('status', 'pending');
        if (pendingRows) for (const r of pendingRows) pendingCounts[r.lounge_id] = (pendingCounts[r.lounge_id] || 0) + 1;
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
      }));

      set({ lounges: enriched, loading: false });
    } catch (err) {
      if (__DEV__) console.warn('[Lounge] fetchLounges failed:', err);
      reelToast.error('Could not retrieve salons — check your connection.');
      set({ loading: false });
    }
  },

  fetchMessages: async (loungeId: string) => {
    set({ currentLoungeId: loungeId, loading: true });
    try {
      const { data, error } = await supabase
        .from('lounge_messages')
        .select('id, lounge_id, user_id, content, type, reply_to_id, reply_to_username, reply_to_content, film_id, film_title, film_poster, metadata, created_at, deleted_at, profiles!lounge_messages_user_id_fkey(username, avatar_url)')
        .eq('lounge_id', loungeId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (data && !error) {
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
            // Prepend offline messages (at the end of the array, since UI likely renders from end)
            // Wait, fetchMessages maps and reverses them. Let's see. The fetch order is 'created_at' descending, so newest first.
            // Then it does `.reverse()`, so oldest first. UI renders from bottom.
            // So we need to append offline messages to the end of finalMessages.
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
          const { data: reactionRows } = await supabase
            .from('lounge_message_reactions')
            .select('message_id, reaction, user_id')
            .in('message_id', persistedIds);
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
    set({ loading: false });
  },

  loadMoreMessages: async (loungeId: string) => {
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
        .lt('created_at', oldestMessage.created_at)
        .order('created_at', { ascending: false })
        .limit(100);

      if (data && data.length > 0 && !error) {
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
        set({ currentMessages: [...filteredOlder, ...current] });
      }
    } catch {
      // FIX #10: Surface pagination failures instead of silently swallowing
      reelToast.error('Could not load older messages.');
    }
  },

  clearMessages: () => set({ currentMessages: [] }),

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
    const ALLOWED_TYPES = ['text', 'film_share', 'log_share', 'list_share', 'dossier_share', 'system'] as const;
    const safeType = (ALLOWED_TYPES as readonly string[]).includes(type) ? type : 'text';
    
    // Parity with the offline mutationExecutor path: strip zero-width/control
    // chars and length-cap via the shared sanitizer (was a bare trim+slice).
    const cleanContent = sanitizeInput(content.slice(0, 500), 'loungeMessage');
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
          currentMessages: [...s.currentMessages, optimisticMsg].slice(0, Math.max(MESSAGE_DEDUP_CAP, s.currentMessages.length + 1)),
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

  deleteMessage: async (messageId) => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    
    const targetMessage = get().currentMessages.find(m => m.id === messageId);
    set(s => ({ currentMessages: s.currentMessages.filter(m => m.id !== messageId) }));
    
    try {
      const { error } = await supabase.from('lounge_messages').delete()
        .eq('id', messageId)
        .eq('user_id', user.id);
        
      if (error) throw error;
    } catch (e) {
      if (isNetworkError(e)) {
        enqueueMutation({
          type: 'delete_lounge_message',
          payload: { message_id: messageId, user_id: user.id },
        });
        flushOfflineQueue();
        return;
      }
      if (targetMessage) {
        set(s => ({ 
          currentMessages: [...s.currentMessages, targetMessage].sort(
            (a, b) => {
              const diff = (new Date(a.created_at).getTime() || 0) - (new Date(b.created_at).getTime() || 0);
              return diff !== 0 ? diff : a.id.localeCompare(b.id);
            }
          )
        }));
      }
      reelToast.error('Failed to delete message.');
    }
  },

  createLounge: async (name, description, isPrivate) => {
    const user = useAuthStore.getState().user;
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

      set(s => ({ lounges: [newLounge, ...s.lounges] }));

      get().fetchLounges();
      return loungeId;
    } catch (e) {
      logger.error('[LoungeStore.createLounge] Unhandled error:', e);
      reelToast.error('Could not create lounge. Check your connection and try again.');
      return null;
    }
  },

  setLoungeCover: async (loungeId, cover) => {
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
      set(s => ({ lounges: s.lounges.map(l => l.id === loungeId ? { ...l, cover_image: prev } : l) }));
      reelToast.error('Could not update the salon cover.');
      return false;
    }
  },

  joinPublicLounge: async (loungeId) => {
    const user = useAuthStore.getState().user;
    if (!user) return false;
    try {
      const { error } = await supabase.rpc('join_public_lounge', { p_lounge_id: loungeId });
      if (error) throw error;
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
      set(s => ({
        currentMessages: s.currentMessages.map(m =>
          m.id === messageId ? { ...m, reactions: applyReactionDelta(m.reactions, reaction, (wasMine ? 1 : -1) as 1 | -1, wasMine) } : m
        ),
      }));
    }
  },

  withdrawMessage: async (messageId) => {
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
      logger.error('[LoungeStore.withdrawMessage] failed, reverting:', e);
      set(s => ({
        currentMessages: s.currentMessages.map(m => m.id === messageId ? target : m),
      }));
      reelToast.error('Could not withdraw this dispatch.');
    }
  },

  retryMessage: async (messageId) => {
    const user = useAuthStore.getState().user;
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
          set(s => {
            const messagesWithoutOpt = s.currentMessages.filter(m => m.id !== newMsg.id);
            
            return {
              currentMessages: [...messagesWithoutOpt, newMsg].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
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
          const mine = r.user_id === myId;
          set(s => ({
            currentMessages: s.currentMessages.map(m =>
              m.id === r.message_id ? { ...m, reactions: applyReactionDelta(m.reactions, r.reaction, 1, mine) } : m
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
          const mine = r.user_id === myId;
          set(s => ({
            currentMessages: s.currentMessages.map(m =>
              m.id === r.message_id ? { ...m, reactions: applyReactionDelta(m.reactions, r.reaction, -1, mine) } : m
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
    _activeChannel = null;
    // Purge profile cache to prevent cross-session PII leakage
    _profileCache.clear();
});
