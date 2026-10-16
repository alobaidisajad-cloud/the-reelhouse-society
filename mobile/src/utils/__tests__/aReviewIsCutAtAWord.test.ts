/**
 * aReviewIsCutAtAWord.test.ts — truncateReview (utils/text.ts), the cut every share card makes: a
 * review that fits is kept whole, trimmed; a longer one is cut at its last word before the limit
 * (unless that word ends within the first 40 characters), with nothing left trailing, and an
 * ellipsis. And extractDropCap, given nothing, raises nothing.
 */
import { extractDropCap, truncateReview } from '../text';

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${String(i).padStart(3, '0')}`).join(' ');

it('keeps a review that fits whole, its ends trimmed, up to the limit itself', () => {
  expect(truncateReview('  a short review  ')).toBe('a short review');
  const exact = 'x'.repeat(350);
  expect(truncateReview(exact)).toBe(exact);
  expect(truncateReview(`${'y'.repeat(9)}`, 9)).toBe('y'.repeat(9));
});

it('gives nothing for nothing', () => {
  expect(truncateReview('')).toBe('');
  expect(truncateReview(null as unknown as string)).toBe('');
  expect(truncateReview(undefined as unknown as string)).toBe('');
});

it('cuts a longer review at the last space before the limit, and marks the cut', () => {
  const text = words(100); // "w000 w001 …", each word four letters and a space
  const cut = truncateReview(text, 52);
  expect(cut).toBe(`${text.slice(0, 49)}…`);
  expect(cut.endsWith(' …')).toBe(false);
});

it('cuts at the limit itself when the last space comes within the first 40 characters, or there is none', () => {
  const early = `${'a'.repeat(40)} ${'b'.repeat(400)}`; // its only space at 40
  expect(truncateReview(early, 100)).toBe(`${early.slice(0, 100)}…`);
  const later = `${'a'.repeat(41)} ${'b'.repeat(400)}`; // its only space at 41
  expect(truncateReview(later, 100)).toBe(`${'a'.repeat(41)}…`);
  expect(truncateReview('c'.repeat(400), 100)).toBe(`${'c'.repeat(100)}…`);
});

it('leaves no space trailing before the mark, and keeps the review\'s own start', () => {
  const text = `  start ${'d'.repeat(50)}   ${'e'.repeat(400)}`;
  expect(truncateReview(text, 100)).toBe(`start ${'d'.repeat(50)}…`);
});

it('raises no letter from nothing, and keeps nothing as nothing', () => {
  expect(extractDropCap(null as unknown as string)).toEqual({ first: '', rest: '' });
  expect(extractDropCap(undefined as unknown as string)).toEqual({ first: '', rest: '' });
  expect(extractDropCap('')).toEqual({ first: '', rest: '' });
});
