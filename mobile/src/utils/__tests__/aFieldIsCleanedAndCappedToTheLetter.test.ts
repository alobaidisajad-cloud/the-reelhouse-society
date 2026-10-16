/**
 * aFieldIsCleanedAndCappedToTheLetter.test.ts — utils/sanitizeInput.ts at its edges: every line and
 * paragraph separator written as the break it is, blank lines and runs of spaces collapsed exactly,
 * nothing for nothing, and a field over, at and under its cap counted as the store will hold it.
 */
import { cleanForStorage, isOverLimit, MAX_LENGTHS, remainingChars, sanitizeInput } from '../sanitizeInput';

it('writes every line and paragraph separator as the break it is, not the first alone', () => {
  expect(cleanForStorage('one\u2028two\u2028three')).toBe('one\ntwo\nthree');
  expect(cleanForStorage('one\u2029two\u2029three')).toBe('one\n\ntwo\n\nthree');
});

it('keeps at most three blank lines in a row, and makes a run of ten spaces two', () => {
  expect(cleanForStorage('a\n\n\n\n\nb')).toBe('a\n\n\nb');
  expect(cleanForStorage('a\n\n\nb')).toBe('a\n\n\nb');
  expect(cleanForStorage(`a${' '.repeat(10)}b`)).toBe('a  b');
  expect(cleanForStorage(`a${' '.repeat(9)}b`)).toBe(`a${' '.repeat(9)}b`);
  expect(cleanForStorage(`a${'\t'.repeat(12)}b`)).toBe('a  b');
});

it('gives nothing for nothing', () => {
  expect(cleanForStorage(null as unknown as string)).toBe('');
  expect(sanitizeInput(null as unknown as string, 'bio')).toBe('');
  expect(sanitizeInput(undefined as unknown as string, 'bio')).toBe('');
  expect(isOverLimit(null as unknown as string, 'bio')).toBe(false);
  expect(remainingChars(null as unknown as string, 'bio')).toBe(MAX_LENGTHS.bio);
  expect(remainingChars(undefined as unknown as string, 'bio')).toBe(MAX_LENGTHS.bio);
});

it('counts a field at its cap as within it, and one character more as over', () => {
  const at = 'x'.repeat(MAX_LENGTHS.bio);
  expect(isOverLimit(at, 'bio')).toBe(false);
  expect(remainingChars(at, 'bio')).toBe(0);
  expect(sanitizeInput(at, 'bio')).toBe(at);
  expect(isOverLimit(`${at}y`, 'bio')).toBe(true);
  expect(remainingChars(`${at}y`, 'bio')).toBe(-1);
  expect(sanitizeInput(`${at}y`, 'bio')).toBe(at);
});

it('counts what is stored, not what was typed: invisible characters and edges cost nothing', () => {
  const at = 'x'.repeat(MAX_LENGTHS.bio);
  expect(isOverLimit(`  ${at}\u200b\u202e  `, 'bio')).toBe(false);
  expect(remainingChars('\u200b\u200bab', 'bio')).toBe(MAX_LENGTHS.bio - 2);
});
