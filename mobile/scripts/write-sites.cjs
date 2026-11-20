#!/usr/bin/env node
/**
 * write-sites.cjs — every place the app writes to the house: the list the exactly-once reviewer reads whole and
 * the phone tests for every save are held to.
 *
 *   node mobile/scripts/write-sites.cjs            prints the list, and how it differs from mobile/e2e/write-sites.json
 *   node mobile/scripts/write-sites.cjs --write    writes the list to mobile/e2e/write-sites.json
 *
 * A write site is a call, in the app's code (the shared file list's appCode), of `.insert(`, `.update(`,
 * `.upsert(` or `.delete(` on a table (a chain that began with `.from(`), of `.upload(`, `.update(`, `.move(`,
 * `.copy(` or `.remove(` on a storage bucket, of `.rpc(` on a database function that writes, or of
 * `functions.invoke(` on an edge function that writes. A function writes when its newest definition (the live
 * schema, then each pending migration in name order) inserts, updates, deletes, merges, posts out, or calls a
 * function that does; an edge function writes when its folder makes such a call. A name not written in the code,
 * or not found, counts as a write: the list leaves nothing out on a guess.
 *
 * Each site is named by its file, the function it sits in, what it does and to what, and its order there (lines
 * move; names do not), with the area of the deep pass (scripts/reading-map.cjs) that reads it.
 * scripts/__tests__/writeSites.test.ts refuses a write site the kept list lacks, and a kept one that is gone.
 */
const fs = require('fs');
const path = require('path');

const MOBILE = path.join(__dirname, '..');
const ROOT = path.join(MOBILE, '..');
const KEPT = path.join(MOBILE, 'e2e', 'write-sites.json');

const TABLE_WRITES = new Set(['insert', 'update', 'upsert', 'delete']);
const STORAGE_WRITES = new Set(['upload', 'update', 'move', 'copy', 'remove']);

// ── which database and edge functions write ──────────────────────────────────

const DML = /\b(insert\s+into|update\s+(only\s+)?[\w."]+(\s+(as\s+)?\w+)?\s+set|delete\s+from|merge\s+into|net\.http_post|pg_notify)\b/i;

/** Every function's newest body, by name: the snapshot's, then each pending migration's in name order. */
function functionBodies(sqlTexts) {
  const bodies = new Map();
  for (const text of sqlTexts) {
    const head = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?public"?\.)?"?(\w+)"?\s*\(/gi;
    let m;
    while ((m = head.exec(text))) {
      const as = /\bAS\s+(\$\w*\$)/gi;
      as.lastIndex = m.index;
      const open = as.exec(text);
      if (!open) continue;
      const end = text.indexOf(open[1], open.index + open[0].length);
      if (end < 0) continue;
      const body = text.slice(open.index + open[0].length, end).replace(/--[^\n]*/g, ' ');
      bodies.set(m[1].toLowerCase(), body);
      head.lastIndex = end;
    }
  }
  return bodies;
}

/** The functions that write, a call to a writing function included, until nothing more is learned. */
function writingFunctions(bodies) {
  const writes = new Set([...bodies].filter(([, b]) => DML.test(b) || /\bexecute\b[^;]*\b(insert|update|delete)\b/i.test(b)).map(([n]) => n));
  for (let more = true; more;) {
    more = false;
    for (const [name, body] of bodies) {
      if (writes.has(name)) continue;
      if ([...writes].some((w) => new RegExp(`\\b${w}\\s*\\(`, 'i').test(body))) { writes.add(name); more = true; }
    }
  }
  return writes;
}

/** The SQL that defines the database: the snapshot, then the pending migrations of both trees in name order. */
function databaseSql(repo = ROOT) {
  const applied = new Set(fs.readFileSync(path.join(repo, 'mobile', 'supabase', 'APPLIED.txt'), 'utf8').split(/\r?\n/).map((l) => l.trim()));
  const { files } = require(path.join(repo, 'mobile', 'test-utils', 'universe.js')).at(repo);
  const pending = files('migrations').filter((f) => !applied.has(path.basename(f))).sort((a, b) => (path.basename(a) < path.basename(b) ? -1 : 1));
  return [path.join(repo, 'mobile', 'supabase', 'schema', 'live-schema.sql'), ...pending].map((f) => fs.readFileSync(f, 'utf8'));
}

/** Edge functions that write: their folder, in either tree, makes a table, storage or writing database call. */
function writingEdgeFunctions(writes, repo = ROOT) {
  const { files } = require(path.join(repo, 'mobile', 'test-utils', 'universe.js')).at(repo);
  const out = new Set();
  for (const f of files('functions')) {
    const name = path.relative(repo, f).split(path.sep).join('/').replace(/^(mobile\/)?supabase\/functions\//, '').split('/')[0];
    const text = fs.readFileSync(f, 'utf8');
    if (/\.(insert|upsert|update|delete|upload|remove)\(/.test(text)) out.add(name);
    for (const m of text.matchAll(/\.rpc\(\s*['"`](\w+)/g)) if (writes.has(m[1].toLowerCase())) out.add(name);
  }
  return out;
}

// ── the app's calls ──────────────────────────────────────────────────────────

/** The write sites of one file's text: { name, does, target, line }. */
function sitesIn(ts, text, rel, { writes, edgeWrites }) {
  const kind = /\.tsx$/.test(rel) ? ts.ScriptKind.TSX : /\.ts$/.test(rel) ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
  const out = [];
  const literal = (n) => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null);
  /** The calls of a chain below this one: `.from('t')` and the like, innermost last. */
  const chain = (expr) => {
    const calls = [];
    let e = expr;
    while (e) {
      if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) { calls.push({ name: e.expression.name.text, arg: e.arguments[0] }); e = e.expression.expression; } else if (ts.isPropertyAccessExpression(e)) { calls.push({ prop: e.name.text }); e = e.expression; } else if (ts.isCallExpression(e)) { e = e.expression; } else if (ts.isParenthesizedExpression(e) || ts.isAwaitExpression(e) || ts.isNonNullExpression(e)) { e = e.expression; } else break;
    }
    return calls;
  };
  const nameAt = (node) => {
    for (let n = node.parent; n; n = n.parent) {
      if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isClassDeclaration(n)) && n.name) return n.name.text;
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer) || ts.isCallExpression(n.initializer))) return n.name.text;
      if (ts.isPropertyAssignment(n) && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) return n.name.text;
    }
    return '(module)';
  };
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const below = chain(node.expression.expression);
      const from = below.find((c) => c.name === 'from');
      const storage = below.some((c) => c.prop === 'storage');
      let site = null;
      if (storage && from && STORAGE_WRITES.has(method)) site = { does: `storage.${method}`, target: literal(from.arg) || '?' };
      else if (!storage && from && TABLE_WRITES.has(method)) site = { does: method, target: literal(from.arg) || '?' };
      else if (method === 'rpc' && node.arguments.length) {
        const fn = literal(node.arguments[0]);
        if (!fn || !writes.known.has(fn.toLowerCase()) || writes.set.has(fn.toLowerCase())) site = { does: 'rpc', target: fn || '?' };
      } else if (method === 'invoke' && below.some((c) => c.prop === 'functions')) {
        const fn = literal(node.arguments[0]);
        if (!fn || edgeWrites.has(fn) || !edgeWrites.known.has(fn)) site = { does: 'invoke', target: fn || '?' };
      }
      if (site) out.push({ name: nameAt(node), ...site, line: sf.getLineAndCharacterOfPosition(node.expression.name.getStart(sf)).line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** The whole list, in file order, each site with its key and area. */
function writeSites(repo = ROOT) {
  const ts = require('typescript');
  const bodies = functionBodies(databaseSql(repo));
  const writes = { set: writingFunctions(bodies), known: new Set(bodies.keys()) };
  const edge = writingEdgeFunctions(writes.set, repo);
  const { files } = require(path.join(repo, 'mobile', 'test-utils', 'universe.js')).at(repo);
  const edgeNames = new Set(files('functions').map((f) => path.relative(repo, f).split(path.sep).join('/').replace(/^(mobile\/)?supabase\/functions\//, '').split('/')[0]));
  const edgeWrites = Object.assign(edge, { known: edgeNames });
  const code = files('appCode').map((f) => path.relative(repo, f).split(path.sep).join('/')).filter((r) => /\.(tsx?|jsx?|mjs|cjs)$/.test(r)).sort();
  const map = require('./reading-map.cjs');
  const areas = new Map(map.decideAll(map.trackedFiles(repo), { repo }).map((d) => [d.path, d.area || null]));
  const out = [];
  for (const rel of code) {
    const seen = new Map();
    for (const s of sitesIn(ts, fs.readFileSync(path.join(repo, rel), 'utf8'), rel, { writes, edgeWrites })) {
      const base = `${rel} › ${s.name} › ${s.does} ${s.target}`;
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      out.push({ key: n > 1 ? `${base} #${n}` : base, file: rel, name: s.name, does: s.does, target: s.target, area: areas.get(rel) || null, line: s.line });
    }
  }
  return out;
}

/** The kept list, keyed. */
const kept = () => (fs.existsSync(KEPT) ? JSON.parse(fs.readFileSync(KEPT, 'utf8')).sites : []);

module.exports = { functionBodies, writingFunctions, sitesIn, writeSites, kept, KEPT };

if (require.main === module) {
  const list = writeSites(ROOT);
  if (process.argv.includes('--write')) {
    const sites = list.map(({ line, ...s }) => s);
    fs.writeFileSync(KEPT, `${JSON.stringify({ why: 'Every place the app writes to the house, made by scripts/write-sites.cjs: the exactly-once reviewer reads each, and each gets a phone test that checks its row once. writeSites.test.ts refuses a site this list lacks.', sites }, null, 1)}\n`);
    console.log(`${sites.length} write sites written to ${path.relative(ROOT, KEPT)}`);
    process.exit(0);
  }
  const have = new Set(kept().map((s) => s.key));
  const now = new Set(list.map((s) => s.key));
  for (const s of list) console.log(`${have.has(s.key) ? ' ' : '+'} ${s.area || '?'}  ${s.file}:${s.line}  ${s.name}  ${s.does} ${s.target}`);
  for (const k of have) if (!now.has(k)) console.log(`- gone: ${k}`);
  console.log(`${list.length} write sites`);
}
