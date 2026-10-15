/**
 * keptOnThisPhone.ts — what this phone holds for a member that the house does
 * not have yet, and the words for it: at the member's own sign-out (which erases
 * it), when their session ends elsewhere (which keeps it), and at their return.
 */
import type { QueuedMutation } from './offlineQueue';
import { unsentFor } from './offlineQueue';
import { countDrafts } from './memberDrafts';
import { WORDS_NOUN, kindOf } from './queueOwnership';

export interface KeptForMember {
  /** Writes not yet sent: queued, or kept for them. */
  unsent: number;
  /** Drafts of every kind; null when they could not be counted. */
  drafts: number | null;
  /** Failed writes holding their words (the dead letter). */
  failedWords: number;
}

export function keptFor(memberId: string): KeptForMember {
  const { unsent, failedWords } = unsentFor(memberId);
  return { unsent, drafts: countDrafts(memberId), failedWords };
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "a", "a and b", "a, b and c". */
function listed(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The sign-out confirm's words; null when this phone holds nothing of theirs. */
export function erasedBySigningOut(k: KeptForMember): string | null {
  const parts: string[] = [];
  if (k.unsent > 0) parts.push(count(k.unsent, 'change not yet sent', 'changes not yet sent'));
  if (k.drafts === null) parts.push('drafts it could not count');
  else if (k.drafts > 0) parts.push(count(k.drafts, 'draft', 'drafts'));
  if (k.failedWords > 0) {
    parts.push(count(k.failedWords,
      'piece of writing that could not be sent', 'pieces of writing that could not be sent'));
  }
  if (parts.length === 0) return null;
  const single = k.unsent + (k.drafts ?? 2) + k.failedWords === 1;
  return `Your membership will remain. This phone still holds, for you: ${listed(parts)}. `
    + `Signing out erases ${single ? 'it' : 'all of them'}.`;
}

/** What a member is told when their session ended without their own hand. */
export function keptAfterSignOutElsewhere(k: { kept: number; lapsed: number; drafts: number | null }): string {
  const parts: string[] = [];
  if (k.kept > 0) parts.push(count(k.kept, 'change not yet sent', 'changes not yet sent'));
  if (k.drafts !== null && k.drafts > 0) parts.push(count(k.drafts, 'draft', 'drafts'));
  let words = 'You were signed out.';
  if (parts.length > 0) words += ` Kept on this phone until you sign in again: ${listed(parts)}.`;
  if (k.lapsed > 0) {
    words += ` ${k.lapsed === 1 ? 'A small mark' : `${k.lapsed} small marks`}`
      + ' (a certify, an endorsement, a follow, a save)'
      + ` ${k.lapsed === 1 ? 'was' : 'were'} not kept.`;
  }
  return words;
}

/** What a member is told at their return, of the writes kept for them; null for none. */
export function keptFromBefore(released: readonly QueuedMutation[]): string | null {
  if (released.length === 0) return null;
  const nouns = new Map<string, { one: string; many: string; n: number }>();
  let others = 0;
  for (const m of released) {
    const noun = kindOf(m) === 'words' ? WORDS_NOUN[m.type] : undefined;
    if (!noun) { others++; continue; }
    const seen = nouns.get(noun[0]) ?? { one: noun[0], many: noun[1], n: 0 };
    seen.n++;
    nouns.set(noun[0], seen);
  }
  const parts = [...nouns.values()].map(({ one, many, n }) => count(n, one, many));
  if (others > 0) {
    parts.push(parts.length > 0
      ? count(others, 'other change', 'other changes')
      : count(others, 'change', 'changes'));
  }
  return `Kept for you from before you were signed out: ${listed(parts)}, waiting on this phone to be sent.`;
}
