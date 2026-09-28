/**
 * readCode — a source file as CODE, for the tests whose contract is the source.
 *
 * Some tests read a file's text because the text is the rule: "nothing but
 * this module talks to that table", "no screen imports the old component".
 * Those tests each carried their own `stripComments` — a regex, copied seven
 * times — and a regex cannot tell a comment from a string: `'https://…'` lost
 * everything after its `//`, and a comment that merely MENTIONED a banned name
 * failed a test meant to read code. This parses the file with TypeScript and
 * removes exactly the comments the parser found between tokens — never a `//`
 * inside a string, a regex, a template or JSX text.
 *
 * A test that checks BEHAVIOUR should render the thing and look at it instead.
 * This is for when the source itself is the contract — and every test that
 * reads source says why in test-utils/SOURCE-READING-TESTS.md, which a test
 * keeps complete.
 *
 *   readCode('src/stores/auth.ts')          // relative to mobile/
 *   stripComments(someSourceText, 'x.ts')   // the same, for text in hand
 */
import { readFileSync } from 'fs';
import { isAbsolute, join } from 'path';
import ts from 'typescript';

export const MOBILE = join(__dirname, '..');

const KIND: Record<string, ts.ScriptKind> = { ts: ts.ScriptKind.TS, tsx: ts.ScriptKind.TSX, js: ts.ScriptKind.JS, jsx: ts.ScriptKind.JSX, mjs: ts.ScriptKind.JS, cjs: ts.ScriptKind.JS };

/**
 * The text with every comment removed. A comment is replaced by blanks of the
 * same shape — its line breaks kept, everything else a space — so positions and
 * line numbers still match the file, and `a/*x*\/b` never becomes `ab`.
 */
export function stripComments(text: string, file = 'x.tsx'): string {
  const ext = (/\.([a-z]+)$/.exec(file)?.[1] ?? 'tsx').toLowerCase();
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, KIND[ext] ?? ts.ScriptKind.TSX);
  // JSX text is words on the screen: a `//` in it is a character, not a comment.
  const jsxText: [number, number][] = [];
  const found = new Map<number, number>();
  const note = (rs: ts.CommentRange[] | undefined) => rs?.forEach((r) => found.set(r.pos, r.end));
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.JsxText) { jsxText.push([node.getFullStart(), node.getEnd()]); return; }
    note(ts.getLeadingCommentRanges(text, node.getFullStart()));
    note(ts.getTrailingCommentRanges(text, node.getEnd()));
    node.getChildren(sf).forEach(visit);
  };
  visit(sf);
  const chars = text.split('');
  for (const [pos, end] of found) {
    if (jsxText.some(([a, b]) => pos >= a && pos < b)) continue;
    for (let i = pos; i < end; i++) if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
  }
  return chars.join('');
}

/** A file under mobile/ (or an absolute path), as code: its comments blanked. */
export function readCode(file: string): string {
  const path = isAbsolute(file) ? file : join(MOBILE, file);
  return stripComments(readFileSync(path, 'utf8'), path);
}
