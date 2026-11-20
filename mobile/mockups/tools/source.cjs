/**
 * The app's source, parsed once, for the finish tools that read it (rhythm.cjs, icons.cjs,
 * transitions.cjs, inventory.cjs, sentences.cjs, repeated-elements.cjs, image-weight.cjs).
 *
 * Files come from the shared list (test-utils/universe.js), never a folder walk of its own. Each
 * file is parsed by TypeScript, so a value is read as the code means it: never a match in a
 * comment or a string. A tool's test hands its own files in place of the app's (`parse`).
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const MOBILE = path.join(__dirname, '..', '..');

/** A path from mobile/, with `/` between folders. */
const relOf = (abs) => path.relative(MOBILE, abs).split(path.sep).join('/');

/** One file parsed: its path from mobile/, its text and its tree. */
function parse(abs, text = fs.readFileSync(abs, 'utf8')) {
  const kind = abs.endsWith('.tsx') || abs.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return { abs, rel: relOf(abs), text, tree: ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, kind) };
}

/** The app's own code (app/ and src/, and what its routes reach), parsed: .ts and .tsx alone. */
function appSources() {
  const { files } = require(path.join(MOBILE, 'test-utils', 'universe.js'));
  return files('appCode', { ext: ['.ts', '.tsx'] }).filter((f) => !f.endsWith('.d.ts')).map((f) => parse(f));
}

/** The route files (app/), layouts included, parsed. */
function routeSources() {
  const { files } = require(path.join(MOBILE, 'test-utils', 'universe.js'));
  return files('routes', { ext: ['.tsx', '.ts'] }).map((f) => parse(f));
}

/** Every node of a tree, depth first. */
function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

/** The line a node starts on, from 1. */
const lineOf = (src, node) => src.tree.getLineAndCharacterOfPosition(node.getStart(src.tree)).line + 1;

/** A number a node spells, a minus sign included; null for anything computed. */
function numberOf(node) {
  if (!node) return null;
  if (ts.isParenthesizedExpression(node)) return numberOf(node.expression);
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) return -Number(node.operand.text);
  return null;
}

/** A property's name as written: `margin`, `'margin'`. */
function nameOf(node) {
  const n = node && node.name;
  if (!n) return null;
  if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return n.text;
  return null;
}

/** A JSX element's tag as written: `Text`, `Ionicons`, `Paper.Row`. */
function tagOf(node) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  return opening.tagName.getText();
}

/** A JSX attribute's value: a string or a number it spells, `{expr}` as its source text, true when bare. */
function attrOf(node, name) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  for (const a of opening.attributes.properties) {
    if (!ts.isJsxAttribute(a) || a.name.getText() !== name) continue;
    if (!a.initializer) return { value: true };
    if (ts.isStringLiteral(a.initializer)) return { value: a.initializer.text };
    const e = a.initializer.expression;
    if (!e) return { value: null };
    const n = numberOf(e);
    if (n != null) return { value: n };
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return { value: e.text };
    return { value: null, source: e.getText() };
  }
  return null;
}

/** The module each imported name comes from, in one file: { Mail: 'lucide-react-native', … }. */
function importsOf(src) {
  const out = {};
  for (const st of src.tree.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause) continue;
    const from = st.moduleSpecifier.text;
    const c = st.importClause;
    if (c.name) out[c.name.text] = from;
    if (c.namedBindings && ts.isNamedImports(c.namedBindings)) for (const e of c.namedBindings.elements) out[e.name.text] = from;
    if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) out[c.namedBindings.name.text] = from;
  }
  return out;
}

/** The app's own files one file imports (by `@/` or a relative path), resolved on disk. */
function localImports(src) {
  const out = [];
  for (const spec of new Set(Object.values(importsOf(src)))) {
    let base;
    if (spec.startsWith('@/')) base = path.join(MOBILE, spec.slice(2));
    else if (spec.startsWith('.')) base = path.resolve(path.dirname(src.abs), spec);
    else continue;
    const hit = ['', '.tsx', '.ts', '/index.tsx', '/index.ts'].map((e) => base + e).find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
    if (hit) out.push(hit);
  }
  return out;
}

/**
 * Which routes reach each file: { 'src/components/TryAgain.tsx': ['app/film/[id].tsx', …] }, by
 * following each route's imports through the app's own files (a route's layouts included: what a
 * layout draws stands on every screen under it).
 */
function routesReaching(routes = routeSources(), read = (f) => parse(f)) {
  const cache = new Map(routes.map((r) => [r.abs, r]));
  const get = (f) => { if (!cache.has(f)) cache.set(f, read(f)); return cache.get(f); };
  const reach = new Map();
  for (const r of routes) {
    const seen = new Set([r.abs]);
    const queue = [r.abs];
    while (queue.length) {
      const f = queue.pop();
      for (const next of localImports(get(f))) if (!seen.has(next) && /\.tsx?$/.test(next)) { seen.add(next); queue.push(next); }
    }
    for (const f of seen) {
      const rel = relOf(f);
      if (!reach.has(rel)) reach.set(rel, []);
      reach.get(rel).push(r.rel);
    }
  }
  return reach;
}

/** The record the static finish tools hold their counts in: one section a tool. */
const RECORD = path.join(MOBILE, 'mockups', 'finish-record.json');

/**
 * A tool's counts against its section of the record: each file's faults (`{ off, offs }`) may only
 * fall. A file the record does not name may hold none. `rose` names each file over its count, with
 * every fault; `fell` each file now under it, whose count is lowered in the same commit (--lower),
 * or the room it leaves would let a new fault in unseen.
 */
function judgeAgainst(files, allowed = {}, what = 'faults') {
  const rose = Object.entries(files).filter(([f, c]) => c.off > (allowed[f] ?? 0))
    .map(([f, c]) => `${f}: ${c.off} ${what}, the record allows ${allowed[f] ?? 0}\n    ${c.offs.join('\n    ')}`);
  const fell = Object.entries(allowed).filter(([f, n]) => (files[f]?.off ?? 0) < n).map(([f]) => f);
  return { rose, fell };
}

/** --check and --lower for one tool's section; the exit code. */
function ratchet(section, files, argv, what, record = RECORD) {
  const all = fs.existsSync(record) ? JSON.parse(fs.readFileSync(record, 'utf8')) : {};
  const allowed = all[section] ?? {};
  const { rose, fell } = judgeAgainst(files, allowed, what);
  if (argv.includes('--lower')) {
    const kept = Object.entries(files).filter(([, c]) => c.off > 0).map(([f, c]) => [f, Math.min(c.off, f in allowed ? allowed[f] : c.off)]);
    // A first record takes the counts as they stand; after it, nothing is raised.
    const next = { ...all, [section]: Object.fromEntries(kept.sort(([a], [b]) => (a < b ? -1 : 1))) };
    fs.writeFileSync(record, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`${section}: the record holds ${kept.reduce((n, [, c]) => n + c, 0)} ${what} in ${kept.length} files`);
    return 0;
  }
  if (argv.includes('--check')) {
    if (!(section in all)) { console.error(`${section}: no section in ${path.basename(record)}: run --lower once to start it`); return 1; }
    if (rose.length) { console.error(`${section}: more ${what} than the record allows:\n  ${rose.join('\n  ')}`); return 1; }
    if (fell.length) { console.error(`${section}: fewer ${what} than the record says, in ${fell.join(', ')}: run --lower and commit the record`); return 1; }
    console.log(`${section}: no file holds more ${what} than its record`);
  }
  return 0;
}

module.exports = { ts, MOBILE, RECORD, relOf, parse, appSources, routeSources, walk, lineOf, numberOf, nameOf, tagOf, attrOf, importsOf, localImports, routesReaching, judgeAgainst, ratchet };
