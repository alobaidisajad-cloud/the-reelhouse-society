/**
 * aTextIsCountedAsItIsSeen.test.ts — a member's words are counted, measured and cut as a reader
 * sees them, character by character, never by code units (WORKLIST P4.31).
 *
 * A string's length counts code units: a family of four is eleven, an accent written after its
 * letter is one more, a letter with marks piled on it a dozen more. Sized by that, a name of
 * emoji was set at the smallest step and a review with piled marks planned three times its
 * lines; cut by it, an essay, an excerpt or a search line could end on half an emoji, and the
 * excerpt is stored so.
 */
import { charactersOf, characterCount, cutWhole, firstCharacters, isPictureCharacter } from '../text';
import { emOf, PICTURE_EM } from '@/src/components/lobby/measure';
import { heroNameSize, wordWidth } from '@/src/components/profile/heroNameSize';
import { wrapLetters } from '@/src/components/feed/frame/planReview';
import { excerptFor } from '@/src/components/dispatch/excerpt';
import { clipToSentence } from '@/src/components/dispatch/paper/paperText';
import { heldDetail } from '../queueOwnership';
import { capMarkdownForRender } from '../markdownSafety';
import { MAX_LENGTHS } from '../sanitizeInput';

// Written by code point, so no editor or normaliser can quietly change what is tested.
const s = (...cps: number[]) => String.fromCodePoint(...cps);
const FAMILY = s(0x1f469, 0x200d, 0x1f469, 0x200d, 0x1f467, 0x200d, 0x1f466); // 👩‍👩‍👧‍👦, eleven units
const FLAG = s(0x1f1ef, 0x1f1f5); // 🇯🇵
const WAVE = s(0x1f44b, 0x1f3fd); // 👋🏽
const FILM = s(0x1f39e, 0xfe0f); // 🎞️
/** Twelve marks on a letter, six above and six below: more than any script needs. */
const PILE = s(0x300, 0x301, 0x302, 0x303, 0x304, 0x306, 0x316, 0x317, 0x318, 0x319, 0x31c, 0x31d);
const piled = (word: string) => [...word].map((c) => c + PILE).join('');
const E_ACUTE = s(0x65, 0x301); // é, its accent written after

describe('the characters a reader sees', () => {
  it('are each letter with its marks, each emoji sequence and each flag, whole', () => {
    expect(charactersOf(`a${FAMILY}${E_ACUTE}${FLAG}${WAVE}`)).toEqual(['a', FAMILY, E_ACUTE, FLAG, WAVE]);
    expect(charactersOf(piled('Kane'))).toEqual([...'Kane'].map((c) => c + PILE));
    expect(charactersOf('')).toEqual([]);
    expect(charactersOf(null)).toEqual([]);
  });

  it('are counted as drawn, not by the units a string holds', () => {
    expect([FAMILY.length, characterCount(FAMILY)]).toEqual([11, 1]);
    expect([piled('Kane').length, characterCount(piled('Kane'))]).toEqual([52, 4]);
    expect(characterCount(`${FLAG}${FLAG}${FILM}`)).toBe(3);
    expect(characterCount(undefined)).toBe(0);
  });

  it('are taken whole from the front, n of them', () => {
    expect(firstCharacters(`${FAMILY}${E_ACUTE}xyz`, 2)).toBe(`${FAMILY}${E_ACUTE}`);
    expect(firstCharacters('ab', 5)).toBe('ab');
    expect(firstCharacters('ab', 0)).toBe('');
  });

  it('are cut to a column\'s limit only between them', () => {
    expect(cutWhole(`abc${FAMILY}`, 5)).toBe('abc'); // the limit falls inside the family
    expect(cutWhole(`abc${FAMILY}`, 14)).toBe(`abc${FAMILY}`);
    expect(cutWhole('abcdef', 3)).toBe('abc');
  });

  it('are pictures when the phone draws them with its emoji face, letters otherwise', () => {
    for (const ch of [FAMILY, FLAG, WAVE, FILM, s(0x1f525)]) expect([ch, isPictureCharacter(ch)]).toEqual([ch, true]);
    for (const ch of ['K', E_ACUTE, s(0xa9), s(0x2713), '字', s(0x0915, 0x093f)]) expect([ch, isPictureCharacter(ch)]).toEqual([ch, false]);
    expect(isPictureCharacter(s(0x2764, 0xfe0f))).toBe(true); // ❤️, its picture form asked for
  });
});

describe('a width, measured', () => {
  it('gives a mark no width of its own: a letter with marks piled on it is the letter', () => {
    expect(emOf(piled('Kane'), 'rye')).toBeCloseTo(emOf('Kane', 'rye'), 6);
    expect(emOf(E_ACUTE, 'rye')).toBeCloseTo(emOf('e', 'rye'), 6);
    expect(emOf('e', 'rye')).toBeGreaterThan(0);
  });

  it('gives an emoji its own face\'s width, a whole sequence once', () => {
    expect(emOf(FAMILY, 'rye')).toBeCloseTo(PICTURE_EM, 6);
    expect(emOf(`${FLAG}${WAVE}`, 'rye')).toBeCloseTo(2 * PICTURE_EM, 6);
  });

  it('spaces a word once a character, as the phone draws its letter spacing', () => {
    expect(wordWidth(piled('KANE'), 26, 1)).toBeCloseTo(wordWidth('KANE', 26, 1), 6);
    expect(wordWidth(FAMILY, 26, 1)).toBeCloseTo(PICTURE_EM * 26 + 1.4, 6);
  });
});

describe('a member\'s name on their file', () => {
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

describe('a review, planned in lines', () => {
  it('breaks a word with piled marks by its letters, not its units', () => {
    expect(wrapLetters(piled('frames'), () => 10)).toEqual([piled('frames')]);
    expect(wrapLetters(`${piled('ozu')} ${piled('frames')}`, () => 10)).toEqual([`${piled('ozu')} ${piled('frames')}`]);
  });

  it('gives an emoji two letters of room, and never splits one', () => {
    expect(wrapLetters(`ab ${FAMILY}${FAMILY}`, () => 4)).toEqual(['ab', `${FAMILY}${FAMILY}`]);
    expect(wrapLetters(`${FAMILY}${FAMILY}${FAMILY}`, () => 3)).toEqual([FAMILY, FAMILY, FAMILY]);
  });
});

describe('a cut, between characters', () => {
  it('a stored excerpt never ends on half an emoji', () => {
    const out = excerptFor(`${'x'.repeat(148)}${FAMILY} and more words after it all`, 150);
    expect(out).toBe(`${'x'.repeat(148)}…`); // not the family's first woman alone
  });

  it('a card\'s opening, cut in one long word, keeps every character whole', () => {
    // The limit falls between the hand and its tone: the hand goes with it, never bare.
    expect(clipToSentence(`${'y'.repeat(98)}${WAVE}${'y'.repeat(40)}`, 100)).toEqual({ text: `${'y'.repeat(98)}…`, clipped: true });
  });

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
