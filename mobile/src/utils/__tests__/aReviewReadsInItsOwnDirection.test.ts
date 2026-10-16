/**
 * aReviewReadsInItsOwnDirection.test.ts — isRTLText (utils/text.ts): a paragraph's direction is its
 * first strong character's, neutrals skipped, within the first 400 characters; and RTL_MARK, the
 * mark that turns a paragraph opening with a Latin label right-to-left, is the strongly
 * right-to-left one.
 */
import { isRTLText, RTL_MARK } from '../text';

it('reads right-to-left a text whose first strong character is Hebrew, Arabic or another such script', () => {
  expect(isRTLText('שלום')).toBe(true);
  expect(isRTLText('مرحبا')).toBe(true);
  expect(isRTLText('\u{10900}')).toBe(true); // Phoenician
  expect(isRTLText('\u{1E900}')).toBe(true); // Adlam
});

it('reads it by the first strong character, whatever follows', () => {
  expect(isRTLText('שלום, hello')).toBe(true);
  expect(isRTLText('hello, שלום')).toBe(false);
  expect(isRTLText('« 1999 — مرحبا » then English')).toBe(true);
  expect(isRTLText('« 1999 — Bonjour » then מילים')).toBe(false);
});

it('reads left-to-right a text with no right-to-left letter, and nothing at all', () => {
  expect(isRTLText('hello')).toBe(false);
  expect(isRTLText('1999 — « » …')).toBe(false);
  expect(isRTLText('')).toBe(false);
  expect(isRTLText(null)).toBe(false);
  expect(isRTLText(undefined)).toBe(false);
});

it('decides within the first 400 characters: a letter after them comes too late', () => {
  expect(isRTLText(`${' '.repeat(399)}ש`)).toBe(true);
  expect(isRTLText(`${' '.repeat(400)}ש`)).toBe(false);
});

it('marks a paragraph right-to-left with U+200F, invisible and strongly right-to-left', () => {
  expect(RTL_MARK).toBe('\u200f');
  expect(RTL_MARK).toHaveLength(1);
});
