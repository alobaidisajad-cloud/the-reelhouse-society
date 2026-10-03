/**
 * stripComments — the one way this project takes comments out of source.
 *
 * Plain CommonJS so the node tools (scripts/gates-check.js,
 * mockups/tools/drawn.cjs) use the very function the tests use through
 * readCode.ts. A regex cannot tell a comment from a string — `'https://…'`
 * lost everything after its `//` — so this parses the text with TypeScript and
 * blanks exactly the comments the parser found between tokens: never a `//`
 * inside a string, a regex, a template or JSX text.
 *
 * Each comment becomes blanks of the same shape (line breaks kept, everything
 * else a space), so positions and line numbers still match the file, and
 * `a/*x*\/b` never becomes `ab`.
 */
const ts = require('typescript');

const KIND = { ts: ts.ScriptKind.TS, tsx: ts.ScriptKind.TSX, js: ts.ScriptKind.JS, jsx: ts.ScriptKind.JSX, mjs: ts.ScriptKind.JS, cjs: ts.ScriptKind.JS };

/**
 * @param {string} text
 * @param {string} [file] decides TS or TSX; with none, TSX, then TS if TSX cannot read it
 * @returns {string}
 */
function stripComments(text, file) {
  const ext = (/\.([a-z]+)$/.exec(file || '') || [])[1] || '';
  let sf = ts.createSourceFile(file || 'x.tsx', text, ts.ScriptTarget.Latest, true, KIND[ext.toLowerCase()] || ts.ScriptKind.TSX);
  // Text with no file name is read as TSX, where `<T>(x) => x` is a JSX tag and
  // everything after it parses wrong. If TSX cannot read it, it is plain TS.
  if (!file && sf.parseDiagnostics.length) {
    const asTs = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    if (!asTs.parseDiagnostics.length) sf = asTs;
  }
  // JSX text is words on the screen: a `//` in it is a character, not a comment.
  const jsxText = [];
  const found = new Map();
  const note = (rs) => { if (rs) rs.forEach((r) => found.set(r.pos, r.end)); };
  const visit = (node) => {
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

module.exports = { stripComments };
