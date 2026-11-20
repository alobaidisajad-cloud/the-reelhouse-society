#!/usr/bin/env node
/**
 * reading-scope.cjs — the slices a reader is given: from the reading map, every file of an area never read, whole,
 * and every changed part with its whole function and everything that calls it.
 *
 *   node mobile/scripts/reading-scope.cjs --area <AREA-…> --copy <folder> --id <name> --out <folder>
 *        [--max-lines 8000] [--map <the map's data file>]
 *
 * Each slice is a scope for scripts/coverage.cjs ({ id, commit, copy, planted: false, files }), its lines counted
 * at the map's commit, which is the commit the copy must be made from. A slice holds whole files and is cut at
 * --max-lines (a file longer than that is a slice of its own). A changed part of code grows to the smallest
 * function that holds it (or its top-level statement), and to each statement, in its own file or in a file that
 * imports it, that names that function; a changed part of anything else grows to its paragraph (the lines between
 * blank ones).
 */
const fs = require('fs');
const path = require('path');
const { buildMap, merge, size, importsOf, CODE, trackedFiles } = require('./reading-map.cjs');

const ROOT = path.join(__dirname, '..', '..');

/** The TypeScript parser: the repo's own, or this checkout's when the repo has none installed. */
function tsOf(repo) {
  try { return require(require.resolve('typescript', { paths: [path.join(repo, 'mobile')] })); } catch { return require('typescript'); }
}

/** The functions and top-level statements of a code file: { from, to, name, fn }. */
function blocksOf(ts, text, rel) {
  const kind = /\.tsx$/.test(rel) ? ts.ScriptKind.TSX : /\.ts$/.test(rel) ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
  const line = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const out = [];
  const nameOf = (n) => {
    if (n.name && ts.isIdentifier(n.name)) return n.name.text;
    if (n.name && ts.isStringLiteral(n.name)) return n.name.text;
    const p = n.parent;
    if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
    if (p && ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) return p.name.text;
    return null;
  };
  const visit = (n, top) => {
    const fn = ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)
      || ts.isConstructorDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n) || ts.isClassDeclaration(n);
    if (top || fn) out.push({ from: line(n.getStart(sf)), to: line(n.end), name: fn || top ? nameOf(n) || topName(n) : null, fn });
    ts.forEachChild(n, (c) => visit(c, false));
  };
  const topName = (n) => {
    if (ts.isVariableStatement(n)) {
      const d = n.declarationList.declarations[0];
      return d && ts.isIdentifier(d.name) ? d.name.text : null;
    }
    return null;
  };
  for (const s of sf.statements) visit(s, true);
  return out;
}

/** The smallest block holding [a, b]: a function first, else its top-level statement. */
function holding(blocks, [a, b]) {
  const holds = blocks.filter((k) => k.from <= a && k.to >= b);
  const fns = holds.filter((k) => k.fn).sort((x, y) => (x.to - x.from) - (y.to - y.from));
  return fns[0] || holds.sort((x, y) => (x.to - x.from) - (y.to - y.from))[0] || null;
}

/** The paragraph around [a, b]: out to the nearest blank line each way. */
function paragraph(lines, [a, b]) {
  let from = a;
  let to = b;
  while (from > 1 && lines[from - 2] !== undefined && lines[from - 2].trim() !== '') from -= 1;
  while (to < lines.length && lines[to] !== undefined && lines[to].trim() !== '') to += 1;
  return [from, to];
}

/**
 * What a reader must open of each file of the map's entries: path → "whole" | ranges. Changed code grows to its
 * function and its callers (callers may sit in other files, of any area: they are part of this reading).
 */
function partsOf(entries, { repo = ROOT } = {}) {
  const ts = tsOf(repo);
  const parts = new Map();
  const add = (rel, ranges) => {
    if (parts.get(rel) === 'whole') return;
    parts.set(rel, merge([...(parts.get(rel) || []), ...ranges]));
  };
  const read = (rel) => { try { return fs.readFileSync(path.join(repo, rel), 'utf8'); } catch { return ''; } };
  const files = new Set(trackedFiles(repo));
  let importers = null;
  const importersOf = (rel) => {
    if (!importers) {
      importers = new Map();
      for (const f of files) {
        if (!/^mobile\/(app|src|modules|scripts|e2e|test-utils|__tests__)\//.test(f) || !CODE.test(f)) continue;
        for (const t of importsOf(repo, f, files)) { if (!importers.has(t)) importers.set(t, []); importers.get(t).push(f); }
      }
    }
    return importers.get(rel) || [];
  };
  for (const e of entries) {
    if (e.status === 'current') continue;
    if (e.status === 'never' || e.binary) { parts.set(e.path, 'whole'); continue; }
    const text = read(e.path);
    if (!CODE.test(e.path)) {
      const lines = text.split('\n');
      add(e.path, e.changed.map((r) => paragraph(lines, r)));
      continue;
    }
    const blocks = blocksOf(ts, text, e.path);
    const grown = [];
    const names = new Set();
    for (const r of e.changed) {
      const k = holding(blocks, r);
      grown.push(k ? [Math.min(k.from, r[0]), Math.max(k.to, r[1])] : r);
      if (k && k.name) names.add(k.name);
    }
    add(e.path, grown);
    // Everything that calls a changed function: in its own file, and in each file importing it.
    for (const name of names) {
      const word = new RegExp(`\\b${name.replace(/[$]/g, '\\$')}\\b`);
      for (const f of [e.path, ...importersOf(e.path)]) {
        const t = f === e.path ? text : read(f);
        const lines = t.split('\n');
        const fb = blocksOf(ts, t, f);
        const callers = [];
        lines.forEach((l, i) => {
          if (!word.test(l)) return;
          const k = holding(fb, [i + 1, i + 1]);
          callers.push(k ? [k.from, k.to] : [i + 1, i + 1]);
        });
        if (callers.length) add(f, callers);
      }
    }
  }
  return parts;
}

/** Slices of whole files, each at most `max` lines to read (a longer file alone). */
function slicesOf(parts, lineCount, max) {
  const items = [...parts.entries()].map(([rel, p]) => ({ rel, p, n: p === 'whole' ? lineCount(rel) : size(p) }))
    .sort((a, b) => (a.rel < b.rel ? -1 : 1));
  const slices = [];
  let cur = { files: {}, lines: 0 };
  for (const it of items) {
    if (cur.lines && cur.lines + it.n > max) { slices.push(cur); cur = { files: {}, lines: 0 }; }
    cur.files[it.rel] = it.p;
    cur.lines += it.n;
  }
  if (Object.keys(cur.files).length) slices.push(cur);
  return slices;
}

module.exports = { blocksOf, holding, paragraph, partsOf, slicesOf };

if (require.main === module) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? undefined : process.argv[i + 1]; };
  const area = arg('--area');
  const copy = arg('--copy');
  const id = arg('--id');
  const out = arg('--out');
  if (!area || !copy || !id || !out) { console.error('usage: reading-scope.cjs --area <AREA-…> --copy <folder> --id <name> --out <folder> [--max-lines 8000] [--map <json>]'); process.exit(2); }
  const map = arg('--map') ? JSON.parse(fs.readFileSync(arg('--map'), 'utf8')) : buildMap(ROOT);
  const entries = map.entries.filter((e) => e.area === area);
  const byPath = new Map(map.entries.map((e) => [e.path, e]));
  const parts = partsOf(entries);
  const slices = slicesOf(parts, (rel) => (byPath.get(rel) ? byPath.get(rel).lines : 0), Number(arg('--max-lines') || 8000));
  fs.mkdirSync(out, { recursive: true });
  slices.forEach((s, i) => {
    const scope = { id: `${id}-${i + 1}`, commit: map.commit, copy, planted: false, files: s.files };
    fs.writeFileSync(path.join(out, `${scope.id}.json`), JSON.stringify(scope, null, 1));
    console.log(`${scope.id}: ${Object.keys(s.files).length} files, ${s.lines} lines to read`);
  });
}
