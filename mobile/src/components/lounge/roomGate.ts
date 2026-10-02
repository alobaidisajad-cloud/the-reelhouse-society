/**
 * roomGate.ts — what stands between a member and a room's transcript.
 *
 * The member's standing is UNKNOWN until the roster has been read, and unknown
 * is not "none": a private room's member must never be shown the request door
 * while their seat is being looked up, nor after the list could not be read.
 */
import type { LoungeMemberStatus } from '@/src/types/social.types';

/** The member's standing in the room: read from its roster, or not yet. */
export type RoomStanding = LoungeMemberStatus | 'none' | 'unknown';

export type RoomGate =
  | 'chat'         // the transcript, and the composer if they may speak
  | 'preview'      // a public room, read as a guest
  | 'request'      // a private room's door
  | 'pending'      // their request is with the host
  | 'banned'
  | 'knocking'     // the roster is being read
  | 'unreachable'; // the roster could not be read

/**
 * Where a room's standing STARTS: what the Lounge list already knows of this
 * member in this room (it reads every room they joined), else unknown. The
 * house recognises its members at the door — a member opening their own
 * private room goes straight in, and the roster, read behind them, confirms
 * or corrects it. Only someone the list does not know waits at the door.
 */
export function knownStanding(
  lounges: readonly { id: string; membership_status?: LoungeMemberStatus | null }[],
  roomId: string | undefined,
): RoomStanding {
  return (roomId && lounges.find((l) => l.id === roomId)?.membership_status) || 'unknown';
}

export function roomGate(room: {
  isPrivate: boolean;
  isCreator: boolean;
  standing: RoomStanding;
  /** A request just sent, before the roster shows it. */
  requesting: boolean;
  rosterFailed: boolean;
}): RoomGate {
  const { isPrivate, isCreator, standing, requesting, rosterFailed } = room;
  if (isCreator || standing === 'approved' || standing === 'muted') return 'chat';
  if (standing === 'unknown') return rosterFailed ? 'unreachable' : 'knocking';
  // Before the public room's preview: a member the host has banned was offered
  // TAKE A SEAT, which the house refuses ("cannot join"), and was told to
  // check the connection.
  if (standing === 'banned') return 'banned';
  if (!isPrivate) return 'preview';
  if (standing === 'pending' || requesting) return 'pending';
  return 'request';
}
