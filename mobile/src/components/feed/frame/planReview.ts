/**
 * A review's lines in the Reel's frame, planned before they are drawn.
 * ─────────────────────────────────────────────────────────────────────
 * The review is set in Courier Prime, whose every letter is one width (0.6 of its size, read
 * from the house's own table): how many letters a line holds is arithmetic, so the frame breaks
 * the lines itself, draws each as it planned it, and knows whether words were left out. READ ON
 * stands only then, with how many words the whole review holds. No layout is waited for: a line
 * measured after it is drawn is a frame late, and near its edge it is told wrong.
 *
 * Under a drop cap the first two lines are shorter by the cap's width. Words wider than a line
 * are broken as the phone would break them, by letters. A paragraph break starts a new line.
 */
import { emOf } from '@/src/components/lobby/measure';
import { characterEnd, characterStart, extractDropCap } from '@/src/utils/text';

/** The review's type in the frame: its size, its line, and the width of one of its letters. */
export const REVIEW = { size: 13.5, line: 20 } as const;
export const COURIER_ADVANCE = emOf('M', 'courierItalic');
/** The drop cap: Rye, two lines tall, and the room after it. */
export const DROP_CAP = { size: 39, line: 35, gap: 6, lines: 2 } as const;

export interface PlannedReview {
  /** The raised initial: the whole first letter and any short mark opening it ('' for none). */
  cap: string;
  /** Lines beside the drop cap (none without one). */
  beside: string[];
  /** The lines under it, or all of them. */
  under: string[];
  /** Words were left out: READ ON stands. */
  cut: boolean;
  /** Every word the review holds. */
  words: number;
}

const wordsOf = (text: string) => text.trim().split(/\s+/).filter(Boolean);

/** Breaks `text` into lines of at most `room(i)` letters, as a phone breaks them: a word by whole letters. */
export function wrapLetters(text: string, room: (line: number) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    let line = '';
    for (let word of wordsOf(paragraph)) {
      while (word.length > room(lines.length) && room(lines.length) > 0) {
        if (line) { lines.push(line); line = ''; }
        // Never inside a letter: a mark stays on its letter, a pair of code units together.
        const fits = characterStart(word, room(lines.length));
        const at = fits > 0 ? fits : characterEnd(word, 0);
        lines.push(word.slice(0, at));
        word = word.slice(at);
      }
      if (!word) continue;
      const joined = line ? `${line} ${word}` : word;
      if (joined.length <= room(lines.length)) line = joined;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * The review planned for a frame `width` points wide at the member's text `scale`, shown in
 * `limit` lines at most, its first letter dropped when `dropCap` (the caller passes it only for
 * left-to-right writing: a joined script's first letter cannot be lifted out). The initial is the
 * record's own (extractDropCap): the whole first letter, as a capital, with a short opening mark.
 */
export function planReview(text: string, { width, scale, limit, dropCap }: { width: number; scale: number; limit: number; dropCap: boolean }): PlannedReview {
  const letter = REVIEW.size * scale * COURIER_ADVANCE;
  const full = Math.max(1, Math.floor(width / letter));
  const { first: cap, rest } = dropCap ? extractDropCap(text.trim()) : { first: '', rest: text };
  const lifted = cap.length > 0;
  // The initial is never grown (allowFontScaling false): its width is the same at every setting.
  const capWidth = lifted ? emOf(cap, 'rye') * DROP_CAP.size + DROP_CAP.gap : 0;
  const beside = lifted ? Math.max(1, Math.floor((width - capWidth) / letter)) : full;
  const lines = wrapLetters(lifted ? rest : text, (i) => (lifted && i < DROP_CAP.lines ? beside : full));
  const shown = lines.slice(0, limit);
  const cut = lines.length > limit;
  const last = shown[shown.length - 1];
  if (cut && last !== undefined) {
    // The last line shown ends in an ellipsis, and keeps room for it.
    const room = lifted && shown.length <= DROP_CAP.lines ? beside : full;
    shown[shown.length - 1] = `${last.length + 1 > room ? last.slice(0, room - 1).trimEnd() : last}…`;
  }
  const besideCount = lifted ? Math.min(DROP_CAP.lines, shown.length) : 0;
  return { cap, beside: shown.slice(0, besideCount), under: shown.slice(besideCount), cut, words: wordsOf(text).length };
}
