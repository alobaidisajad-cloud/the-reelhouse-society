import * as Crypto from 'expo-crypto';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { create } from 'zustand';
import { onlineManager } from '@tanstack/react-query';
import { houseIso } from '@/src/lib/houseClock';
import { supabase } from '../lib/supabase';
import { watchChannel } from '../lib/watchChannel';
import { openChannel } from '../lib/openChannel';
import { instantOf, dateOf } from '../utils/instant';
import { byKey } from '../utils/order';
import { characterCount } from '../utils/text';
import { LoungeMessagePayloadSchema } from '../services/LoungeService';
import { logger } from '../utils/logger';
import { buildSearchPattern } from '../utils/searchPattern';
import { isNetworkError } from '../utils/networkError';
import { salonPaceSaid } from '../utils/housePace';
import { enqueueMutation, flushOfflineQueue, getOfflineQueue, letHeldGo, sendHeldAgain } from '../utils/offlineQueue';
import { stillHeld } from './offlineQueueStore';
import reelToast from '../utils/reelToast';
import { showTierDoor } from '../utils/tierDoor';
import { cardShareRefusal, saidOfCardShareRefusal } from '../utils/stackShareRefusal';
import { sanitizeInput, MAX_LENGTHS } from '../utils/sanitizeInput';
import type { LoungeMember } from '../types/social.types';
import { useAuthStore } from './auth';
import { memberUnchanged } from './domain/helpers/sessionGuard';
import { useBlockStore } from './blockStore';
import { registerStoreReset } from './resetAllStores';
import { agedSince, monotonicNow } from '../lib/waits';
import { keepPage, keptPage } from '../utils/keptPages';
import { DEPARTED_HANDLE } from '../constants/departed';
import { forgetShownTypists, shownByTheHouse } from './typistShown';

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
  /**
   * The members whose words the message carries besides its writer's (the one it answers, the author
   * of the piece its card shows), named by the house: hidden from whoever any of them is hidden from.
   */
  carries_words_of?: string[] | null;
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
  /**
   * Each salon's cover as this phone last set it (null: removed), whatever list holds the salon:
   * a room opened from a link is in no list, and it drew the cover it read on opening after the
   * host had changed it, or removed it, from the room itself.
   */
  coversSet: Record<string, string | null>;
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
  /** The salons whose name or description holds these words, asked of the house; null when it could not be asked. */
  searchLounges: (words: string) => Promise<LoungeRoom[] | null>;
  fetchMessages: (loungeId: string) => Promise<void>;
  /** What the open room missed, read and merged into what is held: never a replacement. */
  catchUpMessages: (loungeId: string) => Promise<void>;
  loadMoreMessages: (loungeId: string) => Promise<void>;
  /** True once the house has it; 'queued' when it waits for the connection (said by the store). */
  sendMessage: (loungeId: string, content: string, type?: string, meta?: LoungeMessageMeta) => Promise<boolean | 'queued'>;
  /** `id` is the room's, made by the form once: a tap again after a lost answer finds the room it made. */
  createLounge: (name: string, description: string, isPrivate: boolean, id: string) => Promise<string | null>;
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
  /** True once the house or the queue has it; false when it was refused again (said by the store), or not tried. */
  retryMessage: (messageId: string) => Promise<boolean>;
  clearMessages: (loungeId?: string) => void;
  /** Drops, from the transcript already on screen, messages by anyone the viewer now hides. */
  purgeHiddenMessages: () => void;
  canSendMessage: (loungeId?: string) => boolean;
  syncGlobalAvatar: (userId: string, avatarUrl: string | null) => void;
}

// The same words sent again to a room within 800ms: a double-tap, stopped silently, without
// eating a share sent to two rooms in a row. Other words are another message: refused, the room's
// composer had already let go of them, and they were lost unsent.
const _lastSendAt = new Map<string, { at: number; words: string }>();

/**
 * A seat or a request the house refused for a host's ban: join_public_lounge and
 * request_lounge_membership raise these words (SQLSTATE P0001), and a rehearsal holds them
 * (supabase/diagnostics/the_house_keeps_its_own_record_rehearsal.sql). Toasted as "check your connection", the refusal sent a banned
 * member to their signal (review round 9); BANNED_FROM_SALON is said instead.
 */
const BAN_REFUSALS: readonly string[] = ['You cannot join this lounge', 'You cannot request this lounge'];
export const BANNED_FROM_SALON = 'The host has closed this salon to you.';
const bannedHere = (e: unknown) => {
  const refusal = e as { code?: unknown; message?: unknown } | null;
  return refusal?.code === 'P0001' && BAN_REFUSALS.includes(String(refusal.message ?? '').trim());
};
/**
 * A salon its host dissolved while a member sat in it or stood at its door. join_public_lounge and
 * request_lounge_membership raise SALON_GONE (SQLSTATE P0002); the house before round 11 raised
 * 'Lounge not found'. Toasted as "check your connection", it sent the member to their signal over a
 * room that is not there (review round 11): it is said, and the room draws its "Signal Lost" page.
 */
export const SALON_GONE_SAID = 'This salon is no longer open.';
const salonGoneHere = (e: unknown) => {
  const refusal = e as { code?: unknown; message?: unknown } | null;
  const said = String(refusal?.message ?? '').trim();
  return (refusal?.code === 'P0002' && said === 'SALON_GONE') || said === 'Lounge not found';
};

type SalonRefusal = 'gone' | 'unseated' | 'muted' | 'banned';
const SAID_OF_A_SALON_REFUSAL: Record<SalonRefusal, string> = {
  gone: SALON_GONE_SAID,
  unseated: 'You no longer have a seat in this salon.',
  muted: 'You have been muted in this salon.',
  banned: BANNED_FROM_SALON,
};

/**
 * Why the house refused a word in a salon, asked of the house after the refusal. The row security
 * that refuses it ("Approved members can send") answers 42501 alike for a salon its host dissolved,
 * a seat the host took or turned to a mute or a ban, and a seat left from another phone: each was
 * "Failed to send message." over a retry that could not work (review round 11). Null: the salon
 * stands and the seat is held (the refusal was something else), or the house could not be asked.
 */
async function whyTheSalonRefused(loungeId: string, userId: string): Promise<SalonRefusal | null> {
  try {
    const [room, seat] = await Promise.all([
      supabase.from('lounges').select('id, creator_id').eq('id', loungeId).maybeSingle(),
      supabase.from('lounge_members').select('status').eq('lounge_id', loungeId).eq('user_id', userId).maybeSingle(),
    ]);
    if (room.error) return null;
    if (!room.data) return 'gone';
    if ((room.data as { creator_id?: string | null }).creator_id === userId || seat.error) return null;
    const status = (seat.data as { status?: string } | null)?.status;
    if (status === 'approved') return null;
    if (status === 'muted' || status === 'banned') return status;
    return 'unseated';
  } catch {
    return null;
  }
}

/** The house said this salon is gone: the corridor lets it go (its room, asking again, draws "Signal Lost"). */
function hearRoomGone(loungeId: string): void {
  useLoungeStore.setState((s) => ({ lounges: s.lounges.filter((l) => l.id !== loungeId) }));
}

/** After a word refused in a salon: why, said; false when nothing more was known than the refusal. */
async function saidWhyTheSalonRefused(loungeId: string, userId: string): Promise<boolean> {
  const why = await whyTheSalonRefused(loungeId, userId);
  if (!why || !memberUnchanged(userId)) return !!why;
  if (why === 'gone') hearRoomGone(loungeId);
  reelToast.error(SAID_OF_A_SALON_REFUSAL[why]);
  return true;
}

const SEND_THROTTLE = 800;

/** Messages held for an open room: four of loadMoreMessages' pages of 100. */
export const MESSAGE_WINDOW = 400;
/**
 * The room the member has read back in (loadMoreMessages laid older words above): its window is
 * theirs. Capped there, every new word cut the oldest, the very ones being read at the top, and
 * scrolling asked for them again (review round 9). Forgotten when another room is opened.
 */
let _readBackIn: string | null = null;
// Drops the OLDEST, which loadMoreMessages fetches again on scroll-up. Used only when
// appending: a cap on the prepend would fight the scroll back. Not in a room read back in.
export const capMessages = (msgs: LoungeMessage[]): LoungeMessage[] => {
  if (msgs.length <= MESSAGE_WINDOW) return msgs;
  const newest = msgs[msgs.length - 1];
  if (_readBackIn !== null && newest !== undefined && newest.lounge_id === _readBackIn) return msgs;
  return msgs.slice(msgs.length - MESSAGE_WINDOW);
};

/** One read of a room's words. */
const MESSAGE_PAGE = 100;

/** The messages held as the house gave them: not one still sending, failed, or waiting in the offline queue. */
function serverHeld(msgs: LoungeMessage[]): LoungeMessage[] {
  const queued = new Set(getOfflineQueue().filter((q) => q.type === 'send_lounge_message').map((q) => q.payload._tempId));
  return msgs.filter((m) => (m.status === undefined || m.status === 'sent') && !queued.has(m.id) && !m.id.startsWith('offline-'));
}

/** A message's place in the (created_at, id) order every read of a room keeps. */
const placeOf = (m: { created_at: string; id: string }) => [instantOf(m.created_at), m.id] as const;
const before = (a: { created_at: string; id: string }, b: { created_at: string; id: string }) => {
  const [at, aid] = placeOf(a);
  const [bt, bid] = placeOf(b);
  return at !== bt ? at - bt : aid < bid ? -1 : aid > bid ? 1 : 0;
};

/** A salon as the corridor draws it: its cover too, or a cover set by its host
 *  showed until the next refresh and then nowhere. */
export const ROOM_COLUMNS = 'id, name, description, is_private, creator_id, created_at, member_count, cover_image';
type RoomRow = { id: string; name: string; description: string; is_private: boolean; creator_id: string; created_at: string; member_count: number; cover_image: string | null };

/** get_lounge_list's answer: each piece as the separate reads answered it. */
type Corridor = {
  memberships: { lounge_id: string; last_read_at: string | null; status: string | null }[];
  newest: RoomRow[];
  hosted: RoomRow[];
  joined: RoomRow[];
  unread: { lounge_id: string; unread_count: number; last_message_at: string | null }[];
  /** Who waits at the doors the member hosts, each named since 20261116_01 (absent before it). */
  pending: { lounge_id: string; user_id?: string }[];
  faces: { lounge_id: string; username: string; avatar_url: string | null }[];
  last_words: { lounge_id: string; last_message_at: string | null }[];
};
const CORRIDOR_PIECES: readonly (keyof Corridor)[] = ['memberships', 'newest', 'hosted', 'joined', 'unread', 'pending', 'faces', 'last_words'];

/** The corridor, when every piece of it is a list; null when any is not (a read that failed). */
export function corridorOf(data: unknown): Corridor | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const answer = data as Record<string, unknown>;
  return CORRIDOR_PIECES.every((piece) => Array.isArray(answer[piece])) ? answer as Corridor : null;
}

/** Standings that keep a membership row but not a seat among "your salons". */
const UNSEATED: readonly string[] = ['banned', 'muted'];

// ── Create lounge cooldown — prevents spam-creation ──
let _lastCreateAt = -Infinity;
/**
 * The words of the rooms left for another, this run only (never on the phone's disk), the most
 * recently left last: a room opened again is drawn from them at once and caught up beneath, as the
 * open room is on a return to the app, never read whole again behind a spinner.
 */
const _keptRooms = new Map<string, LoungeMessage[]>();
const KEPT_ROOMS = 5;
/**
 * Words heard live, each with its place in the order they were heard (round 13): a room's first
 * read, answered after a word was heard, replaced the room with its answer, which was read before
 * the word was said, and the word was gone from the transcript. A read keeps every word heard since
 * it was asked that its answer does not hold. The newest HEARD_KEPT alone are remembered.
 */
const _heardLive = new Map<string, number>();
let _heardSeq = 0;
const HEARD_KEPT = 500;
function heardLive(id: string): void {
  _heardLive.delete(id);
  _heardLive.set(id, ++_heardSeq);
  for (const oldest of _heardLive.keys()) { if (_heardLive.size <= HEARD_KEPT) break; _heardLive.delete(oldest); }
}
/**
 * A room whose channel went live while its first read was still out: what was said between the read's
 * moment and the channel's is in neither, so the room is caught up as soon as that read lands.
 */
let _catchUpAfterRead: string | null = null;
/**
 * A room's channel live for the first time: what was said between the room's read and this moment
 * is in neither, so it is read now, from the newest word held; with the read still out, as soon as
 * it lands (round 13: the channel's first moment was never caught up on). A room not open reads nothing.
 */
function catchUpOnFirstLive(loungeId: string): void {
  const s = useLoungeStore.getState();
  if (s.currentLoungeId !== loungeId) return;
  if (s.messagesLoading) { _catchUpAfterRead = loungeId; return; }
  void s.catchUpMessages(loungeId);
}
/**
 * A room's words changed where they are held: on screen while it is the room open, else as kept for
 * it, as a send answered after the member opened another room is.
 */
function inRoomWords(loungeId: string, change: (words: LoungeMessage[]) => LoungeMessage[]): void {
  if (useLoungeStore.getState().currentLoungeId === loungeId) {
    useLoungeStore.setState((s) => (s.currentLoungeId === loungeId ? { currentMessages: change(s.currentMessages) } : {}));
    return;
  }
  const kept = _keptRooms.get(loungeId);
  if (kept) _keptRooms.set(loungeId, change(kept));
}
const CREATE_COOLDOWN = 30000; // 30s between lounge creations

// ── THE HOUSE PULSE — typing broadcast throttle + expiry ──
let _lastTypingBroadcastAt = -Infinity;
const TYPING_THROTTLE = 2000; // max one broadcast per 2s per member
const TYPING_TTL = 4000;      // a typist goes quiet after 4s of silence
const _typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** One room holding a salon's channel: what the channel's status and the seats' changes are told to. */
interface SalonHolder { watch: ReturnType<typeof watchChannel>; onMembership?: () => void; seated: boolean }
/**
 * Each salon's live channel, the rooms holding it, and the last status it gave. Two copies of one room
 * on the stack (the salon opened again from inside it) hold ONE channel (openChannel shares it): its
 * word goes to every room holding it, a room that came later is told its last status at once, and it
 * is left only when the last room leaves. The second copy took the first's channel and, leaving, took
 * it from the room beneath, which then said it was not live for as long as it stood (review round 12).
 * broadcastTyping rides the same channel, from a seat alone.
 */
const _salons = new Map<string, { holders: Set<SalonHolder>; channel: RealtimeChannel | null; status: string | null }>();
/**
 * Each open room's way out, as its screen leaves: the reset leaves through them too, one still
 * waiting to open included. Closed by its channel alone, its watch heard the CLOSED as a drop: five
 * seconds after a sign-out the next member's room said it was not live, and its re-read ran on
 * (review round 9).
 */
const _roomLeaves = new Set<() => void>();

function clearTypingState(set: (partial: Partial<LoungeState>) => void) {
  for (const t of _typingTimers.values()) clearTimeout(t);
  _typingTimers.clear();
  forgetShownTypists();
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
  if (cached && agedSince(cached.ts) < _PROFILE_CACHE_TTL) return cached;
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
interface ReactionRow { id?: string; message_id: string; reaction: string; user_id: string }

/**
 * The open room's reaction rows, by their own id. The table keeps row security, so the house's
 * channel sends a deleted reaction with its key alone ({ id }): a withdrawal heard that way was
 * dropped, and a reaction another member took back stayed counted until the room was opened
 * again (review round 11). Every read and every reaction heard keeps its rows here, and a
 * withdrawal finds its message and its reaction by the id.
 */
const _reactionRows = new Map<string, ReactionRow>();
let _reactionRowsOf: string | null = null;

/** Keeps the reaction rows of the room open now (another room's are let go); one read for a room left is not kept. */
function keepReactionRows(loungeId: string, rows: readonly ReactionRow[]): void {
  if (useLoungeStore.getState().currentLoungeId !== loungeId) return;
  if (_reactionRowsOf !== loungeId) {
    _reactionRows.clear();
    _reactionRowsOf = loungeId;
  }
  for (const r of rows) if (r.id) _reactionRows.set(r.id, r);
}

/** A page's reaction rows, as its embed read them. */
const reactionRowsOf = (rows: readonly LoungeMessageRow[]): ReactionRow[] => rows.flatMap((m) => m.lounge_message_reactions ?? []);

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
/** The kinds of message whose card the house writes, takes down and makes again. */
const isCardOfAPiece = (type: string | null | undefined) => type === 'log_share' || type === 'list_share' || type === 'dossier_share';

interface RawLoungePayload {
  id: string;
  lounge_id: string;
  user_id: string;
  content: string;
  type: string;
  reply_to_id?: string | null;
  reply_to_username?: string | null;
  reply_to_content?: string | null;
  carries_words_of?: string[] | null;
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
  carries_words_of?: string[] | null;
  film_id?: number | null;
  film_title?: string | null;
  film_poster?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  deleted_at?: string | null;
  profiles:{ username: string; avatar_url?: string } | { username: string; avatar_url?: string }[] | null;
  lounge_message_reactions?: ReactionRow[] | null;
}

/**
 * A page of a room's words, each with its author and its reactions, in one request: the
 * reactions asked for after the words cost the opening a second round trip, and a page read on
 * scrolling up never asked for them at all.
 */
export const MESSAGE_COLUMNS = 'id, lounge_id, user_id, content, type, reply_to_id, reply_to_username, reply_to_content, carries_words_of, film_id, film_title, film_poster, metadata, created_at, deleted_at, profiles!lounge_messages_user_id_fkey(username, avatar_url), lounge_message_reactions!lounge_message_reactions_message_id_fkey(id, message_id, reaction, user_id)';

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
      carries_words_of: m.carries_words_of,
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
 * Whether a message is hidden from this member: its writer is one they blocked or muted, or, written
 * by someone else, it carries the words of one they did (a reply quoting them, a card of their piece),
 * as the house names them (carries_words_of). The house's own rule (lounge_messages_hide_blocked) hides
 * the same rows from every read and every live message, the other way of a block too (one who blocked
 * this member, which the phone does not know); this is that rule for the blocks and mutes this phone
 * holds, so a block made here takes them off the screen at once. One's own message is never hidden.
 */
export function hiddenHere(m: Pick<LoungeMessage, 'user_id' | 'carries_words_of'>): boolean {
  const { isHidden } = useBlockStore.getState();
  if (isHidden(m.user_id)) return true;
  if (m.user_id && m.user_id === useAuthStore.getState().user?.id) return false;
  return (m.carries_words_of ?? []).some((id) => isHidden(id));
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
 * theirs (none of what is read only for one's own rooms — unread count, faces,
 * door requests), and one fewer in its count only if they were counted
 * (member_count counts approved members). When it last spoke stays: the
 * directory gives every room its last word (get_salon_last_words), a room left
 * as much as any.
 */
export function leftBehind(room: LoungeRoom): LoungeRoom {
  const counted = room.membership_status === 'approved';
  return {
    ...room,
    mine: false,
    membership_status: undefined,
    unread_count: undefined,
    memberFaces: undefined,
    pending_count: 0,
    member_count: counted ? Math.max(0, (room.member_count ?? 1) - 1) : room.member_count,
  };
}

const STANDINGS: readonly string[] = ['approved', 'pending', 'muted', 'banned'];

/**
 * The corridor kept on the phone (keptPages), held to a room's shape as it is read back: a row
 * kept by an older build without an id, a name, a host or a founding date is left out, and every
 * other field the card reads is kept only as its own type.
 */
function keptRooms(rows: unknown[] | null): LoungeRoom[] {
  const text = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return (rows ?? []).flatMap((row): LoungeRoom[] => {
    const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
    const id = text(r.id), name = text(r.name), creator_id = text(r.creator_id), created_at = text(r.created_at);
    if (!id || name === undefined || !creator_id || !created_at) return [];
    const faces = Array.isArray(r.memberFaces)
      ? r.memberFaces.flatMap((f) => {
          const face = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
          const username = text(face.username);
          return username === undefined ? [] : [{ username, avatar_url: text(face.avatar_url) ?? null }];
        })
      : undefined;
    const standing = text(r.membership_status);
    return [{
      id, name, creator_id, created_at,
      description: text(r.description) ?? '',
      is_private: r.is_private === true,
      cover_image: text(r.cover_image) ?? null,
      member_count: count(r.member_count) ?? 0,
      mine: r.mine === true,
      unread_count: count(r.unread_count),
      last_message_at: text(r.last_message_at),
      membership_status: standing && STANDINGS.includes(standing) ? standing as LoungeRoom['membership_status'] : undefined,
      pending_count: count(r.pending_count) ?? 0,
      memberFaces: faces,
    }];
  });
}

/**
 * Every value the store holds, as it starts: what it is made with and what a sign-out puts back,
 * one list (the reset's own list left `roomLive` as the last member's room had it).
 */
export const loungesAtStart = () => ({
  lounges: [] as LoungeRoom[],
  coversSet: {} as Record<string, string | null>,
  loungesFailed: false,
  loungesLoading: false,
  loungesRead: false,
  currentMessages: [] as LoungeMessage[],
  currentLoungeId: null as string | null,
  messagesLoading: false,
  messagesFailed: false,
  roomLive: true,
  sending: false,
  presentCount: 0,
  typingUsers: [] as string[],
});

/**
 * Salons marked read on this phone, by when the house took the mark (Infinity while it is on its
 * way). The corridor reads itself again as the member comes back to it, no later than the room's
 * mark on leaving: that read, asked first and landing after, wrote the room's old count back, and
 * the salon just read said "N unread" until the next poll (review round 8). A read asked before a
 * mark landed has it laid over its answer; one asked after holds it already.
 */
const _readRoomsHere = new Map<string, number>();

export const useLoungeStore = create<LoungeState>()((set, get) => ({
  ...loungesAtStart(),

  fetchLounges: async () => {
    const user = useAuthStore.getState().user;
    const startedAs = user?.id ?? null;
    if (!user) return;
    // A launch draws the corridor this member last read at once (keptPages), and reads it beneath.
    if (!get().loungesRead && get().lounges.length === 0) {
      const kept = keptRooms(keptPage('lounges', user.id));
      if (kept.length > 0) set({ lounges: kept });
    }
    set({ loungesLoading: true });
    const askedAt = monotonicNow();
    try {
      // The corridor in one trip (get_lounge_list, 20261109_02): the member's seats, the newest
      // rooms (private ones too; they need admission), the rooms joined and hosted, the unread
      // counts, the door requests at the rooms hosted, the faces of the member's own rooms and the
      // last words of the rest, each read on the server under the rule it is read under alone.
      const { data, error } = await supabase.rpc('get_lounge_list');
      if (error) throw error;
      // A piece that is not a list is a read that failed, never an empty one: a short list drawn as
      // the whole house would hide the member's own salons, with nothing saying so.
      const corridor = corridorOf(data);
      if (!corridor) throw new Error('get_lounge_list answered without every piece of the corridor');

      const memberships = corridor.memberships;
      const myLoungeIds = memberships.map(r => r.lounge_id);
      // A seat a ban or a mute has taken is not one of "your salons": the room stays in the directory.
      const seatedIds = memberships.filter((r) => !UNSEATED.includes(String(r.status))).map((r) => r.lounge_id);
      const statusMap = new Map(memberships.map(r => [r.lounge_id, r.status]));
      // The rooms the member owns or joined.
      const ownedOrJoinedIds = new Set(seatedIds);
      corridor.hosted.forEach((l) => ownedOrJoinedIds.add(l.id));

      // Merged, deduplicating by id.
      const allLoungesMap = new Map<string, RoomRow>();
      for (const l of [...corridor.newest, ...corridor.joined, ...corridor.hosted]) allLoungesMap.set(l.id, l);

      const unreadCounts: Record<string, number> = {};
      const lastMessageTimestamps: Record<string, string> = {};
      for (const row of corridor.unread) {
        unreadCounts[row.lounge_id] = Number(row.unread_count) || 0;
        if (row.last_message_at) lastMessageTimestamps[row.lounge_id] = row.last_message_at;
      }
      // Every room the member belongs to gets an entry, whether or not the count named it: the UI
      // reads these maps directly.
      for (const id of myLoungeIds) {
        if (!(id in unreadCounts)) unreadCounts[id] = 0;
      }

      // How many requests are at the door, per room hosted: the landing card's "at the door" badge.
      // Never one the host has blocked or muted: the house leaves them out (20261116_01), and one
      // hidden since this read is left out here, as the room's own door leaves them out.
      const pendingCounts: Record<string, number> = {};
      for (const r of corridor.pending) {
        if (r.user_id && useBlockStore.getState().isHidden(r.user_id)) continue;
        pendingCounts[r.lounge_id] = (pendingCounts[r.lounge_id] || 0) + 1;
      }

      // The faces of the member's own rooms (at most 3 a room), for the card's avatar stack.
      const facesMap: Record<string, { username: string; avatar_url: string | null }[]> = {};
      for (const r of corridor.faces) {
        (facesMap[r.lounge_id] ??= []).push({ username: r.username, avatar_url: r.avatar_url });
      }

      // When the last word was said in each room of the directory: the row's news.
      for (const r of corridor.last_words) {
        if (r.last_message_at) lastMessageTimestamps[r.lounge_id] = r.last_message_at;
      }

      // Sort by recent activity
      const loungesList = Array.from(allLoungesMap.values());
      loungesList.sort((a, b) => {
        const aTime = lastMessageTimestamps[a.id] || a.created_at;
        const bTime = lastMessageTimestamps[b.id] || b.created_at;
        return dateOf(bTime).getTime() - dateOf(aTime).getTime();
      });

      // Rooms marked read since this read was asked: read, whatever its answer counted.
      const readSince = new Set([..._readRoomsHere].filter(([, at]) => at >= askedAt).map(([id]) => id));
      for (const [id, at] of _readRoomsHere) if (at < askedAt) _readRoomsHere.delete(id);

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
        unread_count: ownedOrJoinedIds.has(l.id) ? (readSince.has(l.id) ? 0 : unreadCounts[l.id] || 0) : undefined,
        last_message_at: lastMessageTimestamps[l.id],
        membership_status: statusMap.get(l.id) as LoungeRoom['membership_status'],
        pending_count: pendingCounts[l.id] || 0,
        memberFaces: facesMap[l.id],
      }));

      // Left mid-flight — see sessionGuard. Writing here would repopulate a store
      // the logout reset has already cleared.
      if (!memberUnchanged(startedAs)) return;
      set({ lounges: enriched, loungesFailed: false, loungesLoading: false, loungesRead: true });
      keepPage('lounges', user.id, enriched);
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

  searchLounges: async (words) => {
    const pattern = buildSearchPattern(words);
    if (pattern === null) return [];
    const { data, error } = await supabase.from('lounges')
      .select(ROOM_COLUMNS)
      .or(`name.ilike.*${pattern}*,description.ilike.*${pattern}*`)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      logger.warn('[LoungeStore.searchLounges] the house could not be searched:', error.message);
      return null;
    }
    // A salon the corridor holds keeps all it knows (its news, its seat); one found past it is a door.
    const held = new Map(get().lounges.map((l) => [l.id, l]));
    return ((data ?? []) as RoomRow[]).map((l) => held.get(l.id) ?? {
      id: l.id, name: l.name, description: l.description ?? '', is_private: l.is_private ?? false,
      creator_id: l.creator_id, created_at: l.created_at, member_count: l.member_count ?? 0,
      cover_image: l.cover_image ?? null, mine: false,
    });
  },

  fetchMessages: async (loungeId: string) => {
    // The room already open, with words from the house held: what it missed is read and merged,
    // quietly. Read whole, it replaced them, and a failed bubble or an older page went with them.
    if (get().currentLoungeId === loungeId && serverHeld(get().currentMessages).length > 0) return get().catchUpMessages(loungeId);
    // The room left keeps its words; one kept is drawn at once, anyone hidden since left out.
    const leaving = get();
    if (leaving.currentLoungeId && leaving.currentLoungeId !== loungeId && serverHeld(leaving.currentMessages).length > 0) {
      _keptRooms.delete(leaving.currentLoungeId);
      _keptRooms.set(leaving.currentLoungeId, leaving.currentMessages);
      for (const oldest of _keptRooms.keys()) { if (_keptRooms.size <= KEPT_ROOMS) break; _keptRooms.delete(oldest); }
    }
    if (_readBackIn !== loungeId) _readBackIn = null;
    const kept = (_keptRooms.get(loungeId) ?? []).filter((m) => !hiddenHere(m));
    _keptRooms.delete(loungeId);
    if (serverHeld(kept).length > 0) {
      set({ currentLoungeId: loungeId, currentMessages: kept, messagesLoading: false, messagesFailed: false });
      return get().catchUpMessages(loungeId);
    }
        const startedAs = useAuthStore.getState().user?.id ?? null;
    // Another room's words go at once: kept, they stood under this room's name until its own
    // came, and for good when its read failed. The same room's stay while it is read again.
    set((s) => ({
      currentLoungeId: loungeId,
      messagesLoading: true,
      messagesFailed: false,
      currentMessages: s.currentLoungeId === loungeId ? s.currentMessages : [],
    }));
    // Words heard after this moment are kept over the answer, which was read before them.
    const heardFrom = _heardSeq;
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
                created_at: houseIso(),
            } as unknown as LoungeMessage);
        }
        // Only for the member who asked: the queued messages stitched in are theirs.
        if (!memberUnchanged(startedAs)) return;
        keepReactionRows(loungeId, reactionRowsOf(data as unknown as LoungeMessageRow[]));
        // Only if this room is still the open one: a slower fetch for a room left
        // behind would put its words under the new room's name.
        set(s => {
          if (s.currentLoungeId !== loungeId) return s;
          // Merged, never replaced: a word heard live since this read was asked, which its answer
          // was read too early to hold, stays in its place, and so does a word of this phone's own
          // still sending or failed, sent while the read was out (round 13).
          const answered = new Set(finalMessages.map(m => m.id));
          const heardSince = s.currentMessages.filter(m => !answered.has(m.id)
            && ((_heardLive.get(m.id) ?? 0) > heardFrom || m.status === 'sending' || m.status === 'failed'));
          const words = heardSince.length === 0 ? finalMessages : capMessages([...finalMessages, ...heardSince].sort(before));
          return { currentMessages: words.filter(m => !hiddenHere(m)) };
        });
        // The channel went live while this read was out: what was said between the read's moment
        // and the channel's is read now, from the newest word held.
        if (_catchUpAfterRead === loungeId && get().currentLoungeId === loungeId) {
          _catchUpAfterRead = null;
          // A room that held no word is read whole once more (a catch-up pages from a word held).
          if (serverHeld(get().currentMessages).length > 0) void get().catchUpMessages(loungeId);
          else void get().fetchMessages(loungeId);
        }
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
        const filteredOlder = olderMessages.filter(m => !hiddenHere(m));
        if (!memberUnchanged(startedAs)) return;
        keepReactionRows(loungeId, reactionRowsOf(data as unknown as LoungeMessageRow[]));
        // Into the LIVE list, not `current` (read before the await), which would erase what
        // arrived over realtime during the scroll; and only into this room.
        set(s => {
          if (s.currentLoungeId !== loungeId) return s;
          const have = new Set(s.currentMessages.map(m => m.id));
          const older = filteredOlder.filter(m => !have.has(m.id));
          if (older.length === 0) return s;
          _readBackIn = loungeId;
          return { currentMessages: [...older, ...s.currentMessages] };
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
    // The reaction rows each page carries, kept once the answer is this member's.
    const heard: ReactionRow[] = [];
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
        heard.push(...reactionRowsOf(rows));
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
        keepReactionRows(loungeId, reactionRowsOf(data as unknown as LoungeMessageRow[]));
        set((s) => {
          if (s.currentLoungeId !== loungeId) return s;
          const fromHouse = new Set(serverHeld(s.currentMessages).map((m) => m.id));
          // One of this phone's own the house now holds is the house's: kept as well, it was drawn twice.
          const answered = new Set(newest.map((m) => m.id));
          const own = s.currentMessages.filter((m) => !fromHouse.has(m.id) && !answered.has(m.id));
          return { currentMessages: [...newest.filter((m) => !hiddenHere(m)), ...own].sort(before) };
        });
        return;
      }

      // What is held, read again light: withdrawn or gone since (or put back, a verdict overturned),
      // the words it quotes as they stand now (a quoted message withdrawn or removed takes its words
      // out of every reply), its card as the house holds it now, and its reactions now.
      const { data: marks, error: marksError } = await supabase
        .from('lounge_messages')
        .select('id, deleted_at, content, metadata, film_title, film_poster, reply_to_content, lounge_message_reactions!lounge_message_reactions_message_id_fkey(id, message_id, reaction, user_id)')
        .eq('lounge_id', loungeId)
        .gte('created_at', oldestHeld.created_at)
        .lte('created_at', newestHeld.created_at)
        .limit(1000);
      if (!memberUnchanged(startedAs)) return;
      type Mark = {
        id: string; deleted_at: string | null; content?: string | null; metadata?: Record<string, unknown> | null;
        film_title?: string | null; film_poster?: string | null; reply_to_content?: string | null; lounge_message_reactions?: ReactionRow[];
      };
      const read = !marksError && marks ? (marks as unknown as Mark[]) : null;
      const byId = new Map((read ?? []).map((r) => [r.id, r]));
      const reactions = summarizeReactions((read ?? []).flatMap((r) => r.lounge_message_reactions ?? []), myId);
      keepReactionRows(loungeId, [...heard, ...(read ?? []).flatMap((r) => r.lounge_message_reactions ?? [])]);
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
          const putBack = !mark.deleted_at && !!m.deleted_at;
          const quote = mark.reply_to_content ?? null;
          const requoted = quote !== (m.reply_to_content ?? null);
          const recarded = isCardOfAPiece(m.type) && !!mark.metadata && JSON.stringify(mark.metadata) !== JSON.stringify(m.metadata ?? null);
          if (!withdrawn && !putBack && !requoted && !recarded && JSON.stringify(r ?? null) === JSON.stringify(m.reactions ?? null)) return [m];
          changed = true;
          return [{
            ...m,
            ...(withdrawn ? { content: '', deleted_at: mark.deleted_at } : {}),
            ...(putBack ? { content: (mark.content ?? '').replace(/<[^>]*>/g, ''), deleted_at: null } : {}),
            ...(requoted ? { reply_to_content: quote } : {}),
            ...(recarded ? { metadata: mark.metadata ?? undefined, film_title: mark.film_title ?? undefined, film_poster: mark.film_poster ?? undefined } : {}),
            reactions: r,
          }];
        });
        // One of this phone's still drawn sending (or failed) that the read holds was delivered by the
        // queue while the channel was down, and its echo never came: it stood dimmed, with no reply or
        // reaction, for as long as the app ran (review round 9). The house's word settles it.
        const answered = new Map(fresh.map((m) => [m.id, m]));
        let settled = false;
        const mine = kept.map((m) => {
          const got = m.status === 'sending' || m.status === 'failed' ? answered.get(m.id) : undefined;
          if (!got) return m;
          settled = true;
          return { ...m, created_at: got.created_at, status: 'sent' as const };
        });
        const have = new Set(mine.map((m) => m.id));
        const add = fresh.filter((m) => !have.has(m.id) && !hiddenHere(m));
        if (add.length === 0 && !changed && !settled) return s;
        return { currentMessages: add.length === 0 && !settled ? mine : [...mine, ...add].sort(before) };
      });
    } catch {
      // Not reached: what is held stays, and the room's line says so.
    }
  },

  clearMessages: () => set({ currentMessages: [] }),

  // Uses the same hiddenHere() check as fetchMessages, loadMoreMessages and the realtime
  // insert handler — so a message that survives here is exactly one that would survive a
  // fresh load. No second definition of "hidden": a reply quoting, or a card of the work of,
  // a member just blocked goes with their own words.
  purgeHiddenMessages: () => set(state => ({
    currentMessages: state.currentMessages.filter(
      m => !hiddenHere(m)
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

    const now = monotonicNow();
    const last = _lastSendAt.get(loungeId);
    const words = `${safeType}:${cleanContent}`;
    if (last && last.words === words && now - last.at < SEND_THROTTLE) return false;
    _lastSendAt.set(loungeId, { at: now, words });

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
      created_at: houseIso(),
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
      // Sent, where it stands: its id is the one it was written with, so the house's answer names
      // the message on screen itself. Taken for a second copy, it was taken off the screen, and
      // came back only with the channel's echo; an echo heard first had already marked it sent,
      // and the message was gone. In a room left before the answer, its kept copy is marked.
      inRoomWords(loungeId, (words) => words.map(m =>
        m.id === optimisticMsg.id
          ? { ...m, id: data.id, created_at: data.created_at, status: 'sent' as const }
          : m
      ).sort((a, b) => {
        const diff = (dateOf(a.created_at).getTime() || 0) - (dateOf(b.created_at).getTime() || 0);
        return diff !== 0 ? diff : byKey(a.id, b.id);
      }));
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
          return 'queued';
        }
      }
      // A stack's card the house refuses for good (the stack sealed, or no longer in the house):
      // no try can change it, so no retry is offered, and the card, which names the stack, leaves
      // the transcript; the member is told which it was (review round 13). A record's or a filing's
      // card likewise, since the house writes each card from its piece (round 14).
      const cardRefused = cardShareRefusal(error);
      if (cardRefused) {
        inRoomWords(loungeId, (words) => words.filter((m) => m.id !== optimisticMsg.id));
        reelToast.error(saidOfCardShareRefusal(cardRefused));
        return false;
      }
      // Keep the dispatch and mark it failed so the transcript shows a discreet
      // "Failed · tap to retry" line (lifecycle state) instead of it vanishing.
      //
      // That holds for a RANK refusal too, deliberately. The retry is what
      // carries the member's sentence across the trip to the Society and back:
      // renew, return, tap it, and it sends. Removing it would make them type
      // it again as the price of paying.
      // Failed where it stands, on screen or kept for a room left: kept 'sending', it was never
      // offered again, and its words never went.
      inRoomWords(loungeId, (words) => words.map(m =>
        m.id === optimisticMsg.id ? { ...m, status: 'failed' as const } : m
      ));
      // The server said why, in a sentence written for this member. Say it,
      // instead of "Failed to send message." over a retry that cannot succeed.
      if (showTierDoor(error, { returnTo: `/lounge/${loungeId}` })) return false;
      // The day's ceiling (round 14): said with the wait the house named; the message stays, failed,
      // for the member to send again once the day turns.
      const paced = salonPaceSaid(error);
      if (paced) {
        reelToast.error(paced);
        return false;
      }
      // A refusal that says no more than 42501: the house is asked whether the salon still stands
      // and the seat is still this member's, and that is said (review round 11).
      if (!isNetworkError(error) && await saidWhyTheSalonRefused(loungeId, user.id)) return false;
      reelToast.error('Failed to send message.');
      return false;
    }
  },

  createLounge: async (name, description, isPrivate, id) => {
    const user = useAuthStore.getState().user;
    const startedAs = user?.id ?? null;
    if (!user) return null;

    const trimmedName = sanitizeInput(name, 'loungeName');
    const trimmedDesc = sanitizeInput(description, 'loungeDescription');
    if (!trimmedName || characterCount(trimmedName) < 2) {
      reelToast.error('Lounge name must be at least 2 characters.');
      return null;
    }
    // Cannot fire while sanitizeInput trims to this same cap; it stands so that the two
    // can never come to disagree in silence.
    if (trimmedName.length > MAX_LENGTHS.loungeName) {
      reelToast.error(`Lounge name cannot exceed ${MAX_LENGTHS.loungeName} characters.`);
      return null;
    }

    // On the clock that only goes forward (waits.ts): a phone's clock set back (by hand, or after
    // running ahead) would otherwise refuse every founding until it caught up with the last one's stamp.
    const now = monotonicNow();
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
        // The form's id: the house founds it once, and answers with it again for its founder.
        p_id: id,
      });

      if (error || !loungeId) {
        logger.error('[LoungeStore.createLounge] RPC failed:', error);
        // Set before the call, so a second tap can't create twice; a failure releases it.
        _lastCreateAt = -Infinity;
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
        created_at: houseIso(),
        // create_lounge seats its creator, approved: counted, and theirs.
        member_count: 1,
        unread_count: 0,
        mine: true,
        membership_status: 'approved',
        pending_count: 0,
      };

      // null, not a bare return: callers test === null, and tsc would let undefined pass.
      if (!memberUnchanged(startedAs)) return null;
      // Asked again after a lost answer, the room may already be drawn by a read between: once.
      set(s => ({ lounges: [newLounge, ...s.lounges.filter(l => l.id !== loungeId)] }));

      get().fetchLounges();
      return loungeId;
    } catch (e) {
      logger.error('[LoungeStore.createLounge] Unhandled error:', e);
      reelToast.error('Could not create lounge. Check your connection and try again.');
      _lastCreateAt = -Infinity;
      return null;
    }
  },

  setLoungeCover: async (loungeId, cover) => {
        const startedAs = useAuthStore.getState().user?.id ?? null;
    const prev = get().lounges.find(l => l.id === loungeId)?.cover_image ?? null;
    const prevSet = get().coversSet;
    // Optimistic: patch the lounges collection so the card updates instantly, and the room's
    // own cover wherever it is drawn (coversSet).
    set(s => ({
      lounges: s.lounges.map(l => l.id === loungeId ? { ...l, cover_image: cover } : l),
      coversSet: { ...s.coversSet, [loungeId]: cover },
    }));
    try {
      const { error } = await supabase.rpc('set_lounge_cover', { p_lounge_id: loungeId, p_cover_image: cover });
      if (error) throw error;
      return true;
    } catch (e) {
      logger.warn('[LoungeStore.setLoungeCover] failed:', e);
      // Revert the optimistic patch on failure — the host sees the truth.
      if (!memberUnchanged(startedAs)) return false;
      set(s => {
        // The room's cover goes back to what this phone had set before, or to what it read.
        const coversSet = { ...s.coversSet };
        if (loungeId in prevSet) coversSet[loungeId] = prevSet[loungeId] ?? null; else delete coversSet[loungeId];
        return { lounges: s.lounges.map(l => l.id === loungeId ? { ...l, cover_image: prev } : l), coversSet };
      });
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
      return true;
    } catch (e) {
      logger.error('[LoungeStore.joinPublicLounge] failed:', e);
      // A seat refused for the rank is its door, never "check your connection"; one refused for a ban
      // says so; and one in a salon dissolved meanwhile says that, and the room lets it go.
      if (salonGoneHere(e)) {
        if (memberUnchanged(startedAs)) hearRoomGone(loungeId);
        reelToast.error(SALON_GONE_SAID);
      } else if (bannedHere(e)) reelToast.error(BANNED_FROM_SALON);
      else if (!showTierDoor(e, { returnTo: `/lounge/${loungeId}` })) {
        reelToast.error('Could not take a seat. Check your connection and try again.');
      }
      return false;
    }
  },

  requestMembership: async (loungeId) => {
    const user = useAuthStore.getState().user;
    const startedAs = user?.id ?? null;
    if (!user) return 'error';
    try {
      const { error } = await supabase.rpc('request_lounge_membership', { p_lounge_id: loungeId });
      if (error) throw error;
      // The request is the house's now; a member who has left since is shown none of it.
      if (!memberUnchanged(startedAs)) return 'requested';
      // Said at once, as the next read will say it: one of yours, AWAITING the host.
      set((s) => ({ lounges: s.lounges.map((l) => (l.id === loungeId ? { ...l, mine: true, membership_status: 'pending' } : l)) }));
      return 'requested';
    } catch (e) {
      logger.error('[LoungeStore.requestMembership] failed:', e);
      if (salonGoneHere(e)) {
        if (memberUnchanged(startedAs)) hearRoomGone(loungeId);
        reelToast.error(SALON_GONE_SAID);
      } else if (bannedHere(e)) reelToast.error(BANNED_FROM_SALON);
      else if (!showTierDoor(e, { returnTo: `/lounge/${loungeId}` })) {
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
    const startedAs = useAuthStore.getState().user?.id ?? null;
    try {
      const { error } = await supabase.rpc('approve_lounge_member', { p_lounge_id: loungeId, p_user_id: userId });
      if (error) throw error;
    } catch (e) {
      logger.error('[LoungeStore.approveMember] failed:', e);
      reelToast.error('Could not admit this guest.');
      return false;
    }
    // The request answered: its notice leaves the bell now, as it has left the house.
    if (memberUnchanged(startedAs)) forgetTheRequestNotice(loungeId, userId);
    return true;
  },

  declineMember: async (loungeId, userId) => {
    const startedAs = useAuthStore.getState().user?.id ?? null;
    try {
      const { error } = await supabase.rpc('decline_lounge_member', { p_lounge_id: loungeId, p_user_id: userId });
      if (error) throw error;
    } catch (e) {
      logger.error('[LoungeStore.declineMember] failed:', e);
      reelToast.error('Could not decline this request.');
      return false;
    }
    // The request answered: its notice leaves the bell now, as it has left the house.
    if (memberUnchanged(startedAs)) forgetTheRequestNotice(loungeId, userId);
    return true;
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
      // An answer lost on the way back is not a refusal: the house may hold the change. What it
      // holds is read back, and a change it took stays drawn; unread, the mark goes back.
      if (isNetworkError(e)) {
        const { data: held, error: readError } = await supabase
          .from('lounge_message_reactions')
          .select('reaction')
          .eq('message_id', messageId)
          .eq('user_id', user.id)
          .eq('reaction', reaction);
        if (!readError && Array.isArray(held) && (held.length > 0) !== wasMine) return;
      }
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
    // Optimistic tombstone (continuity over a jarring disappearance), and its words taken out of
    // every reply here that quotes it, as the house takes them (a_withdrawn_message_leaves_its_quotes):
    // the words withdrawn stayed quoted under other members' replies for the rest of the run.
    const quoted = new Map(get().currentMessages
      .filter((m) => m.reply_to_id === messageId && m.reply_to_content)
      .map((m) => [m.id, m.reply_to_content] as const));
    set(s => ({
      currentMessages: s.currentMessages.map(m =>
        m.id === messageId ? { ...m, content: '', deleted_at: houseIso(), reactions: [] }
          : quoted.has(m.id) ? { ...m, reply_to_content: null } : m
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
      // Its quotes come back with it, where nothing has taken them since.
      set(s => ({
        currentMessages: s.currentMessages.map(m => m.id === messageId ? target
          : quoted.has(m.id) && m.reply_to_content == null ? { ...m, reply_to_content: quoted.get(m.id) } : m),
      }));
      reelToast.error('Could not withdraw this dispatch.');
    }
  },

  retryMessage: async (messageId) => {
    const user = useAuthStore.getState().user;
    const startedAs = user?.id ?? null;
    const msg = get().currentMessages.find(m => m.id === messageId);
    // Held in the queue, refused for the rank while offline: drawn failed in its room, sent again here.
    const held = stillHeld('send_lounge_message', messageId);
    if (!user || !msg || (msg.status !== 'failed' && !held)) return false;
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
      // Sent: the queue holds it no longer, for this member or the next.
      if (held) letHeldGo(messageId);
      if (!memberUnchanged(startedAs)) return true;
      set(s => ({
        currentMessages: s.currentMessages.map(m =>
          m.id === messageId ? { ...m, id: data.id, created_at: data.created_at, status: 'sent' as const } : m
        ),
      }));
      return true;
    } catch (e) {
      // Neither queued as the next member nor marked in their transcript.
      if (!memberUnchanged(startedAs)) return false;
      if (isNetworkError(e)) {
        // Already in the queue when held: it waits to be sent, never queued twice.
        if (held) sendHeldAgain(messageId);
        else enqueueMutation({ type: 'send_lounge_message', payload: { ...payload, _tempId: payload.id } });
        flushOfflineQueue();
        set(s => ({ currentMessages: s.currentMessages.map(m => m.id === messageId ? { ...m, status: 'sending' as const } : m) }));
        return true;
      }
      // The stack sealed or gone since, or the record or filing (round 14): final, said, and the card
      // (which names it) leaves (round 13).
      const cardRefused = cardShareRefusal(e);
      if (cardRefused) {
        if (held) letHeldGo(messageId);
        set(s => ({ currentMessages: s.currentMessages.filter(m => m.id !== messageId) }));
        reelToast.error(saidOfCardShareRefusal(cardRefused));
        return false;
      }
      set(s => ({ currentMessages: s.currentMessages.map(m => m.id === messageId ? { ...m, status: 'failed' as const } : m) }));
      // "Try again" is the one thing that cannot help a member without the
      // rank — so a refusal gets the door, and only a real failure gets that.
      if (showTierDoor(e, { returnTo: `/lounge/${msg.lounge_id}` })) return false;
      // The salon gone, or the seat: said, never "try again" (review round 11).
      if (await saidWhyTheSalonRefused(msg.lounge_id, user.id)) return false;
      reelToast.error('Still could not send. Try again.');
      return false;
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
    const seated = get().lounges.find((l) => l.id === loungeId);
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
      // The seat is still theirs: put back as it was, then read. A read that fails (no signal,
      // the usual reason a leave fails) kept the room drawn as left under the toast.
      if (seated) set(s => ({ lounges: s.lounges.map(l => (l.id === loungeId ? seated : l)) }));
      await get().fetchLounges();
      return false;
    }
    return true;
  },

  deleteLounge: async (loungeId) => {
    // The member who asked: after the await, nothing is put back on another member's page.
    const user = useAuthStore.getState().user;
    if (!user) return false;
    
    // Optimistic removal, where it stood kept to put back.
    const standing = get().lounges;
    const at = standing.findIndex((l) => l.id === loungeId);
    const room = at >= 0 ? standing[at] : null;
    set(s => ({ lounges: s.lounges.filter(l => l.id !== loungeId) }));
    
    // As in leaveLounge: a non-creator's delete touches no rows and still answers 200,
    // so no rows back is the refusal (checked against production).
    const { data: destroyed, error } = await supabase.from('lounges').delete()
      .eq('id', loungeId)
      .eq('creator_id', user.id)
      .select('id');

    if (error || !destroyed || destroyed.length === 0) {
      // Their failed act is not the next member's to see.
      if (!memberUnchanged(user.id)) return false;
      reelToast.error('Failed to incinerate lounge.');
      // Back where it stood, then read: a read that fails kept the room gone under the toast.
      if (room) {
        set(s => (s.lounges.some((l) => l.id === loungeId) ? {} : {
          lounges: [...s.lounges.slice(0, at), room, ...s.lounges.slice(at)],
        }));
      }
      await get().fetchLounges();
      return false;
    }
    return true;
  },

  subscribeToLounge: (loungeId: string, opts?: { onMembership?: () => void; seated?: boolean }) => {
    const me = useAuthStore.getState().user;
    const seated = !!opts?.seated;
    // Back after a drop, what was said in the gap is read; down past a beat, the room says it is
    // not live and is read again on a fixed interval until the channel answers.
    // Live for the first time, what came since the room's read is read (catchUpOnFirstLive).
    const watch = watchChannel({ reread: () => { void get().catchUpMessages(loungeId); }, onLive: (live) => set((s) => (s.roomLive === live ? s : { roomLive: live })), onFirstLive: () => catchUpOnFirstLive(loungeId) });
    const holder: SalonHolder = { watch, onMembership: opts?.onMembership, seated };
    const salon = _salons.get(loungeId) ?? { holders: new Set<SalonHolder>(), channel: null, status: null };
    _salons.set(loungeId, salon);
    salon.holders.add(holder);
    // Its channel already open for another copy of this room: this one shares it, told at once
    // where it stands.
    if (salon.channel && salon.status) watch.status(salon.status);
    /**
     * The rooms the channel's word goes to. The salon's entry goes with its last room, and the channel
     * with it: a channel being left (its CLOSED, a status of the one before) tells no one.
     */
    const holdersNow = (): SalonHolder[] => (_salons.get(loungeId) === salon ? [...salon.holders] : []);
    // Opened once the salon's last leave is answered: joined again at once, it was handed the channel
    // on its way out and heard nothing (openChannel, review round 9).
    const close = openChannel(`lounge-${loungeId}`, (topic) => {
      const channel: RealtimeChannel = supabase
        .channel(topic, {
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
            if (hiddenHere(msg)) return;

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
              carries_words_of: msg.carries_words_of,
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
              // Heard now: a read already on its way, whose answer misses it, keeps it (_heardLive).
              heardLive(newMsg.id);

              return {
                currentMessages: capMessages([...messagesWithoutOpt, newMsg].sort((a, b) => dateOf(a.created_at).getTime() - dateOf(b.created_at).getTime())),
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
            // A card is written by the house alone: taken down when its piece goes (withdrawn, deleted,
            // its writer left, withheld by a verdict), and made again when it comes back (a verdict
            // overturned, a stack opened again). Taken as it comes, both ways, so it reads true live.
            const card = isCardOfAPiece(row.type) && row.metadata && typeof row.metadata === 'object'
              ? { metadata: row.metadata, film_title: row.film_title ?? undefined, film_poster: row.film_poster ?? undefined }
              : {};
            // A reply whose quoted message was withdrawn or removed by the house has its quote taken
            // by the house (a_withdrawn_message_leaves_its_quotes): taken as it comes, so the words
            // leave every screen holding the room, not only the next read (review round 14).
            const quote = 'reply_to_content' in row ? { reply_to_content: row.reply_to_content ?? null } : {};
            set(s => ({
              currentMessages: s.currentMessages.map(m =>
                m.id === row.id
                  // Its withdrawal as the house now holds it: a message put back by an overturned
                  // verdict comes with deleted_at null, and is drawn whole again, never as withdrawn.
                  ? { ...m, ...card, ...quote, content: row.deleted_at ? '' : (row.content?.replace(/<[^>]*>/g, '') ?? m.content),
                      deleted_at: 'deleted_at' in row ? (row.deleted_at ?? null) : m.deleted_at }
                  // A message withdrawn takes its words out of every reply quoting it, as the house does.
                  : row.deleted_at && m.reply_to_id === row.id && m.reply_to_content ? { ...m, reply_to_content: null }
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
            // Kept by its id, own or another's: its withdrawal will arrive as the id alone.
            keepReactionRows(loungeId, [r]);
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
            // The house sends the row's key alone (row security): its message, reaction and
            // member are the ones kept under that id. A whole old row, were one sent, serves too.
            const old = payload.old as Partial<ReactionRow> | undefined;
            const kept = old?.id ? _reactionRows.get(old.id) : undefined;
            if (old?.id) _reactionRows.delete(old.id);
            const r = kept ?? (old?.message_id && old.reaction ? (old as ReactionRow) : undefined);
            if (!r) return;
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
          () => { for (const h of holdersNow()) h.onMembership?.(); }
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
          const viewer = self?.id ?? null;
          // Named only if the house shows this reader the typist: the broadcast reaches every reader of
          // the room, and one who blocked the reader is no one to them (typistShown). Not if the room
          // was left, or another member signed in, meanwhile.
          void shownByTheHouse(viewer, p.user_id).then((shown) => {
            if (!shown || holdersNow().length === 0 || (useAuthStore.getState().user?.id ?? null) !== viewer) return;
            // Reset this typist's silence timer.
            const existing = _typingTimers.get(username);
            if (existing) clearTimeout(existing);
            _typingTimers.set(username, setTimeout(() => {
              _typingTimers.delete(username);
              set(s => ({ typingUsers: s.typingUsers.filter(u => u !== username) }));
            }, TYPING_TTL));
            set(s => s.typingUsers.includes(username) ? s : { typingUsers: [...s.typingUsers, username] });
          });
        })
        .subscribe((status) => {
          // Told to every room holding the channel, and kept for a room that comes to share it.
          const holders = holdersNow();
          if (holders.length === 0) return;
          salon.status = status;
          for (const h of holders) h.watch.status(status);
          // Presence once the channel is live, from a seated member only: a reader
          // without a seat is in the room unseen.
          if (status === 'SUBSCRIBED' && me && holders.some((h) => h.seated)) {
            channel.track({ username: me.username });
          }
        });
      salon.channel = channel;
      return channel;
    });
    const leave = () => {
      // Left on purpose: its CLOSED is not a drop.
      watch.end();
      close();
      _roomLeaves.delete(leave);
      salon.holders.delete(holder);
      // The last room holding the channel: it went with the close. Another copy of the room still
      // holds it: the channel, the room's pulse and its typists stay theirs.
      if (salon.holders.size > 0) return;
      if (_salons.get(loungeId) === salon) _salons.delete(loungeId);
      set({ roomLive: true });
      clearTypingState(set);
    };
    _roomLeaves.add(leave);
    return leave;
  },

  broadcastTyping: (loungeId: string) => {
    const now = monotonicNow();
    if (now - _lastTypingBroadcastAt < TYPING_THROTTLE) return;
    const me = useAuthStore.getState().user;
    const salon = _salons.get(loungeId);
    const seatedHere = !!salon?.channel && [...salon.holders].some((h) => h.seated);
    if (!me || !seatedHere || get().currentLoungeId !== loungeId) return;
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
    }));
    _readRoomsHere.set(loungeId, Infinity);

    try {
      const { error } = await supabase
        .from('lounge_members')
        .update({ last_read_at: houseIso() })
        .eq('lounge_id', loungeId)
        .eq('user_id', user.id);
      
      if (error) throw error;
      // Landed after a sign-out, it is the last member's: two members may sit in one salon.
      if (memberUnchanged(user.id)) _readRoomsHere.set(loungeId, monotonicNow());
    } catch (e) {
      if (memberUnchanged(user.id)) _readRoomsHere.delete(loungeId);
      logger.warn('[Lounge] markRead failed:', e);
    }
  },
}));

// Register cleanup handler for centralized logout
registerStoreReset(() => {
    useLoungeStore.setState(loungesAtStart());
    _lastCreateAt = -Infinity;
    _lastTypingBroadcastAt = -Infinity;
    // Every module-level memory, or the next member on this phone inherits it.
    _lastSendAt.clear();
    _keptRooms.clear();
    _readRoomsHere.clear();
    _readBackIn = null;
    _heardSeq = 0;
    _heardLive.clear();
    _catchUpAfterRead = null;
    _reactionRows.clear();
    _reactionRowsOf = null;
    for (const t of _typingTimers.values()) clearTimeout(t);
    _typingTimers.clear();
    // Unsubscribe, not just forget: a live channel would write the next message into
    // the store this reset just cleared.
    // Through its close, so one still waiting on its last leave never opens for the next member.
    // Every room's: two copies of one room hold one channel, and it is left only with the last.
    for (const leave of [..._roomLeaves]) {
        try { leave(); } catch { /* already gone */ }
    }
    _roomLeaves.clear();
    _salons.clear();
    // Purge profile cache to prevent cross-session PII leakage
    _profileCache.clear();
});

/**
 * A request to enter a salon, answered at its door: its notice leaves the host's bell and board at
 * once, as the house has taken it (a_salon_request_takes_its_notice, review round 12). Required
 * here, not imported: the notices' store hears the block store when it loads, and the salon's store
 * is loaded where the block store is a stand-in without that.
 */
function forgetTheRequestNotice(loungeId: string, userId: string): void {
  const { useNotificationStore } = require('./notificationStore') as typeof import('./notificationStore');
  useNotificationStore.getState().forgetSalonRequestNotices(loungeId, userId);
}
