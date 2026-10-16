#!/usr/bin/env node
/**
 * press-again — the finder of TST-14: in one test, the same control pressed a
 * second time with no time passed between. PressableScale refuses a second
 * press inside 400 ms (its debounce reads Date.now), and both a test's real
 * clock and jest's frozen one stay inside it, so the second press never
 * reaches the screen, and a check that nothing happened passes for that alone.
 *
 *   node mobile/scripts/press-again.cjs        each site, and the count
 *
 * Time has passed between two presses when a timer was advanced (jest's
 * advance, run or setSystemTime), or the test waited on a real timer: a
 * setTimeout, or a function of the test file whose body waits on one.
 */
const { readFileSync } = require('fs');
const { relative, join } = require('path');
const ts = require('typescript');
const { files } = require('../test-utils/universe');

const MOBILE = join(__dirname, '..');
const ADVANCE = /^(advanceTimersByTime|advanceTimersByTimeAsync|runAllTimers|runAllTimersAsync|runOnlyPendingTimers|advanceTimersToNextTimer|setSystemTime)$/;
const WAITS = /setTimeout|advanceTimers|runAllTimers|runOnlyPendingTimers|setSystemTime/;

/** Each second press of a control with no time passed since its first, in each test of a file. */
function sitesIn(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  // The file's own functions that wait on a timer, by name.
  const waiters = new Set();
  const collect = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isFunctionLike(n.initializer) && WAITS.test(n.initializer.getText(sf))) waiters.add(n.name.text);
    if (ts.isFunctionDeclaration(n) && n.name && WAITS.test(n.getText(sf))) waiters.add(n.name.text);
    ts.forEachChild(n, collect);
  };
  collect(sf);

  const sites = [];
  const inTest = (body) => {
    const pressed = new Map();
    const walk = (n) => {
      if (ts.isCallExpression(n)) {
        const e = n.expression;
        const isPress = ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'fireEvent' && e.name.text === 'press' && n.arguments[0];
        const isAdvance = (ts.isPropertyAccessExpression(e) && ADVANCE.test(e.name.text))
          || (ts.isIdentifier(e) && (e.text === 'setTimeout' || waiters.has(e.text)));
        if (isAdvance) pressed.clear();
        if (isPress) {
          const target = n.arguments[0].getText(sf);
          const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
          if (pressed.has(target)) sites.push({ target, line, first: pressed.get(target) });
          else pressed.set(target, line);
        }
      }
      ts.forEachChild(n, walk);
    };
    walk(body);
  };
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && /^(it|test)$/.test(n.expression.text) && n.arguments[1] && ts.isFunctionLike(n.arguments[1])) inTest(n.arguments[1]);
    else ts.forEachChild(n, visit);
  };
  visit(sf);
  return sites;
}

const testFiles = () => files('tests').filter((f) => /\.(test|spec)\.tsx?$/.test(f));

if (require.main === module) {
  let total = 0;
  for (const file of testFiles()) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('fireEvent.press')) continue;
    for (const s of sitesIn(file, text)) {
      total++;
      console.log(`${relative(MOBILE, file).split('\\').join('/')}:${s.line}  ${s.target} (first at ${s.first})`);
    }
  }
  console.log(`${total} second press(es) with no time passed.`);
}

module.exports = { sitesIn, testFiles };
