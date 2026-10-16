#!/usr/bin/env node
/**
 * await-events — the finder of TST-08: a fireEvent, act or renderHook whose
 * promise nobody waits for (Testing Library 14 makes all three async), so what
 * a test checks next may be the screen from before the event.
 *
 *   node mobile/scripts/await-events.cjs           each site, by file, and the count
 *   node mobile/scripts/await-events.cjs --fix     awaits each site in a test, a hook,
 *                                                  an act or waitFor callback, or an
 *                                                  async function, making it async
 *
 * A site is waited for when it is awaited, returned, voided with its reason, the
 * whole body of an arrow (its caller has the promise), or held in a value. Any
 * other site is reported; --fix leaves those the shape of the code cannot make
 * wait (a forEach's callback, a helper whose callers would need to wait too) for
 * a hand to fix.
 */
const { readFileSync, writeFileSync } = require('fs');
const { relative, join } = require('path');
const ts = require('typescript');
const { files } = require('../test-utils/universe');

const MOBILE = join(__dirname, '..');
const EVENT = /^(fireEvent|act|renderHook)$/;
/** The calls whose callback may be made async: jest's own blocks, act and waitFor. */
const MAY_WAIT = /^(it|test|beforeEach|afterEach|beforeAll|afterAll|act|waitFor)$/;

const eventName = (callee) => {
  if (ts.isIdentifier(callee)) return EVENT.test(callee.text) ? callee.text : null;
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'fireEvent') return 'fireEvent';
  return null;
};

/** The name of the call a function is an argument of ('it', 'test.each(...)' as 'test', ...), or null. */
const calledBy = (fn) => {
  const call = fn.parent;
  if (!call || !ts.isCallExpression(call) || !call.arguments.includes(fn)) return null;
  let e = call.expression;
  while (ts.isCallExpression(e) || ts.isPropertyAccessExpression(e)) e = ts.isCallExpression(e) ? e.expression : e.expression;
  return ts.isIdentifier(e) ? e.text : null;
};

const isAsync = (fn) => (ts.getCombinedModifierFlags(fn) & ts.ModifierFlags.Async) !== 0;

/** Each unwaited site of a file: where, and the function to make async when it can wait there (null when not). */
function sitesIn(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const sites = [];
  const visit = (n) => {
    if (ts.isCallExpression(n) && eventName(n.expression)) {
      let p = n.parent;
      while (p && (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isNonNullExpression(p))) p = p.parent;
      const waited = ts.isAwaitExpression(p) || ts.isReturnStatement(p) || ts.isVoidExpression(p)
        || (ts.isArrowFunction(p) && p.body !== undefined && !ts.isBlock(p.body))
        || ts.isVariableDeclaration(p) || ts.isCallExpression(p) || ts.isPropertyAccessExpression(p) || ts.isArrayLiteralExpression(p)
        || ts.isBinaryExpression(p) || ts.isPropertyAssignment(p);
      if (!waited) {
        let fn = n.parent;
        while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
        const can = fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) || ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn))
          && (isAsync(fn) || MAY_WAIT.test(calledBy(fn) ?? ''));
        const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
        sites.push({ at: n.getStart(sf), line: line + 1, fn: can ? fn : null, sf });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return sites;
}

/** The text with each site that can wait awaited, its function made async. */
function fixed(text, sites) {
  const edits = [];
  const madeAsync = new Set();
  for (const s of sites) {
    if (!s.fn) continue;
    edits.push({ at: s.at, insert: 'await ' });
    if (!isAsync(s.fn) && !madeAsync.has(s.fn)) {
      madeAsync.add(s.fn);
      edits.push({ at: s.fn.getStart(s.sf), insert: 'async ' });
    }
  }
  edits.sort((a, b) => b.at - a.at);
  let out = text;
  for (const e of edits) out = out.slice(0, e.at) + e.insert + out.slice(e.at);
  return out;
}

const testFiles = () => files('tests').filter((f) => /\.(test|spec)\.tsx?$/.test(f));

if (require.main === module) {
  const fix = process.argv.includes('--fix');
  let total = 0;
  let byHand = 0;
  const counts = {};
  for (const file of testFiles()) {
    const text = readFileSync(file, 'utf8');
    if (!/fireEvent|renderHook|\bact\(/.test(text)) continue;
    const sites = sitesIn(file, text);
    if (!sites.length) continue;
    const rel = relative(MOBILE, file).split('\\').join('/');
    counts[rel] = sites.length;
    total += sites.length;
    for (const s of sites.filter((x) => !x.fn)) { byHand++; console.log(`  by hand: ${rel}:${s.line}`); }
    if (fix && sites.some((s) => s.fn)) writeFileSync(file, fixed(text, sites));
  }
  console.log(`${total} unwaited in ${Object.keys(counts).length} files; ${byHand} the code's shape leaves to a hand${fix ? `; ${total - byHand} awaited` : ''}.`);
}

module.exports = { fixed, sitesIn, testFiles };
