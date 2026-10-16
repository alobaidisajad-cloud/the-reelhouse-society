/**
 * aJoinerIsKeptOnlyWhereItJoins.test.ts — cleanForStorage (utils/sanitizeInput.ts) keeps a zero-width
 * joiner or non-joiner only where it joins: between two letters of a script whose letters join, and
 * (the joiner alone) between the end of one emoji and the start of the next. Held at the first and
 * last code point of every range, and one past each, where nothing joins.
 */
import { cleanForStorage } from '../sanitizeInput';

const ZWNJ = '\u200c';
const ZWJ = '\u200d';
const c = (cp: number) => String.fromCodePoint(cp);
const kept = (text: string) => cleanForStorage(text) === text;

/** Each range of joining letters, by its first and last code point, and a code point outside it on each side. */
const JOINING = [
  { first: 0x0600, last: 0x08ff, before: 0x05ff, after: null },
  { first: 0x0900, last: 0x0dff, before: null, after: 0x0e00 },
  { first: 0x1000, last: 0x109f, before: 0x0fff, after: 0x10a0 },
  { first: 0x1780, last: 0x18af, before: 0x177f, after: 0x18b0 },
  { first: 0xfb50, last: 0xfdff, before: 0xfb4f, after: 0xfe00 },
  { first: 0xfe70, last: 0xfefc, before: 0xfe6f, after: 0xfefd },
];

it('keeps a joiner between two letters of a joining script, at the first and last letter of every range', () => {
  for (const { first, last } of JOINING) {
    for (const j of [ZWNJ, ZWJ]) {
      expect([first.toString(16), kept(`${c(first)}${j}${c(first)}`)]).toEqual([first.toString(16), true]);
      expect([last.toString(16), kept(`${c(last)}${j}${c(last)}`)]).toEqual([last.toString(16), true]);
    }
  }
});

it('takes a joiner out where one side is not a joining letter, one past each range included', () => {
  for (const { first, last, before, after } of JOINING) {
    if (before !== null) {
      expect([before.toString(16), cleanForStorage(`${c(before)}${ZWNJ}${c(first)}`)]).toEqual([before.toString(16), `${c(before)}${c(first)}`]);
    }
    if (after !== null) {
      expect([after.toString(16), cleanForStorage(`${c(last)}${ZWNJ}${c(after)}`)]).toEqual([after.toString(16), `${c(last)}${c(after)}`]);
    }
  }
  expect(cleanForStorage(`م${ZWNJ}a`)).toBe('مa');
  expect(cleanForStorage(`a${ZWNJ}م`)).toBe('aم');
  expect(cleanForStorage(`ab${ZWJ}cd`)).toBe('abcd');
  expect(cleanForStorage(`${ZWNJ}م`)).toBe('م');
});

it('keeps a joiner between two emoji: a surrogate pair\'s halves at their edges, the presentation selector, a symbol', () => {
  // U+10000 is D800 DC00; U+103FF ends in DFFF; U+10FC00 starts DBFF.
  for (const [left, right] of [
    ['\u{1F469}', '\u{1F4BB}'], ['\u{10000}', '\u{10000}'], ['\u{103FF}', '\u{10FC00}'],
    ['❤️', '\u{1F525}'], ['←', '←'], ['⯿', '⯿'], ['\u{1F937}', '♀️'],
  ]) {
    expect([left, right, kept(`${left}${ZWJ}${right}`)]).toEqual([left, right, true]);
  }
});

it('takes a joiner out beside an emoji where the other side is not one, and a non-joiner between emoji', () => {
  expect(cleanForStorage(`↏${ZWJ}←`)).toBe('↏←');
  expect(cleanForStorage(`⯿${ZWJ}Ⰰ`)).toBe('⯿Ⰰ');
  expect(cleanForStorage(`←${ZWJ}↏`)).toBe('←↏');
  expect(cleanForStorage(`Ⰰ${ZWJ}←`)).toBe('Ⰰ←');
  expect(cleanForStorage(`a${ZWJ}\u{1F525}`)).toBe('a\u{1F525}');
  expect(cleanForStorage(`\u{1F525}${ZWJ}a`)).toBe('\u{1F525}a');
  expect(cleanForStorage(`\u{1F469}${ZWNJ}\u{1F4BB}`)).toBe('\u{1F469}\u{1F4BB}');
});

it('takes a joiner out beside the first code unit past the surrogates, which ends and starts no emoji', () => {
  expect(cleanForStorage(`${ZWJ}\u{1F525}`)).toBe('\u{1F525}');
  expect(cleanForStorage(`\u{1F525}${ZWJ}`)).toBe('\u{1F525}');
});
