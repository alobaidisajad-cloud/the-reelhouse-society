/**
 * aCharacterIsNeverCut.test.ts — every place the app cuts text cuts between
 * characters, never inside one.
 *
 * Three cuts counted code units: the sanitiser's length cap, a share card's
 * excerpt (truncateReview), and the drop cap on a phone (Hermes has no
 * Intl.Segmenter, so it took one code point). Each could split a joined emoji
 * or a skin tone; the cap and the excerpt mended only a lone surrogate half.
 */
import { characterStart, extractDropCap, isCharacterBoundary, truncateReview } from '../text';
import { MAX_LENGTHS, sanitizeInput } from '../sanitizeInput';

const s = (...cps: number[]) => String.fromCodePoint(...cps);
const TECHNOLOGIST = s(0x1f469, 0x200d, 0x1f4bb);
const THUMB_TONED = s(0x1f44d, 0x1f3fd);
const IRAQ = s(0x1f1ee, 0x1f1f6);
const USA = s(0x1f1fa, 0x1f1f8);

describe('the boundary', () => {
  it('is never inside a joined emoji, a skin tone, a surrogate pair, or a flag', () => {
    expect(isCharacterBoundary(TECHNOLOGIST, 1)).toBe(false); // between the halves of 👩
    expect(isCharacterBoundary(TECHNOLOGIST, 2)).toBe(false); // before the joiner
    expect(isCharacterBoundary(TECHNOLOGIST, 3)).toBe(false); // after the joiner
    expect(isCharacterBoundary(THUMB_TONED, 2)).toBe(false);
    expect(isCharacterBoundary(IRAQ, 2)).toBe(false);
  });

  it('is between two flags, and between two plain emoji', () => {
    expect(isCharacterBoundary(IRAQ + USA, 4)).toBe(true);
    expect(isCharacterBoundary(IRAQ + USA, 2)).toBe(false);
    expect(isCharacterBoundary(s(0x1f525, 0x1f525), 2)).toBe(true);
  });

  it('steps back to the start of the character a cut fell in', () => {
    const text = `ab${TECHNOLOGIST}`;
    for (let at = 3; at < text.length; at += 1) expect(characterStart(text, at)).toBe(2);
    expect(characterStart(text, text.length)).toBe(text.length);
  });
});

describe('the cuts', () => {
  it('the sanitiser caps a field without breaking its last emoji', () => {
    const max = MAX_LENGTHS.bio;
    const text = 'x'.repeat(max - 3) + TECHNOLOGIST; // the cap falls inside the emoji
    const out = sanitizeInput(text, 'bio');
    expect(out).toBe('x'.repeat(max - 3));
    expect(out.length).toBeLessThanOrEqual(max);
  });

  it('a share card’s excerpt ends between characters', () => {
    const text = '字'.repeat(349) + THUMB_TONED + '字'.repeat(10); // no space: the raw index is used
    const out = truncateReview(text, 350);
    expect(out).toBe('字'.repeat(349) + '…');
  });

  it('the drop cap on a phone takes the whole first character', () => {
    const intl = globalThis.Intl as { Segmenter?: unknown };
    const segmenter = intl.Segmenter;
    delete intl.Segmenter;
    try {
      expect(extractDropCap(`${TECHNOLOGIST} saw it twice`)).toEqual({ first: TECHNOLOGIST, rest: ' saw it twice' });
      expect(extractDropCap(`${IRAQ}${USA} both`)).toEqual({ first: IRAQ, rest: `${USA} both` });
      expect(extractDropCap('Remarkable.')).toEqual({ first: 'R', rest: 'emarkable.' });
    } finally {
      intl.Segmenter = segmenter;
    }
  });
});
