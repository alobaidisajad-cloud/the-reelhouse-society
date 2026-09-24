/**
 * A member's name fits the column it is set in — as WORDS, on every phone,
 * at every text size (see heroNameSize.ts).
 */
import { heroNameSize, wordWidth, IDENT_INSET, NAME_STEPS } from '../heroNameSize';
import { RYE_ADVANCE } from '@/src/theme/ryeAdvances';

const PHONE = 390;
const SMALL = 320;
const DISPLAY_CAP = 1.2; // displayTextProps: the name grows no further

describe('the name is set as words, not as a character count', () => {
  it('reads the column from the ident row\'s own styles: two insets, the print, the gap', () => {
    expect(IDENT_INSET).toBe(20 + 20 + 96 + 16);
  });

  it('knows Rye\'s width for every capital and digit a handle can hold', () => {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_') expect(RYE_ADVANCE[ch]).toBeGreaterThan(0.2);
    // and a W is not an I, which is the whole reason a count is not enough
    expect(RYE_ADVANCE.W / RYE_ADVANCE.I).toBeGreaterThan(2);
  });

  it('agrees with the width a browser measured independently', () => {
    // The layout audit measured TOMASREYES at 26pt × 1.2 in the real font: 3.6pt
    // past a 238pt column, i.e. 241.6pt. The table must say the same.
    expect(wordWidth('TOMASREYES', 26, 1.2)).toBeCloseTo(241.6, 0);
  });

  it('a short name keeps the full step', () => {
    expect(heroNameSize('TOMAS', PHONE, 1)).toBe(26);
    expect(heroNameSize('TOMAS', SMALL, DISPLAY_CAP)).toBe(26);
  });

  it('a one-word handle steps down only where it would otherwise break', () => {
    expect(heroNameSize('TOMASREYES', PHONE, 1)).toBe(26);            // fits: unchanged
    expect(heroNameSize('TOMASREYES', PHONE, DISPLAY_CAP)).toBe(20);  // large type: would break at 26
    expect(heroNameSize('TOMASREYES', SMALL, 1)).toBe(20);            // small phone: would break at 26
  });

  it('whatever step it lands on, the longest word fits — wherever any step can hold it', () => {
    const names = ['TOMASREYES', 'WWWWWWWWWWWW', 'MORPHO', 'UG.MB', 'BARTHOLOMEW MAXIMILIAN', 'A_VERY_LONG_HANDLE_29CHARS_XX'];
    for (const name of names) for (const w of [SMALL, 375, PHONE, 430]) for (const k of [1, 1.1, DISPLAY_CAP]) {
      const size = heroNameSize(name, w, k);
      const longest = Math.max(...name.split(' ').map((x) => wordWidth(x, 16, k)));
      if (longest <= w - IDENT_INSET) {
        for (const word of name.split(' ')) expect(wordWidth(word, size, k)).toBeLessThanOrEqual(w - IDENT_INSET);
      } else {
        expect(size).toBe(16); // nothing holds it: the smallest step, and a break
      }
    }
  });

  it('never RAISES a name above what its length allows', () => {
    // 20 characters caps at 20 however wide the phone is
    expect(heroNameSize('ABCDEFGHI JKLMNOPQRS', 1000, 1)).toBe(20);
    expect(heroNameSize('A'.repeat(40), 5000, 1)).toBe(16);
  });

  it('is deterministic: one name, one phone, one setting, one size', () => {
    const a = NAME_STEPS.map(() => heroNameSize('TOMASREYES', 375, 1.1));
    expect(new Set(a).size).toBe(1);
  });
});
