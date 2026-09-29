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
  if (!isPrivate) return 'preview';
  if (standing === 'pending' || requesting) return 'pending';
  if (standing === 'banned') return 'banned';
  return 'request';
}
