#!/usr/bin/env node
/**
 * rhythm.cjs — every space the app sets (margins, paddings, gaps), held to the house rhythm.
 *
 *   node mockups/tools/rhythm.cjs            the counts
 *   node mockups/tools/rhythm.cjs --list     and each space off the rhythm, by file and line
 *   node mockups/tools/rhythm.cjs --check    fails when a file holds more off the rhythm than its
 *                                            count in mockups/finish-record.json (a new file: none)
 *   node mockups/tools/rhythm.cjs --lower    writes the counts that fell into the record
 *   node mockups/tools/rhythm.cjs --json F   the whole measure, as data
 *
 * The rhythm is read from the code: the step every spacing token in src/theme/theme.ts is a whole
 * number of (`spacing`: 4, 8, 16 … gives 4). A space is ON it when it is a token, or a number that
 * is a whole number of steps (0 and negatives included); OFF it when it is any other number; and
 * COMPUTED when the code works it out (a sum, a variable), which a script cannot judge and the
 * drawn page measures instead (align.cjs). Every file is parsed by TypeScript (source.cjs).
 */
const fs = require('fs');
const path = require('path');
const { ts, MOBILE, appSources, parse, walk, lineOf, numberOf, nameOf, ratchet } = require('./source.cjs');

const THEME = path.join(MOBILE, 'src', 'theme', 'theme.ts');

/** The style keys that set a space. */
const SPACES = new Set(['margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical',
  'marginStart', 'marginEnd', 'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'paddingHorizontal',
  'paddingVertical', 'paddingStart', 'paddingEnd', 'gap', 'rowGap', 'columnGap']);

/** The theme's spacing tokens and the step they share: { tokens: { xs: 4, … }, step }. */
function rhythmOf(themeSrc = parse(THEME)) {
  let tokens = null;
  walk(themeSrc.tree, (n) => {
    if (tokens || !ts.isVariableDeclaration(n) || n.name.getText() !== 'spacing') return;
    let init = n.initializer;
    while (init && (ts.isAsExpression(init) || ts.isParenthesizedExpression(init))) init = init.expression;
    if (!init || !ts.isObjectLiteralExpression(init)) return;
    tokens = {};
    for (const p of init.properties) {
      const v = ts.isPropertyAssignment(p) ? numberOf(p.initializer) : null;
      if (v != null) tokens[nameOf(p)] = v;
    }
  });
  const values = Object.values(tokens ?? {}).filter((v) => v > 0 && Number.isInteger(v));
  if (!values.length) throw new Error(`${themeSrc.rel}: no spacing tokens found: the rhythm cannot be read`);
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  return { tokens, step: values.reduce(gcd) };
}

/** Each space one file sets: { prop, line, kind: 'token' | 'on' | 'off' | 'computed', value }. */
function spacesOf(src, step) {
  const out = [];
  walk(src.tree, (n) => {
    if (!ts.isPropertyAssignment(n) || !SPACES.has(nameOf(n))) return;
    const v = numberOf(n.initializer);
    const at = { prop: nameOf(n), line: lineOf(src, n) };
    if (v != null) out.push({ ...at, value: v, kind: Number.isInteger(v / step) ? 'on' : 'off' });
    else if (ts.isPropertyAccessExpression(n.initializer) && n.initializer.expression.getText() === 'spacing') out.push({ ...at, kind: 'token', value: n.initializer.getText() });
    else out.push({ ...at, kind: 'computed', value: n.initializer.getText().slice(0, 60) });
  });
  return out;
}

/** The whole measure: per file, its spaces by kind and each one off the rhythm. */
function measure(sources = appSources(), rhythm = rhythmOf()) {
  const files = {};
  const totals = { token: 0, on: 0, off: 0, computed: 0, half: 0 };
  for (const src of sources) {
    const spaces = spacesOf(src, rhythm.step);
    if (!spaces.length) continue;
    const count = { token: 0, on: 0, off: 0, computed: 0 };
    for (const s of spaces) {
      count[s.kind] += 1;
      totals[s.kind] += 1;
      if (s.kind === 'off' && Number.isInteger((2 * s.value) / rhythm.step)) totals.half += 1;
    }
    files[src.rel] = { ...count, offs: spaces.filter((s) => s.kind === 'off').map((s) => `${s.line} ${s.prop}: ${s.value}`) };
  }
  return { step: rhythm.step, tokens: rhythm.tokens, totals, files };
}

function main(argv) {
  const m = measure();
  const at = argv.indexOf('--json');
  if (at >= 0) fs.writeFileSync(argv[at + 1], `${JSON.stringify(m, null, 2)}\n`);
  const t = m.totals;
  console.log(`the rhythm: ${m.step}pt (spacing tokens ${Object.entries(m.tokens).map(([k, v]) => `${k} ${v}`).join(', ')})`);
  console.log(`spaces set: ${t.token} by token, ${t.on} on the rhythm by number, ${t.off} OFF it (${t.half} of them on its half step), ${t.computed} computed (judged on the drawn page)`);
  if (argv.includes('--list')) for (const [f, c] of Object.entries(m.files)) if (c.off) console.log(`${f}\n  ${c.offs.join('\n  ')}`);
  return ratchet('rhythm', m.files, argv, `spaces off the ${m.step}pt rhythm`);
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { SPACES, rhythmOf, spacesOf, measure };
