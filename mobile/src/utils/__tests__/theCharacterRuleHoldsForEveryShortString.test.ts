/**
 * theCharacterRuleHoldsForEveryShortString.test.ts — the app's character rule (utils/text.ts) is
 * Unicode's for EVERY string of up to four characters drawn from one code point of each break
 * class, and the code units at the edges of what the rule tests: the surrogate ranges' first and
 * last, a lone half of a pair, U+FFFF. Random strings meet a prepended flag or a conjunct with a mark
 * inside it too rarely to hold the rule there; every short string meets each.
 *
 * Unicode's answer is Node's own segmenter's. Each string is asked at every place
 * (isCharacterBoundary) and walked character by character (characterEnd), and the walk must end
 * exactly at the string's end.
 */
import { characterEnd, characterStart, firstCharacter, initialOf, isCharacterBoundary } from '../text';

const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
const unicodeCuts = (text: string) => [...seg.segment(text)].map((x) => x.index).filter((i) => i > 0);

/** One of each break class, and the code units at the edges of the rule's own tests. */
const ALPHABET = {
  other: 'a',
  cr: '\r',
  lf: '\n',
  control: '\u0007',
  extend: '́', // combining acute
  zwj: '\u200d',
  ri: '\u{1F1FA}', // regional indicator U
  prepend: '\u0600', // Arabic number sign
  spacingMark: 'ः', // Devanagari visarga
  l: 'ᄀ',
  v: 'ᅡ',
  t: 'ᆨ',
  lv: '가',
  lvt: '각',
  pictograph: '\u{1F642}',
  consonant: 'क', // Devanagari KA
  linker: '्', // Devanagari virama
  extendOnly: '़', // Devanagari nukta
  loneHigh: '\uD800',
  loneLow: '\uDFFF',
  belowSurrogates: '퟿',
  aboveSurrogates: '',
  lastUnit: '￿',
  firstAstral: '\u{10000}',
  lastAstral: '\u{10FFFF}',
};
const LETTERS = Object.values(ALPHABET);

/** Every string of `n` letters. */
function* strings(n: number): Generator<string> {
  if (n === 0) { yield ''; return; }
  for (const head of strings(n - 1)) for (const l of LETTERS) yield head + l;
}

/** Where the app cuts: asked at each place, walked character by character; each failure in words. */
function disagreement(text: string): string | null {
  const want = unicodeCuts(text).join();
  const asked: number[] = [];
  for (let i = 1; i < text.length; i += 1) if (isCharacterBoundary(text, i)) asked.push(i);
  if (asked.join() !== want) return `asked: ${asked.join()} ≠ ${want}`;
  const walked: number[] = [];
  let at = 0;
  for (let guard = 0; at < text.length && guard <= text.length; guard += 1) {
    const end = characterEnd(text, at);
    if (end <= at || end > text.length) return `walked from ${at} to ${end}`;
    at = end;
    if (at < text.length) walked.push(at);
  }
  if (at !== text.length) return `the walk ended at ${at}, not ${text.length}`;
  if (walked.join() !== want) return `walked: ${walked.join()} ≠ ${want}`;
  return null;
}

const show = (text: string) => [...text].map((c) => `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase()}`).join(' ');

it.each([1, 2, 3, 4])('cuts every string of %i characters where Unicode does, asked or walked', (n) => {
  // Ten disagreements say what is wrong; the walk stops there, so a broken rule fails at once.
  const wrong: string[] = [];
  for (const text of strings(n)) {
    const why = disagreement(text);
    if (why) wrong.push(`${show(text)}: ${why}`);
    if (wrong.length === 10) break;
  }
  expect(wrong).toEqual([]);
});

it('a place before the first character or after the last is always a boundary, whatever stands there', () => {
  for (const l of LETTERS) {
    for (const text of [l, `${l}${ALPHABET.extend}`, `${ALPHABET.prepend}${l}`]) {
      expect([show(text), isCharacterBoundary(text, 0), isCharacterBoundary(text, text.length)]).toEqual([show(text), true, true]);
    }
  }
});

it('a character starting at the end, or past it, ends there', () => {
  expect(characterEnd('ab', 2)).toBe(2);
  expect(characterEnd('ab', 5)).toBe(2);
  expect(characterEnd(ALPHABET.prepend, 0)).toBe(1);
  expect(characterEnd(`a${ALPHABET.lastUnit}`, 1)).toBe(2);
  expect(characterEnd(`${ALPHABET.lastUnit}a`, 0)).toBe(1);
});

it('steps back to the start of the character a place falls in, never before the text', () => {
  const thumb = '\u{1F44D}\u{1F3FD}';
  expect(characterStart(`x${thumb}`, 2)).toBe(1);
  expect(characterStart(`x${thumb}`, 99)).toBe(5);
  expect(characterStart(`x${thumb}`, -3)).toBe(0);
});

it('takes the whole first character, of nothing too', () => {
  expect(firstCharacter(null)).toBe('');
  expect(firstCharacter(undefined)).toBe('');
  expect(firstCharacter(`${ALPHABET.prepend}${ALPHABET.ri}${ALPHABET.ri}x`)).toBe(`${ALPHABET.prepend}${ALPHABET.ri}${ALPHABET.ri}`);
});

it('raises a capital as an initial, but never Georgian\'s, to the edges of its letters', () => {
  // U+10CF lies before Georgian's everyday letters, U+10D0 and U+10FF are its first and last, U+1100 is after them.
  expect(initialOf('჏')).toBe('჏'.toUpperCase());
  expect(initialOf('ა')).toBe('ა');
  expect(initialOf('ჿ')).toBe('ჿ');
  expect(initialOf('ჰ')).toBe('ჰ');
  expect(initialOf('ç')).toBe('Ç');
  expect(initialOf('ß')).toBe('ß');
  expect(initialOf('  émile')).toBe('É');
  expect(initialOf(null)).toBe('');
});
