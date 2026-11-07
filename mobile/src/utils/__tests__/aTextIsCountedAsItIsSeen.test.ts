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
import { wrapLetters } from '@/src/components/feed/frame/planReview';
import { excerptFor } from '@/src/components/dispatch/excerpt';
import { clipToSentence } from '@/src/components/dispatch/paper/paperText';

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
});
