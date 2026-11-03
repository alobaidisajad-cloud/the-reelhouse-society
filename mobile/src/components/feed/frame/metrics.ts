/**
 * The Reel's frame, in numbers: every measure the frame is built from and planned with, in one
 * place, so the arithmetic that plans its lines describes the frame on screen and not another.
 */

/** A frame's corner, the softness of a film frame's own. */
export const FRAME_RADIUS = 9;

export const FRAME = {
  /** The page's margin each side, where the frame stands. */
  margin: 16,
  /** Between two frames: the frame line. */
  gap: 8,
  /** The frame's inset. */
  pad: 14,
  /** The editorial still across the frame, under the byline. */
  still: 108,
  /** The poster: 2:3, and how far it stands over the still's lower edge. */
  poster: { width: 74, height: 111 },
  overlap: 46,
  /** Above the action band. */
  foot: 16,
  /** Lines of review: five, or two under a pull-quote (the drop cap's own height). */
  lines: { alone: 5, underQuote: 2 },
} as const;

/** The frame's inner width in a column `column` points wide: the room its words are planned in. */
export const frameInner = (column: number) => column - FRAME.margin * 2 - FRAME.pad * 2;
