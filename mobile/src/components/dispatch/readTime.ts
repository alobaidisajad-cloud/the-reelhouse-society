/**
 * How long an essay takes to read: 200 words a minute, never `0 MIN`. One home,
 * for the reader, the series page and the Lobby, so they never disagree.
 */
export function readTimeOf(text: string): string {
  return readTimeForWords(text.trim().split(/\s+/).filter(Boolean).length);
}

/**
 * The same figure from a count of words, for a page that is sent the count and
 * not the essay (the Lobby: the house counts an essay's words as it chooses it,
 * so a wall of three essays does not carry three essays).
 */
export function readTimeForWords(words: number): string {
  return `${Math.max(1, Math.round(words / 200))} MIN`;
}
