import { initialOf } from '@/src/utils/text';

/**
 * The name a member's own file shows: the name they gave (display name), else their handle. Never
 * their persona, the stamp of a sign-up's choice ("The Midnight Devotee", or "The Cinephile" a
 * mobile sign-up writes): as the name it read the same on many files, and the name a member
 * edited never showed.
 */
export function fileName(member: { display_name?: string | null; username?: string | null } | null | undefined): string {
  return member?.display_name?.trim() || member?.username || '';
}

/**
 * The letter on a member's own file's portrait when it has no photograph: the
 * first of the name the file shows beside it (fileName). Elsewhere a portrait sits beside the
 * handle, and takes the handle's letter (initialOf): a letter is always the first of the name
 * next to it.
 */
export function portraitInitial(member: {
  display_name?: string | null;
  username?: string | null;
} | null | undefined): string {
  return initialOf(fileName(member)) || '?';
}
