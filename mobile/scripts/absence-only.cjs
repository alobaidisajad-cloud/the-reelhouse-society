#!/usr/bin/env node
/**
 * absence-only — the finder of TST-09: a test that renders, then only asks the
 * drawn screen for things and finds each absent. A blank screen, a crash
 * caught upstream or a list still loading passes it as well as the right one.
 * A test is anchored when it shows something drawn too: an expect that is not
 * an absence, or a bare getBy/getAllBy/findBy (each throws when nothing is
 * drawn).
 *
 *   node mobile/scripts/absence-only.cjs     each unanchored test, and the count
 */
const { readFileSync } = require('fs');
const { relative, join } = require('path');
const ts = require('typescript');
const { files } = require('../test-utils/universe');

const MOBILE = join(__dirname, '..');

/** Is this expect chain an absence? */
const absence = (chain) => /\.not\./.test(chain) || /\.(toBeNull|toBeUndefined|toBeFalsy)\(\)$/.test(chain)
  || /\.toHaveLength\(0\)$/.test(chain) || /\.toBe\((false|null|undefined|0)\)$/.test(chain) || /\.toEqual\(\[\]\)$/.test(chain);
/** Does it ask the drawn screen (a queryBy of a render, or screen.query)? */
const onScreen = (chain) => /expect\(\s*[\w.]*query(All)?By\w+\(/.test(chain) || /expect\(\s*screen\.query/.test(chain);

/** Each test of a file whose every check finds the screen without something, and nothing drawn. */
function sitesIn(file, text) {
  if (!/render\(|render</.test(text)) return [];
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const sites = [];
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && /^(it|test)$/.test(n.expression.text) && n.arguments[1] && ts.isFunctionLike(n.arguments[1])) {
      const fn = n.arguments[1];
      const chains = [];
      const walk = (m) => {
        if (ts.isCallExpression(m) && ts.isPropertyAccessExpression(m.expression) && !(m.parent && ts.isPropertyAccessExpression(m.parent))) {
          let base = m.expression.expression;
          while (ts.isPropertyAccessExpression(base) || (ts.isCallExpression(base) && !(ts.isIdentifier(base.expression) && base.expression.text === 'expect'))) base = base.expression;
          if (ts.isCallExpression(base) && ts.isIdentifier(base.expression) && base.expression.text === 'expect') chains.push(m.getText(sf).replace(/\s+/g, ' '));
        }
        ts.forEachChild(m, walk);
      };
      walk(fn);
      const anchored = /\b(get|getAll|find|findAll)By\w+\(/.test(fn.getText(sf));
      if (!anchored && chains.length && chains.every((c) => absence(c) && onScreen(c))) {
        const title = n.arguments[0] && ts.isStringLiteralLike(n.arguments[0]) ? n.arguments[0].text : '?';
        sites.push({ line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, title });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return sites;
}

const testFiles = () => files('tests').filter((f) => /\.(test|spec)\.tsx?$/.test(f));

if (require.main === module) {
  let total = 0;
  for (const file of testFiles()) {
    for (const s of sitesIn(file, readFileSync(file, 'utf8'))) {
      total++;
      console.log(`${relative(MOBILE, file).split('\\').join('/')}:${s.line}  ${s.title}`);
    }
  }
  console.log(`${total} test(s) find only absences on a screen they never show drawn.`);
}

module.exports = { sitesIn, testFiles };
