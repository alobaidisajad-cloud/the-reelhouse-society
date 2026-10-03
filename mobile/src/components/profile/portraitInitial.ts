/**
 * The letter on a member's portrait when they have no photograph: the first of
 * the name their file shows (persona, else display name, else handle), so every
 * screen shows the same member the same letter.
 */
export function portraitInitial(member: {
  persona?: string | null;
  display_name?: string | null;
  username?: string | null;
} | null | undefined): string {
  return (member?.persona || member?.display_name || member?.username || '?').charAt(0).toUpperCase();
}
