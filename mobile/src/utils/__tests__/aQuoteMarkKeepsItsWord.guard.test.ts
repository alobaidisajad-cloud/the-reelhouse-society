/**
 * aQuoteMarkKeepsItsWord.guard.test.ts — a guillemet is never left alone on a line.
 *
 * « and » set apart from their words by an ordinary space give the line a place to break between
 * the mark and the word: when the words just fill a line, the closing » drops to a line of its own
 * (the member file's bio did, on every window wide enough to set it in one line). The marks are
 * OPEN_QUOTE and CLOSE_QUOTE (utils/text), each held to its word by a no-break space; a mark beside
 * an ordinary space anywhere in the app's code is the old way back.
 */
import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { files } from '@/test-utils/universe';
import { OPEN_QUOTE, CLOSE_QUOTE } from '@/src/utils/text';

const MOBILE = join(__dirname, '..', '..', '..');
const rel = (f: string) => relative(MOBILE, f).split('\\').join('/');

/** Each line of code that sets a guillemet apart from its word by a space a line may break at (a comment's prose may name the marks). */
export function marksSetApart(text: string): number[] {
  return text.split('\n').flatMap((line, i) => (!/^\s*(\*|\/\/|\/\*)/.test(line) && /« |[ \t]»/.test(line) ? [i + 1] : []));
}

it('holds every guillemet in the app to its word', () => {
  const apart = files('appCode', { ext: ['.ts', '.tsx'] })
    .filter((f) => !/__tests__/.test(f))
    .flatMap((f) => marksSetApart(readFileSync(f, 'utf8')).map((line) => `${rel(f)}:${line}`));
  expect(apart).toEqual([]);
});

it('binds each mark with a space no line breaks at', () => {
  expect([OPEN_QUOTE, CLOSE_QUOTE]).toEqual(['«\u00A0', '\u00A0»']);
});

it('says NO to a mark set apart by a space, and nothing to one held or one alone', () => {
  expect(marksSetApart('<Text>« {quote} »</Text>')).toEqual([1]);
  expect(marksSetApart('ok\n<Text>{quote} »</Text>')).toEqual([2]);
  expect(marksSetApart(`<Text>{OPEN_QUOTE}{quote}{CLOSE_QUOTE}</Text>\nconst TRAILING = '»”';\n/^[«“]/\n * opens with « or a year\n// « kept »`)).toEqual([]);
});
