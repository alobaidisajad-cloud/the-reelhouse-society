import * as Crypto from 'expo-crypto';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { create } from 'zustand';
import { onlineManager } from '@tanstack/react-query';
import { queryClient } from '../lib/queryClient';
import { supabase } from '../lib/supabase';
import { watchChannel } from '../lib/watchChannel';
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
  /**
   * One of the corridor's "your salons": a room this member belongs to, at any
   * standing (a request still at the door too), or hosts. Set by every read and
   * by every seat taken or given up here, in the same shape (isMine, seatedIn,
   * leftBehind below).
   */
  mine?: boolean;
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
  /** The salons are being read (fetchLounges). */
  loungesLoading: boolean;
  /**
   * The salons have been asked for and answered (or failed) since sign-in: until then an empty
   * list is unread, not empty — the corridor's first frame came before its read began.
   */
  loungesRead: boolean;
  /** The words of currentLoungeId, and only of that room. */
  currentMessages: LoungeMessage[];
  currentLoungeId: string | null;
  /**
   * The open room's words are being read; and its last read could not be answered. Not the
   * salons' flags: one flag for both let either read lower it for the other (P0.112).
   */
  messagesLoading: boolean;
  messagesFailed: boolean;
  /** The open room's live channel is answering; false once it has been down past a beat (watchChannel). */
  roomLive: boolean;
  sending: boolean;
  /** THE HOUSE PULSE — members present on this salon's channel right now. */
  presentCount: number;
  /** Usernames currently at the typewriter (expire after 4s of silence). */
  typingUsers: string[];

  fetchLounges: () => Promise<void>;
  fetchMessages: (loungeId: string) => Promise<void>;
  /** What the open room missed, read and merged into what is held: never a replacement. */
  catchUpMessages: (loungeId: string) => Promise<void>;
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
  /** Joins a salon's channel privately; `seated` alone shares presence and sends typing. */
  subscribeToLounge: (loungeId: string, opts?: { onMembership?: () => void; seated?: boolean }) => () => void;
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

/** One read of a room's words. */
const MESSAGE_PAGE = 100;

/** The messages held as the house gave them: not one still sending, failed, or waiting in the offline queue. */
function serverHeld(msgs: LoungeMessage[]): LoungeMessage[] {
  const queued = new Set(getOfflineQueue().filter((q) => q.type === 'send_lounge_message').map((q) => q.payload._tempId));
  return msgs.filter((m) => (m.status === undefined || m.status === 'sent') && !queued.has(m.id) && !m.id.startsWith('offline-'));
}

/** A message's place in the (created_at, id) order every read of a room keeps. */
const placeOf = (m: { created_at: string; id: string }) => [Date.parse(m.created_at), m.id] as const;
const before = (a: { created_at: string; id: string }, b: { created_at: string; id: string }) => {
  const [at, aid] = placeOf(a);
  const [bt, bid] = placeOf(b);
  return at !== bt ? at - bt : aid < bid ? -1 : aid > bid ? 1 : 0;
};

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
/** Whether the member holds a seat in the active salon: only a seated member types. */
let _seatedInActive = false;

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
  lounge_message_reactions?: ReactionRow[] | null;
}

/**
 * A page of a room's words, each with its author and its reactions, in one request: the
 * reactions asked for after the words cost the opening a second round trip, and a page read on
 * scrolling up never asked for them at all.
 */
export const MESSAGE_COLUMNS = 'id, lounge_id, user_id, content, type, reply_to_id, reply_to_username, reply_to_content, film_id, film_title, film_poster, metadata, created_at, deleted_at, profiles!lounge_messages_user_id_fkey(username, avatar_url), lounge_message_reactions!lounge_message_reactions_message_id_fkey(message_id, reaction, user_id)';

/** A page's rows, oldest first, as messages with their reactions summed for `myId`. */
function messagesOf(rows: LoungeMessageRow[], myId: string | undefined): LoungeMessage[] {
  const summaries = summarizeReactions(rows.flatMap((m) => m.lounge_message_reactions ?? []), myId);
  return [...rows].reverse().map((m) => {
    const author = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    const reactions = summaries.get(m.id);
    return {
      id: m.id,
      lounge_id: m.lounge_id,
      user_id: m.user_id,
      username: authorHandle(m.user_id, author?.username),
      avatar_url: author?.avatar_url,
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
      ...(reactions ? { reactions } : {}),
    };
  });
}

/**
 * Whether this member may post in a salon: the server's rule ("Approved members can
 * send"), read from the standing it gave — or, for a salon just founded or joined,
 * the standing this phone set when the house said yes (seatedIn).
 */
export function canPostIn(room: Pick<LoungeRoom, 'membership_status'>): boolean {
  return room.membership_status === 'approved';
}

/** Whether a room is among the corridor's "your salons". */
export const isMine = (room: Pick<LoungeRoom, 'mine'>): boolean => room.mine === true;

/** A room as the next read will give it once the house has seated this member as approved. */
export function seatedIn(room: LoungeRoom): LoungeRoom {
  const wasApproved = room.membership_status === 'approved';
  return {
    ...room,
    mine: true,
    membership_status: 'approved',
    unread_count: room.unread_count ?? 0,
    member_count: wasApproved ? room.member_count : (room.member_count ?? 0) + 1,
  };
}

/**
 * A room as the next read will give it once this member has left: no longer
 * theirs (none of what is read only for one's own rooms — unread count, last
 * message, faces, door requests), and one fewer in its count only if they
 * were counted (member_count counts approved members).
 */
export function leftBehind(room: LoungeRoom): LoungeRoom {
  const counted = room.membership_status === 'approved';
  return {
    ...room,
    mine: false,
    membership_status: undefined,
    unread_count: undefined,
    last_message_at: undefined,
    memberFaces: undefined,
    pending_count: 0,
    member_count: counted ? Math.max(0, (room.member_count ?? 1) - 1) : room.member_count,
  };
}

export const useLoungeStore = create<LoungeState>()((set, get) => ({
  lounges: [],
  loungesFailed: false,
  loungesLoading: false,
  loungesRead: false,
  currentMessages: [],
  currentLoungeId: null,
  messagesLoading: false,
  messagesFailed: false,
  roomLive: true,
  sending: false,
  presentCount: 0,
  typingUsers: [],
  _lastMarkReadMap: {},

  fetchLounges: async () => {
    const user = useAuthStore.getState().user;
    const startedAs = user?.id ?? null;
    if (!user) return;
    set({ loungesLoading: true });
    try {
      // Two waves, not five: what needs only the member is asked at once, and what needs
      // their seats and their own rooms is asked together after.
      // Three sources, merged: the newest rooms (private ones too; they need admission),
      // the rooms joined, and the rooms hosted, whose door requests are counted below.
      const [memberRes, browsableRes, myCreatedRes] = await Promise.all([
        supabase.from('lounge_members')
          .select('lounge_id, last_read_at, status')
          .eq('user_id', user.id)
          .limit(100),
        supabase.from('lounges')
          .select(ROOM_COLUMNS)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('lounges')
          .select(ROOM_COLUMNS)
          .eq('creator_id', user.id),
      ]);
      // Thrown, not read as []: an empty list would say the member belongs to nothing.
      if (memberRes.error) throw memberRes.error;

      const memberships = memberRes.data ?? [];
      const myLoungeIds = memberships.map(r => r.lounge_id);
      const statusMap = new Map(memberships.map(r => [r.lounge_id, (r as { status?: string }).status]));
      const loungeIds = myLoungeIds;
      const ownedIds = (myCreatedRes.data ?? []).map(l => l.id);
      // Build the combined set of IDs the user "owns or joined"
      const ownedOrJoinedIds = new Set(myLoungeIds);
      ownedIds.forEach((lid) => ownedOrJoinedIds.add(lid));
      const facesIds = Array.from(ownedOrJoinedIds);

      const [myJoinedRes, unreadRes, pendingRes, facesRes] = await Promise.all([
        myLoungeIds.length > 0
          ? supabase.from('lounges').select(ROOM_COLUMNS).in('id', myLoungeIds)
          : Promise.resolve({ data: [] as RoomRow[], error: null }),
        // Counted on the server, for auth.uid() and under row security (no id to forge,
        // no unbounded download).
        loungeIds.length > 0 ? supabase.rpc('get_lounge_unread_counts') : null,
        // How many requests are at the door, per lounge you host (RLS lets the
        // creator see pending rows). Powers the landing card "at the door" badge.
        ownedIds.length > 0
          ? supabase.from('lounge_members').select('lounge_id').in('lounge_id', ownedIds).eq('status', 'pending')
          : null,
        // Member faces (avatar stack) — ONLY for salons you host or joined, where
        // the roster is readable. Bounded to 3 per salon by the RPC's window, so a
        // 200-member salon costs the same as a 2-member one. Best-effort: any
        // failure leaves the map empty and every card falls back to its count.
        facesIds.length > 0
          ? Promise.resolve(supabase.rpc('get_salon_member_faces', { p_lounge_ids: facesIds })).catch(() => null)
          : null,
      ]);
      // A source that failed would draw a short list as the whole house: the read failed.
      const unread = browsableRes.error ?? myJoinedRes.error ?? myCreatedRes.error;
      if (unread) throw unread;

      // Merge all three, deduplicating by id
      const allLoungesMap = new Map<string, RoomRow>();
      if (browsableRes.data) browsableRes.data.forEach(l => allLoungesMap.set(l.id, l));
      if (myJoinedRes.data) myJoinedRes.data.forEach(l => allLoungesMap.set(l.id, l));
      if (myCreatedRes.data) myCreatedRes.data.forEach(l => allLoungesMap.set(l.id, l));

      const unreadCounts: Record<string, number> = {};
      const lastMessageTimestamps: Record<string, string> = {};

      if (unreadRes) {
        // A failure leaves the badges at zero, not the list empty.
        const { data: unreadRows, error: unreadError } = unreadRes;
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

      const pendingCounts: Record<string, number> = {};
      if (pendingRes) {
        // Logged, not surfaced: the salon list itself is still correct, and a toast
        // for a badge would be noise. But a silent zero means a host never learns
        // somebody is waiting at their door, so it must be diagnosable.
        const { data: pendingRows, error: pendingError } = pendingRes;
        if (pendingError) logger.error('[LoungeStore.fetchLounges] pending-request count failed:', pendingError);
        if (pendingRows) for (const r of pendingRows) pendingCounts[r.lounge_id] = (pendingCounts[r.lounge_id] || 0) + 1;
      }

      // Faces are decorative: an unanswered read leaves the card its plain count.
      const facesMap: Record<string, { username: string; avatar_url: string | null }[]> = {};
      const faceRows = facesRes?.data;
      if (Array.isArray(faceRows)) {
        for (const r of faceRows as { lounge_id: string; username: string; avatar_url: string | null }[]) {
          (facesMap[r.lounge_id] ??= []).push({ username: r.username, avatar_url: r.avatar_url });
        }
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
        mine: ownedOrJoinedIds.has(l.id),
        unread_count: ownedOrJoinedIds.has(l.id) ? (unreadCounts[l.id] || 0) : undefined,
        last_message_at: lastMessageTimestamps[l.id],
        membership_status: statusMap.get(l.id) as LoungeRoom['membership_status'],
        pending_count: pendingCounts[l.id] || 0,
        memberFaces: facesMap[l.id],
      }));

      // Left mid-flight — see sessionGuard. Writing here would repopulate a store
      // the logout reset has already cleared.
      if (!memberUnchanged(startedAs)) return;
      set({ lounges: enriched, loungesFailed: false, loungesLoading: false, loungesRead: true });
    } catch (err) {
      if (__DEV__) console.warn('[Lounge] fetchLounges failed:', err);
      // Their failed read is not the next member's.
      if (!memberUnchanged(startedAs)) return;
      // Said by the screen that asked, not here: the Lounge polls every thirty
      // seconds while open, and a toast here would be a toast every thirty
      // seconds for as long as the signal is gone.
      set({ loungesFailed: true, loungesLoading: false, loungesRead: true });
    }
  },

  fetchMessages: async (loungeId: string) => {
    // The room already open, with words from the house held: what it missed is read and merged,
    // quietly. Read whole, it replaced them, and a failed bubble or an older page went with them.
    if (get().currentLoungeId === loungeId && serverHeld(get().currentMessages).length > 0) return get().catchUpMessages(loungeId);
        const startedAs = useAuthStore.getState().user?.id ?? null;
    // Another room's words go at once: kept, they stood under this room's name until its own
    // came, and for good when its read failed. The same room's stay while it is read again.
    set((s) => ({
      currentLoungeId: loungeId,
      messagesLoading: true,
      messagesFailed: false,
      currentMessages: s.currentLoungeId === loungeId ? s.currentMessages : [],
    }));
    let failed = false;
    try {
      // The cursor's own order (loadMoreMessages): created_at alone leaves a burst's order to
      // chance, and the page below could then skip what this one did not hold.
      const { data, error } = await supabase
        .from('lounge_messages')
        .select(MESSAGE_COLUMNS)
        .eq('lounge_id', loungeId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(100);

      // supabase-js resolves on a server failure rather than throwing, so the error is read
      // here. Branch, don't return: the spinner comes down after the try.
      if (error) {
        logger.error('[LoungeStore.fetchMessages] load failed:', error);
        failed = true;
      } else if (data) {
        const messages = messagesOf(data as unknown as LoungeMessageRow[], useAuthStore.getState().user?.id);
        // Offline Queue Stitching
        const queue = getOfflineQueue();
        const pendingMessages = queue.filter(q => q.type === 'send_lounge_message' && q.payload.lounge_id === loungeId);
        
        const finalMessages = [...messages];
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
        // Only for the member who asked: the queued messages stitched in are theirs.
        if (!memberUnchanged(startedAs)) return;
        // Only if this room is still the open one: a slower fetch for a room left
        // behind would put its words under the new room's name.
        set(s => (s.currentLoungeId !== loungeId ? s : {
          currentMessages: finalMessages.filter(m => !useBlockStore.getState().isHidden(m.user_id)),
        }));
      }
    } catch {
      failed = true;
    }
    if (!memberUnchanged(startedAs)) return;
    // A stale fetch must not lower the spinner of the room now open, nor say it failed.
    if (get().currentLoungeId !== loungeId) return;
    // A room with nothing to show says so itself (the salon's transcript, with TRY AGAIN);
    // over words it kept, the toast says the new ones could not come.
    if (failed && get().currentMessages.length > 0) reelToast.error('Could not load messages — check your connection.');
    set({ messagesLoading: false, messagesFailed: failed });
  },

  loadMoreMessages: async (loungeId: string) => {
        const startedAs = useAuthStore.getState().user?.id ?? null;
    // Only the open room's words are paged: another room's oldest is no cursor for this one.
    if (get().currentLoungeId !== loungeId) return;
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
        .select(MESSAGE_COLUMNS)
        .eq('lounge_id', loungeId)
        .or(`created_at.lt.${oldestMessage.created_at},and(created_at.eq.${oldestMessage.created_at},id.lt.${oldestMessage.id})`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(100);

      if (error) {
        logger.error('[LoungeStore.loadMoreMessages] load failed:', error);
        reelToast.error('Could not load older messages.');
      } else if (data && data.length > 0) {
        const olderMessages = messagesOf(data as unknown as LoungeMessageRow[], useAuthStore.getState().user?.id);

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

  catchUpMessages: async (loungeId: string) => {
    // Quiet: no spinner and no toast. A catch-up that fails leaves what is held, and the room's
    // own line (not live, offline) says the rest; offline, none is tried.
    if (!onlineManager.isOnline() || get().currentLoungeId !== loungeId) return;
    const held = serverHeld(get().currentMessages);
    if (held.length === 0) return;
    const startedAs = useAuthStore.getState().user?.id ?? null;
    const myId = useAuthStore.getState().user?.id;
    const newestHeld = held.reduce((a, b) => (before(a, b) >= 0 ? a : b));
    const oldestHeld = held.reduce((a, b) => (before(a, b) <= 0 ? a : b));

    const fresh: LoungeMessage[] = [];
    let cursor = { created_at: newestHeld.created_at, id: newestHeld.id };
    let whole = true;
    try {
      // Page after page from the newest held, on the same (created_at, id) cursor loadMoreMessages
      // pages back with, until a short page; past the window, the rest is not chased.
      for (let page = 0; page < MESSAGE_WINDOW / MESSAGE_PAGE; page++) {
        const { data, error } = await supabase
          .from('lounge_messages')
          .select(MESSAGE_COLUMNS)
          .eq('lounge_id', loungeId)
          .or(`created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .limit(MESSAGE_PAGE);
        if (error) return;
        const rows = (data ?? []) as unknown as LoungeMessageRow[];
        // messagesOf takes a page newest first, as every other read has it.
        fresh.push(...messagesOf([...rows].reverse(), myId));
        if (rows.length < MESSAGE_PAGE) { whole = true; break; }
        whole = false;
        const last = rows.at(-1);
        if (!last) break;
        cursor = { created_at: last.created_at, id: last.id };
      }
      if (!whole) {
        // More was missed than the room holds: it is read again from its newest, and only this
        // phone's own words (sending, failed, queued) are kept.
        const { data, error } = await supabase
          .from('lounge_messages')
          .select(MESSAGE_COLUMNS)
          .eq('lounge_id', loungeId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(MESSAGE_PAGE);
        if (error || !data) return;
        const newest = messagesOf(data as unknown as LoungeMessageRow[], myId);
        if (!memberUnchanged(startedAs)) return;
        set((s) => {
          if (s.currentLoungeId !== loungeId) return s;
          const fromHouse = new Set(serverHeld(s.currentMessages).map((m) => m.id));
          const own = s.currentMessages.filter((m) => !fromHouse.has(m.id));
          return { currentMessages: [...newest.filter((m) => !useBlockStore.getState().isHidden(m.user_id)), ...own].sort(before) };
        });
        return;
      }

      // What is held, read again light: withdrawn or gone since, and its reactions now.
      const { data: marks, error: marksError } = await supabase
        .from('lounge_messages')
        .select('id, deleted_at, lounge_message_reactions!lounge_message_reactions_message_id_fkey(message_id, reaction, user_id)')
        .eq('lounge_id', loungeId)
        .gte('created_at', oldestHeld.created_at)
        .lte('created_at', newestHeld.created_at)
        .limit(1000);
      if (!memberUnchanged(startedAs)) return;
      type Mark = { id: string; deleted_at: string | null; lounge_message_reactions?: ReactionRow[] };
      const read = !marksError && marks ? (marks as unknown as Mark[]) : null;
      const byId = new Map((read ?? []).map((r) => [r.id, r]));
      const reactions = summarizeReactions((read ?? []).flatMap((r) => r.lounge_message_reactions ?? []), myId);
      // Absent from a whole answer, a held message was taken down; a cut answer proves nothing.
      const answeredWhole = !!read && read.length < 1000;
      const heldIds = new Set(held.map((m) => m.id));

      set((s) => {
        if (s.currentLoungeId !== loungeId) return s;
        // A message the read leaves as it was keeps its own object, so its row is not drawn again.
        let changed = false;
        const kept = !read ? s.currentMessages : s.currentMessages.flatMap((m) => {
          if (!heldIds.has(m.id)) return [m];
          const mark = byId.get(m.id);
          if (!mark) {
            if (!answeredWhole) return [m];
            changed = true;
            return [];
          }
          const r = reactions.get(m.id);
          const withdrawn = !!mark.deleted_at && !m.deleted_at;
          if (!withdrawn && JSON.stringify(r ?? null) === JSON.stringify(m.reactions ?? null)) return [m];
          changed = true;
          return [{ ...m, ...(withdrawn ? { content: '', deleted_at: mark.deleted_at } : {}), reactions: r }];
        });
        const have = new Set(kept.map((m) => m.id));
        const add = fresh.filter((m) => !have.has(m.id) && !useBlockStore.getState().isHidden(m.user_id));
        if (add.length === 0 && !changed) return s;
        return { currentMessages: add.length === 0 ? kept : [...kept, ...add].sort(before) };
      });
    } catch {
      // Not reached: what is held stays, and the room's line says so.
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
      // Neither queued as the next member nor marked in their transcript.
      if (!memberUnchanged(startedAs)) return false;
      if (isNetworkError(error)) {
        if (enqueueMutation({
          type: 'send_lounge_message',
          payload: { ...payload, _tempId: payload.id }
        })) {
          flushOfflineQueue();
          reelToast('Message saved offline. Will send when connected.');
          return true;
        }
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
        // create_lounge seats its creator, approved: counted, and theirs.
        member_count: 1,
        unread_count: 0,
        mine: true,
        membership_status: 'approved',
        pending_count: 0,
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
        lounges: s.lounges.map(l => (l.id === loungeId ? seatedIn(l) : l)),
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
      // Neither queued as the next member nor restored into their room.
      if (!memberUnchanged(startedAs)) return;
      // Offline is not a refusal — keep the tombstone and finish the withdrawal
      // when the connection returns. Snapping the message back would resurrect
      // something the member deliberately took down, on a dropped bar of signal.
      if (isNetworkError(e)) {
        if (enqueueMutation({ type: 'withdraw_lounge_message', payload: { message_id: messageId } })) {
          flushOfflineQueue();
          reelToast('Withdrawal saved offline. Will complete when connected.');
          return;
        }
      }
      // A real refusal (not yours to withdraw, row gone) — restore it intact.
      logger.error('[LoungeStore.withdrawMessage] failed, reverting:', e);
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
      // Neither queued as the next member nor marked in their transcript.
      if (!memberUnchanged(startedAs)) return;
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

    // At once, as the next read will have it: out of "your salons", into the
    // rooms to browse (a private one too: it is still there to ask at).
    set(s => ({ lounges: s.lounges.map(l => (l.id === loungeId && isMine(l) ? leftBehind(l) : l)) }));

    // A delete that row security refuses answers 200 with no error, so the rows are asked
    // for back: none means the member is still in the room (checked against production).
    const { data: removed, error } = await supabase.from('lounge_members').delete()
      .eq('lounge_id', loungeId)
      .eq('user_id', user.id)
      .select('id');

    if (error || !removed || removed.length === 0) {
      if (!memberUnchanged(startedAs)) return false;
      reelToast.error('Failed to leave — please try again.');
      await get().fetchLounges(); // the seat is still theirs: read it back
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

  subscribeToLounge: (loungeId: string, opts?: { onMembership?: () => void; seated?: boolean }) => {
    const me = useAuthStore.getState().user;
    const seated = !!opts?.seated;
    // Back after a drop, what was said in the gap is read; down past a beat, the room says it is
    // not live and is read again on a fixed interval until the channel answers.
    const watch = watchChannel({ reread: () => { void get().catchUpMessages(loungeId); }, onLive: (live) => set((s) => (s.roomLive === live ? s : { roomLive: live })) });
    const channel = supabase
      .channel(`lounge-${loungeId}`, {
        // Private: the salon's rules decide who receives it (realtime.messages); own echoes muted.
        config: { private: true, presence: { key: me?.id ?? 'anon' }, broadcast: { self: false } },
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
        watch.status(status);
        // Presence once the channel is live, from a seated member only: a reader
        // without a seat is in the room unseen.
        if (status === 'SUBSCRIBED' && me && seated) {
          channel.track({ username: me.username });
        }
      });

    _activeChannel = channel;
    _seatedInActive = seated;
    return () => {
      // Left on purpose: its CLOSED is not a drop.
      watch.end();
      supabase.removeChannel(channel);
      if (_activeChannel === channel) {
        _activeChannel = null;
        _seatedInActive = false;
      }
      set({ roomLive: true });
      clearTypingState(set);
    };
  },

  broadcastTyping: (loungeId: string) => {
    const now = Date.now();
    if (now - _lastTypingBroadcastAt < TYPING_THROTTLE) return;
    const me = useAuthStore.getState().user;
    if (!me || !_activeChannel || !_seatedInActive || get().currentLoungeId !== loungeId) return;
    _lastTypingBroadcastAt = now;
    // Through the house, never the channel: it checks the seat and stamps the
    // sender's own id and handle, so no member can type as another.
    void supabase.rpc('send_salon_typing', { p_lounge_id: loungeId }).then(({ error }) => {
      if (error) logger.warn('[LoungeStore.broadcastTyping] typing not sent:', error.message);
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
    useLoungeStore.setState({ lounges: [], loungesFailed: false, loungesLoading: false, loungesRead: false, currentMessages: [], currentLoungeId: null, messagesLoading: false, messagesFailed: false, sending: false, presentCount: 0, typingUsers: [], _lastMarkReadMap: {} });
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
    _seatedInActive = false;
    // Purge profile cache to prevent cross-session PII leakage
    _profileCache.clear();
});
