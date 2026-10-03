/**
 * readCode — a source file as CODE, for the tests whose contract is the source.
 *
 * Some tests read a file's text because the text is the rule: "nothing but
 * this module talks to that table", "no screen imports the old component".
 * Those tests each carried their own comment stripper — a regex, copied
 * sixty-seven times — and a regex cannot tell a comment from a string:
 * `'https://…'` lost everything after its `//`, and a comment that merely
 * MENTIONED a banned name failed a test meant to read code. stripComments
 * parses the file with TypeScript and removes exactly the comments the parser
 * found between tokens — never a `//` inside a string, a regex, a template or
 * JSX text. It lives in stripComments.js so the node tools use the same one;
 * oneCommentStripper.test.ts keeps it the only one.
 *
 * A test that checks BEHAVIOUR should render the thing and look at it instead.
 * This is for when the source itself is the contract — and every test that
 * reads source says why in test-utils/SOURCE-READING-TESTS.md, which a test
 * keeps complete.
 *
 *   readCode('src/stores/auth.ts')          // relative to mobile/
 *   stripComments(text, fileName)           // the same, for text in hand
 */
import { readFileSync } from 'fs';
import { isAbsolute, join } from 'path';
import { stripComments } from './stripComments';

export { stripComments };

export const MOBILE = join(__dirname, '..');

/** A file under mobile/ (or an absolute path), as code: its comments blanked. */
export function readCode(file: string): string {
  const path = isAbsolute(file) ? file : join(MOBILE, file);
  return stripComments(readFileSync(path, 'utf8'), path);
}
