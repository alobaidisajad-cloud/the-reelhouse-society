/**
 * cutText — whether a Text's words, as the phone laid them out, were cut (WORKLIST P0.86): the
 * bold-text and largest-text runs fail on a cut no one has judged (e2e/cut-text-judges.mjs).
 * The app's Text asks it on every layout in the E2E build alone (src/components/text).
 *
 * A Text is cut when:
 *   - it ended early: its lines hold fewer of its words than it was given (an ellipsis, or the
 *     lines past its numberOfLines), letters compared alone, so a space, a line break, a
 *     textTransform or the ellipsis itself is no cut;
 *   - a line is wider than its own box: a word that could not break runs out of it;
 *   - its lines are taller than its own box: the box clips its last lines.
 * A Text that shrinks to fit (adjustsFontSizeToFit) is fitted, not cut, unless it still ended early:
 * Android reports its lines as wide as they were before the shrink, so a fitted label read
 * "wider than its box" ("SEALING RECORD…", "Check Your Inbox", largest-text run 40847116101).
 * One still too long at its smallest size is ellipsized, and that is an early end.
 */

/** One line as onTextLayout gives it. */
export interface LaidLine { text: string; width: number; height: number }
/** The box the Text was given, from its own onLayout. */
export interface Box { width: number; height: number }
export type Cut = 'ended early' | 'wider than its box' | 'taller than its box';

/** Half a point: a line measured as wide as its box to the rounding is no cut. */
const SLACK = 0.5;
const letters = (s: string) => s.replace(/[\s…]/gu, '').toLowerCase();

/** A point: words a point longer than their room are no cut, as Android's own roundings differ by about that much. */
const ROOM_SLACK = 1;

/**
 * Whether words whose natural length, on one line, is `natural` points still cannot fit `lines`
 * lines of a box `width` wide, at the smallest size they may shrink to (`scale`, 1 when they do
 * not shrink). The confirmation of an early end: Android's report of a Text's lines can say a
 * label drawn whole ended early (run 39010071533: "E2E_WRITER" at bold text, a twin a pixel wider
 * no different), so the cut is said only when the words, laid out freely, are longer than the room.
 */
export function stillCut(natural: number, width: number, lines: number, scale = 1): boolean {
  return natural * scale > width * Math.max(1, lines) + ROOM_SLACK;
}

/** Why the laid-out words do not all show, or null when they all do. `fitted`: it shrinks to fit. */
export function cutOf(words: string, lines: readonly LaidLine[], box: Box | null, fitted = false): Cut | null {
  if (!words.trim() || lines.length === 0) return null;
  if (letters(lines.map((l) => l.text).join('')).length < letters(words).length) return 'ended early';
  if (!box || fitted) return null;
  if (lines.some((l) => l.width > box.width + SLACK)) return 'wider than its box';
  if (lines.reduce((sum, l) => sum + l.height, 0) > box.height + SLACK) return 'taller than its box';
  return null;
}
