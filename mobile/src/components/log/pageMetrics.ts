/**
 * The opened log, in numbers: every measure its page is built from, in one place.
 */
export const PAGE = {
  /** The page's margin each side. */
  pad: 18,
  /** The page's bar: one row, a finger tall. */
  bar: 48,
  /** The still's own room under the bar, and the plain head's when there is none. */
  stillUnderBar: 155,
  plainUnderBar: 8,
  /** How far the film stands over the still's lower edge. */
  overlap: 70,
  poster: { width: 100, height: 150 },
  /** The projection's veil: dark where the bar reads, clear where the still is seen. */
  veilTop: 'rgba(13,11,9,0.92)',
  veilTop2: 'rgba(13,11,9,0.88)',
  veilClear: 'rgba(30,25,20,0.2)',
  /** Between the page's sections. */
  section: 26,
  /** The action band: across the whole page, a finger and more tall. */
  band: 62,
} as const;
