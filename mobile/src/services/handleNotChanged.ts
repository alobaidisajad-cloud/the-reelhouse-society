/**
 * A rename the house did not make, after the rest of an Edit Profile save.
 *
 * The handle is written last, through the house's own rename (rename_my_handle), after every other
 * field the member amended. When the rename is refused (the handle was taken a moment before by
 * someone else, 23505; or it breaks a rule of the handle, 23514), or never reached the house, the
 * other amendments are already saved. The member is told exactly that, never a bare "could not be
 * saved" over a bio that was saved.
 */
import { isNetworkError } from '@/src/utils/networkError';

export class HandleNotChanged extends Error {
  /** The house's code for the refusal ('23505' taken, '23514' a rule of the handle), when it gave one. */
  readonly code: string | undefined;
  constructor(
    /** What the rename was answered with: the house's refusal, or the failure that kept it from the house. */
    readonly refusal: unknown,
    /** Whether the other amendments were written before it. */
    readonly othersSaved: boolean,
    /** The handle the house holds, when the write before it read it back. */
    readonly kept: string | undefined,
  ) {
    const said = (refusal as { message?: unknown } | null)?.message;
    super(typeof said === 'string' && said ? said : 'The handle was not changed.');
    this.name = 'HandleNotChanged';
    const code = (refusal as { code?: unknown } | null)?.code;
    this.code = typeof code === 'string' && code ? code : undefined;
  }
}

/** Why the handle was not changed, in the member's words: taken, a rule's own words, or not reached. */
export function whyHandleNotChanged(e: HandleNotChanged, typed: string): string {
  if (e.code === '23505') return `@${typed} is already taken.`;
  if (e.code === '23514') return e.message;
  if (isNetworkError(e.refusal)) return 'the house could not be reached for it. Save again to try.';
  return 'the house would not take it. Save again to try.';
}

/** What the member is told: what was saved, that the handle was not, and why. */
export function saidOfHandleNotChanged(e: HandleNotChanged, typed: string, held: string): string {
  const why = whyHandleNotChanged(e, typed);
  return e.othersSaved
    ? `Your other amendments are saved, but your handle is still @${held}: ${why}`
    : `Your handle is still @${held}: ${why}`;
}
