/**
 * EVERY REFUSAL GOES THROUGH ONE DOOR (WORKLIST P4.14).
 *
 * A write the house will not take is given back by sortRefused alone: a mark lapses, words go
 * back to their box, anything else is held for the member. Each exit of the send that is not
 * delivery once pushed its write to the dead letter itself, and the member's words went with it.
 * This file reads offlineQueue.ts's code: the dead letter is written only by sortRefused and by
 * the copy kept of a salon message held for the rank, and nothing builds a list of failures to
 * write there on the side.
 */
import { readCode } from '@/test-utils/readCode';

const CODE = readCode('src/utils/offlineQueue.ts');

/** The body of a top-level function, from its name to the brace that closes it: it opens at the signature line's last brace. */
function bodyOf(name: string): string {
  const start = CODE.indexOf(`function ${name}(`);
  if (start < 0) return '';
  const open = start + CODE.slice(start, CODE.indexOf('\n', start)).lastIndexOf('{');
  let depth = 0;
  for (let i = open; i < CODE.length; i++) {
    if (CODE[i] === '{') depth++;
    else if (CODE[i] === '}' && --depth === 0) return CODE.slice(start, i + 1);
  }
  return '';
}

const calls = (text: string) => (text.match(/(?<!function )\baddToDeadLetter\(/g) ?? []).length;

it('writes the dead letter from sortRefused, and from the copy of words held for the rank, and nowhere else', () => {
  const sorter = bodyOf('sortRefused');
  expect(calls(sorter)).toBe(1);
  const rankCopy = CODE.slice(CODE.indexOf('held for the rank:') - 400, CODE.indexOf('held for the rank:'));
  expect(calls(rankCopy)).toBe(1);
  expect(calls(CODE)).toBe(2);
});

it('builds no list of failures on the side', () => {
  expect(CODE).not.toMatch(/\bdeadLetterQueue\b/);
});
