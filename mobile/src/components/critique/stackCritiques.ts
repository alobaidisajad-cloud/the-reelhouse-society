/**
 * A stack's critiques as its sheet draws them: those the house sent, less those taken back and
 * waiting to say so; then this member's own still waiting to be sent (each with the id it was made
 * with, so it is never drawn twice); and never a member hidden now (blocked or muted).
 *
 * Kept here, apart from the page, so the one list the sheet draws is asked whole by a test
 * (stackCritiques.test.ts). The page draws it again whenever who is hidden changes.
 */
import type { QueuedMutation } from '@/src/utils/offlineQueue';
import { filterContentByBlocks } from '@/src/utils/filterContentByBlocks';
import type { Critique } from './CritiqueRow';

export interface SentCritique {
  id: string;
  user_id: string;
  username: string;
  avatar_url?: string | null;
  content: string;
  created_at: string;
}

export function stackCritiques(
  sent: readonly SentCritique[] | undefined,
  queued: readonly QueuedMutation[],
  listId: string,
  me: { username?: string | null; avatar_url?: string | null } | null | undefined,
): Critique[] {
  // Taken back and waiting to say so: gone from the page already.
  const takenBack = new Set(queued.filter((m) => m.type === 'remove_list_comment').map((m) => m.payload.comment_id));
  const held: Critique[] = (sent ?? [])
    .filter((c) => !takenBack.has(c.id))
    .map((c) => ({ ...c, body: c.content }));
  const seen = new Set(held.map((c) => c.id));
  const waiting: Critique[] = queued
    .filter((m) => m.type === 'add_list_comment' && m.payload.list_id === listId
      && typeof m.payload.id === 'string' && !seen.has(m.payload.id) && !takenBack.has(m.payload.id))
    .map((m) => ({
      id: m.payload.id as string,
      user_id: String(m.payload.user_id),
      // The queue is only ever this member's (it is emptied at sign-out).
      username: me?.username || 'anonymous',
      avatar_url: me?.avatar_url ?? null,
      body: String(m.payload.content),
      created_at: new Date(m.timestamp).toISOString(),
    }));
  // A member blocked or muted from this sheet (a report's "also block", or the curator's ···)
  // stayed in it under the toast that said they were hidden.
  return filterContentByBlocks([...held, ...waiting], (c) => c.user_id ?? '');
}
