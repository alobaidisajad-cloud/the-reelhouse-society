/**
 * anExcerptNeverEndsInHalfAnEmoji.test.ts — the replacement mark at the cut.
 * ─────────────────────────────────────────────────────────────────────────────
 * `truncateReview` cuts a long review down for a card. It preferred a word
 * boundary, and fell back to the raw index when there was no space to cut at.
 *
 * That fallback is not the exotic path it looks like. The word-boundary branch
 * only applies when there IS a space in the first 350 characters — and a review
 * written in Chinese or Japanese has none, so those reviews took the raw index
 * every time. `slice` counts UTF-16 units, so the cut could land BETWEEN the
 * two halves of an astral character and leave a lone high surrogate, which
 * renders as a replacement mark at the end of the excerpt.
 *
 * sanitizeInput's cleanForStorage already carries this guard, with the note
 * that an unpaired surrogate also makes PostgreSQL refuse the whole request.
 * This is its display-side twin, and it was missing.
 */
import { truncateReview } from '../text';

/** A lone high surrogate is D800–DBFF with nothing following it. */
const endsInLoneSurrogate = (s: string): boolean => {
  if (s.length === 0) return false;
  const last = s.charCodeAt(s.length - 1);
  return last >= 0xd800 && last <= 0xdbff;
};

describe('an excerpt never ends in half a character', () => {
  it('does not split an emoji when there is no space to cut at', () => {
    // No spaces anywhere — the CJK case — with emoji straddling the boundary.
    // Every offset is tried so the test does not depend on one lucky alignment.
    const broken: number[] = [];
    for (let pad = 0; pad < 8; pad += 1) {
      const text = '観'.repeat(340 + pad) + '🎬'.repeat(40);
      const out = truncateReview(text);
      // The ellipsis is appended, so check the body before it.
      if (endsInLoneSurrogate(out.slice(0, -1))) broken.push(pad);
    }
    expect(broken).toEqual([]);
  });

  it('the UNGUARDED cut really did leave one — this is not hypothetical', () => {
    // What the code did before, reproduced: slice at the raw index.
    const text = '観'.repeat(349) + '🎬';
    const naive = text.slice(0, 350);
    expect(endsInLoneSurrogate(naive)).toBe(true);
  });

  it('still prefers a word boundary when prose has one', () => {
    const words = 'the quick brown fox '.repeat(40); // well over 350, spaces throughout
    const out = truncateReview(words);
    // Cut at a space, so the body has no trailing partial word.
    expect(out.endsWith('…')).toBe(true);
    expect(out.slice(0, -1).endsWith(' ')).toBe(false);
  });

  it('leaves a short review completely alone', () => {
    expect(truncateReview('A quiet, exact little film.')).toBe('A quiet, exact little film.');
  });

  it('keeps a WHOLE emoji that fits — it does not trim for safety', () => {
    // Dropping the pair when it fits would lose a character the member wrote.
    const text = '🎬'.repeat(200); // 400 UTF-16 units, 200 code points
    const out = truncateReview(text);
    expect(endsInLoneSurrogate(out.slice(0, -1))).toBe(false);
    expect(out.length).toBeGreaterThan(300);
  });
});
