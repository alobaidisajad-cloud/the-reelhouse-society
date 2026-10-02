/**
 * departed — how the house names a member who has left, and one whose name it
 * could not read. Their words stay; a name is never made up for them.
 *
 * Deleting an account clears the author's id from what they wrote and writes
 * DEPARTED_HANDLE in their name's place (request_account_deletion,
 * dispatch_scrub_departed). That handle is the database's mark, not a name: it
 * was printed as "@[deleted]", with "[" in the avatar's disc, beside the
 * Dispatch's "A MEMBER, DEPARTED".
 */

/** What the database writes in a departed member's name's place. */
export const DEPARTED_HANDLE = '[deleted]';

/** A departed member, in every surface's own case: the paper sets it in capitals. */
export const DEPARTED_NAME = 'a member, departed';

/** A member whose name could not be read: never "unknown", which reads as a handle. */
export const UNNAMED = 'a member';

/** Whether this handle is the database's mark for a member who has left. */
export const isDepartedHandle = (handle: string | null | undefined): boolean => handle === DEPARTED_HANDLE;

/**
 * The name to print for an author: departed when the row has lost its author's
 * id (or carries the database's mark), the handle when there is one, else
 * UNNAMED.
 */
export function authorName(userId: string | null | undefined, handle: string | null | undefined): string {
  if (!userId || isDepartedHandle(handle)) return DEPARTED_NAME;
  return handle || UNNAMED;
}

/** The name a quoted reply carries (only its handle was kept). */
export function quotedName(handle: string | null | undefined): string {
  if (isDepartedHandle(handle)) return DEPARTED_NAME;
  return handle || UNNAMED;
}
