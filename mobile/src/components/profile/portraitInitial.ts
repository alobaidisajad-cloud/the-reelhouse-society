import { initialOf } from '@/src/utils/text';

/**
 * The letter on a member's own file's portrait when it has no photograph: the
 * first of the name the file shows beside it (persona, else display name, else
 * handle). Elsewhere a portrait sits beside the handle, and takes the handle's
 * letter (initialOf): a letter is always the first of the name next to it.
 */
export function portraitInitial(member: {
  persona?: string | null;
  display_name?: string | null;
  username?: string | null;
} | null | undefined): string {
  return initialOf(member?.persona || member?.display_name || member?.username) || '?';
}
