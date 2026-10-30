/**
 * lastRoom — a member whose unsaved words were on screen comes back to them.
 * ─────────────────────────────────────────────────────────────────────────────
 * lastTab reopens only a tab, because a page deeper in may since be gone. A
 * writing room is never gone: it is the member's own, and what they had written
 * in it is kept in its draft. So when the phone ends the app behind the member's
 * back (killed in the background, or its screen rebuilt: Android's "don't keep
 * activities", a change of display size), a launch within the half hour opens
 * the room again over its tab, and the room takes up its draft.
 *
 * The room is forgotten when the member leaves it: the room closing while the
 * app is in front. When the system tears the screen down the app is already in
 * the background, and the room is kept. A room whose draft has gone (saved,
 * discarded, or started clean) is never reopened.
 */
import { storage } from '../stores/mmkv-storage';
import { readDraft, type DraftKind } from './memberDrafts';
import { RETURN_WITHIN_MS } from './lastTab';

export const LAST_ROOM_KEY = 'last_room';

/** Each writing room a launch may reopen: its address, and the draft it takes up there. */
export const ROOMS = {
  'edit-profile': { href: '/edit-profile', draft: 'profile' },
  'log-modal': { href: '/log-modal', draft: 'log' },
  essay: { href: '/dispatch/compose?kind=dossier', draft: 'dossier' },
} as const satisfies Record<string, { href: string; draft: DraftKind }>;
export type RoomName = keyof typeof ROOMS;

const isRoom = (v: unknown): v is RoomName => typeof v === 'string' && Object.keys(ROOMS).includes(v);

function read(): { room: RoomName; at: number } | null {
  try {
    const v = JSON.parse(storage.getString(LAST_ROOM_KEY) ?? 'null') as { room?: unknown; at?: unknown } | null;
    return v && isRoom(v.room) && typeof v.at === 'number' ? { room: v.room, at: v.at } : null;
  } catch {
    return null;
  }
}

/**
 * Written quietly: a phone with no room left throws from the write, here inside the room's own
 * effect, and a room not remembered only means a launch opens its tab without it.
 */
function keep(value: { room: RoomName; at: number } | null): void {
  try {
    if (value) storage.set(LAST_ROOM_KEY, JSON.stringify(value));
    else storage.delete(LAST_ROOM_KEY);
  } catch { /* not remembered: nothing else is lost */ }
}

/** The member is in this room now. */
export function enterRoom(room: RoomName, now: number = Date.now()): void {
  keep({ room, at: now });
}

/** The member has left this room (and no later one has been entered since). */
export function leaveRoom(room: RoomName): void {
  if (read()?.room === room) keep(null);
}

/** The app is leaving the screen: the half hour is counted from its last use. */
export function stampRoom(now: number = Date.now()): void {
  const last = read();
  if (last) keep({ room: last.room, at: now });
}

/** The room to reopen at launch: the member's own, within the half hour, its draft still there. */
export function roomToReopen(memberId: string | null | undefined, now: number = Date.now()): RoomName | null {
  const last = read();
  if (!last || !memberId) return null;
  const since = now - last.at;
  if (since < 0 || since > RETURN_WITHIN_MS) return null;
  return readDraft(memberId, ROOMS[last.room].draft) ? last.room : null;
}
