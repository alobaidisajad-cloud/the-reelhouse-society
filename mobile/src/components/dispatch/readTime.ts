/**
 * How long an essay takes to read.
 * ─────────────────────────────────────────────────────────────────────────────
 * 200 words a minute, the figure this app already uses, with a floor of one:
 * `0 MIN` printed under something a member spent an evening writing is worse
 * than a rounding error.
 *
 * It lives here rather than in the reader because the SERIES page prints the
 * same figure for the same essay. Two copies of a formula that must agree is
 * one copy too many — the day somebody tunes 200 to 220, one page would say
 * `12 MIN` and the other `11 MIN` about the same words.
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
