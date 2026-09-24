/**
 * The size a member's name is set at on their file.
 * ─────────────────────────────────────────────────────────────────────────────
 * Three fixed steps, never `adjustsFontSizeToFit`: the same name always
 * renders at the same size, so two members side by side are never set at two
 * sizes for a reason a reader cannot see (the design's own rule — see the
 * profile screen).
 *
 * The step used to be chosen by COUNTING characters. A count cannot see the two
 * things that decide whether a name fits:
 *
 *   · A WORD CANNOT WRAP. A name of many short words can take two lines; a
 *     handle is one word, and a one-word name wider than the column is broken
 *     mid-letter. `TOMASREYES` — ten letters, well under the count — ran 3.6pt
 *     past the column at the largest text size, and a sixteen-letter handle
 *     ran past it at the default size.
 *   · THE COLUMN IS NOT ONE WIDTH. It is the window less the portrait: 238pt on
 *     a 390pt phone, 168pt on a 320pt one.
 *
 * So the count still sets the ceiling, and the step is then lowered — only
 * ever lowered — until the name's longest word fits the column at the size the
 * phone draws, measured from Rye's own letter widths (`ryeAdvances.ts`). Still
 * deterministic: one name, on one phone, at one text setting, has one size.
 *
 * A word that fits no step (a thirty-letter handle with no joint in it) is set
 * at the smallest step and allowed to break: the design chose a break over
 * type shrunk into illegibility.
 */
import { RYE_ADVANCE, RYE_WIDEST } from '@/src/theme/ryeAdvances';
import { s } from './profileStyles';

export const NAME_STEPS = [26, 20, 16] as const;
export type NameStep = (typeof NAME_STEPS)[number];

/** The width the ident row takes before the name's column: its two insets, the print, the gap. */
export const IDENT_INSET =
  (s.identRow.paddingHorizontal as number) * 2 + (s.plate.width as number) + (s.identRow.gap as number);

export const nameSpacing = (size: number) => (size >= 26 ? 1.4 : 1);

/** A word's drawn width: letters at the drawn size, spacing as written (it does not grow — see androidTracking). */
export function wordWidth(word: string, size: number, scale: number): number {
  let em = 0;
  let n = 0;
  for (const ch of word) { em += RYE_ADVANCE[ch] ?? RYE_WIDEST; n++; }
  return em * size * scale + nameSpacing(size) * n;
}

/** The step a (capitalised) name is set at, in a window this wide, at this text scale. */
export function heroNameSize(name: string, windowWidth: number, scale: number): NameStep {
  const byCount: NameStep = name.length <= 16 ? 26 : name.length <= 28 ? 20 : 16;
  const column = windowWidth - IDENT_INSET;
  const words = name.split(/\s+/).filter(Boolean);
  for (const size of NAME_STEPS) {
    if (size > byCount) continue;
    if (words.every((w) => wordWidth(w, size, scale) <= column)) return size;
  }
  return 16;
}
