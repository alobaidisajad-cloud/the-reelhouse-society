/**
 * aTextIsCutWholeOnEveryPage.test.ts — the pages that size or cut a member's words by the characters a
 * reader sees (WORKLIST P4.31), as aTextIsCountedAsItIsSeen counts them: the member file's name, a held
 * change's words, an essay past its limit. Each imports a module that reaches the phone's native side
 * (styles, encrypted storage, linking), so these run in jest alone; the counting itself runs on the
 * phone's Hermes in aTextIsCountedAsItIsSeen.
 */
import { PICTURE_EM } from '@/src/components/lobby/measure';
import { heroNameSize, wordWidth } from '@/src/components/profile/heroNameSize';
import { heldDetail } from '../queueOwnership';
import { capMarkdownForRender } from '../markdownSafety';
import { MAX_LENGTHS } from '../sanitizeInput';

// Written by code point, so no editor or normaliser can quietly change what is tested.
const s = (...cps: number[]) => String.fromCodePoint(...cps);
const FAMILY = s(0x1f469, 0x200d, 0x1f469, 0x200d, 0x1f467, 0x200d, 0x1f466); // 👩‍👩‍👧‍👦, eleven units
/** Twelve marks on a letter, six above and six below: more than any script needs. */
const PILE = s(0x300, 0x301, 0x302, 0x303, 0x304, 0x306, 0x316, 0x317, 0x318, 0x319, 0x31c, 0x31d);
const piled = (word: string) => [...word].map((c) => c + PILE).join('');

describe('a member\'s name on their file', () => {
  it('spaces a word once a character, as the phone draws its letter spacing', () => {
    expect(wordWidth(piled('KANE'), 26, 1)).toBeCloseTo(wordWidth('KANE', 26, 1), 6);
    expect(wordWidth(FAMILY, 26, 1)).toBeCloseTo(PICTURE_EM * 26 + 1.4, 6);
  });

  it('a name of six emoji is set as six characters, at the largest step', () => {
    const run = s(0x1f469, 0x1f3fd, 0x200d, 0x1f3a4) + s(0x1f468, 0x1f3ff, 0x200d, 0x1f680) + s(0x1f469, 0x1f3fb, 0x200d, 0x1f52c)
      + s(0x1f9d1, 0x1f3fe, 0x200d, 0x1f3a8) + s(0x1f468, 0x1f3fc, 0x200d, 0x1f373) + s(0x1f469, 0x1f3ff, 0x200d, 0x1f33e);
    expect(run.length).toBeGreaterThan(28); // by its units, the smallest step
    expect(heroNameSize(run, 390, 1)).toBe(26);
  });

  it('a name with marks piled on it is set as the name itself is', () => {
    expect(heroNameSize(piled('KANE'), 390, 1)).toBe(heroNameSize('KANE', 390, 1));
    expect(heroNameSize(piled('KANE'), 390, 1)).toBe(26);
  });
});

describe('a cut, between characters, on a page', () => {
  it('a held change\'s words are cut at 47 characters a reader counts', () => {
    const words = piled('a'.repeat(60));
    expect(heldDetail({ payload: { body: words } } as never)).toBe(`“${piled('a'.repeat(47))}…”`);
    expect(heldDetail({ payload: { body: piled('short') } } as never)).toBe(`“${piled('short')}”`);
  });

  it('an essay past its limit is drawn to a whole last character', () => {
    const at = MAX_LENGTHS.filingEssay;
    const out = capMarkdownForRender(`${'z'.repeat(at - 3)}${FAMILY}`);
    expect(out).toBe(`${'z'.repeat(at - 3)}\n\n…`);
  });
});
