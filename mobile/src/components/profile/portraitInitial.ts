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
  // Its first CHARACTER, whole: charAt(0) takes half of an emoji and draws a broken box.
  const [first] = Array.from(member?.persona || member?.display_name || member?.username || '?');
  return first.toUpperCase();
}
