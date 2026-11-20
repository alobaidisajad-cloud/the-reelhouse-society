#!/usr/bin/env node
/**
 * reading-map.cjs — every file that ships, runs or deploys, its area, and what of it has been read.
 *
 *   node mobile/scripts/reading-map.cjs [--out <dir>] [--check]
 *
 * The files are git's own list of what it tracks in the whole repo (the app, both server folders, the website
 * host's preview-card endpoints, the CI workflows, the email templates), each decided by scripts/reading-areas.cjs:
 * an area, or left out with its reason. Per file: its lines, its last change (git), its last recorded read (the
 * reading log: scripts/COMMENTS-READ.md for the files comment-truth checks, scripts/READING-LOG.md for the rest),
 * and the line ranges changed since that read, which are the "changed parts" a reader reads with their whole
 * function and callers.
 *
 * A read written by scripts/ledger-write.cjs names its coverage record (`record <id>`, mobile/audit/reads/), and
 * the record names the exact commit read: what changed after that commit is unread. An older row says only a
 * day: what changed after that day is unread.
 *
 * Writes <out>/reading-map.json (the data) and <out>/reading-map.md (a short summary per area). --check prints
 * the files with no area and exits 1 if there are any. The default <out> is mobile/audit/final/ (private).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const AREAS_FILE = require('./reading-areas.cjs');

const ROOT = path.join(__dirname, '..', '..');
const RECORDS = 'mobile/audit/reads';
const BINARY = /\.(png|jpe?g|gif|webp|ico|ttf|otf|woff2?|mp3|mp4|webm|wav|keystore|jar|zip|gz|pdf)$/i;
const CODE = /\.(tsx?|jsx?|mjs|cjs)$/;

const git = (repo, args) => execFileSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 30 });

/** Every file git tracks in the repo, from its root. */
const trackedFiles = (repo) => git(repo, ['ls-files', '-z']).split('\0').filter(Boolean);

/** The migrations production has run: mobile/supabase/APPLIED.txt, by file name, both trees. */
function appliedNames(repo) {
  const text = fs.readFileSync(path.join(repo, 'mobile', 'supabase', 'APPLIED.txt'), 'utf8');
  return new Set(text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
}

const isTest = (rel) => /(^|\/)(__tests__|__mocks__|test-support)\//.test(rel) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);
const base = (rel) => path.posix.basename(rel).replace(/\.(test|spec|guard\.test)\.[cm]?[jt]sx?$/, '').replace(/\.[^.]+$/, '');

// ── imports, for the files a shared folder holds ─────────────────────────────

const RESOLVE = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];
const PLATFORMS = ['', '.ios', '.android', '.native', '.web'];

/** The app files a code file imports, as paths from the repo. */
function importsOf(repo, rel, exists) {
  let ts;
  try { ts = require(require.resolve('typescript', { paths: [path.join(repo, 'mobile')] })); } catch { ts = require('typescript'); }
  let text;
  try { text = fs.readFileSync(path.join(repo, rel), 'utf8'); } catch { return []; }
  const out = [];
  for (const { fileName: spec } of ts.preProcessFile(text, true, true).importedFiles) {
    let b;
    if (spec.startsWith('@/')) b = `mobile/${spec.slice(2)}`;
    else if (spec.startsWith('.')) b = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
    else continue;
    const tries = [b, ...PLATFORMS.flatMap((p) => RESOLVE.map((e) => `${b}${p}${e}`)), ...PLATFORMS.flatMap((p) => RESOLVE.map((e) => `${b}/index${p}${e}`))];
    const hit = tries.find((t) => exists.has(t));
    if (hit) out.push(hit);
  }
  return out;
}

// ── the areas ────────────────────────────────────────────────────────────────

/**
 * Each file's area or reason for leaving it out. `files` are paths from the repo; `applied` the names in
 * APPLIED.txt; `rules` the areas file (a test passes its own to plant a fault). Returns one entry per file:
 * { path, area, by } or { path, excluded }, or { path } when nothing decided it.
 */
function decideAll(files, { repo = ROOT, applied = appliedNames(repo), rules = AREAS_FILE, readImports = true } = {}) {
  const exists = new Set(files);
  const out = new Map();
  const excludedWhy = (rel) => {
    for (const x of rules.EXCLUDED) {
      if (x.applied) {
        if (/^(mobile\/)?supabase\/migrations\/[^/]+\.sql$/.test(rel) && applied.has(path.posix.basename(rel))) return x.why;
      } else if (x.re.test(rel) && !(x.unless && x.unless.test(rel))) return x.why;
    }
    return null;
  };
  for (const rel of files) {
    const why = excludedWhy(rel);
    if (why) { out.set(rel, { path: rel, excluded: why }); continue; }
    const place = rules.PLACES.find((p) => p.re.test(rel));
    if (place) { out.set(rel, { path: rel, area: place.area, by: 'place' }); continue; }
    if (rules.SHARED_FOLDERS.test(rel)) {
      const said = rules.words(base(rel));
      const name = rules.NAMES.find((n) => n.re.test(said));
      if (name) { out.set(rel, { path: rel, area: name.area, by: 'name' }); continue; }
    }
    out.set(rel, { path: rel });
  }

  if (readImports) {
    // Who imports whom, among the app's own code.
    const appCode = files.filter((f) => /^mobile\/(app|src|modules)\//.test(f) && CODE.test(f));
    const importers = new Map();
    const testImports = new Map();
    for (const f of appCode.concat(files.filter((f) => /^mobile\/__tests__\//.test(f) && CODE.test(f)))) {
      const to = importsOf(repo, f, exists);
      if (isTest(f)) { testImports.set(f, to); continue; }
      for (const t of to) { if (!importers.has(t)) importers.set(t, new Set()); importers.get(t).add(f); }
    }
    // A shared folder's code: the one area of the app files importing it, or shared when there are two.
    const open = () => [...out.values()].filter((e) => !e.area && !e.excluded && rules.SHARED_FOLDERS.test(e.path) && CODE.test(e.path) && !isTest(e.path));
    const known = (e) => {
      const by = [...(importers.get(e.path) || [])].map((f) => out.get(f)).filter(Boolean);
      return { areas: new Set(by.map((b) => b.area).filter(Boolean)), waiting: by.some((b) => !b.area && !b.excluded), n: by.length };
    };
    const settle = (e, areas, by) => { e.area = areas.size === 1 ? [...areas][0] : 'AREA-SHARED'; e.by = areas.size === 1 ? by : `importers in ${areas.size} areas`; };
    for (let changed = true; changed;) {
      changed = false;
      for (const e of open()) {
        const { areas, waiting } = known(e);
        // Two areas already import it: no importer still waiting can make it one area's.
        if (areas.size > 1 || (areas.size === 1 && !waiting)) { settle(e, areas, 'importers'); changed = true; }
      }
      if (changed) continue;
      // Only circles are left waiting: each takes the areas known so far, then the loop goes on.
      for (const e of open()) {
        const { areas } = known(e);
        if (areas.size) { settle(e, areas, 'importers, some in a circle'); changed = true; }
      }
    }
    // What nothing in the app imports: shared, said so (the dead-code pass reads these first).
    for (const e of open()) { e.area = 'AREA-SHARED'; e.by = known(e).n ? 'importers in a circle' : 'no app file imports it'; }
    // A test: the area of the app files it imports.
    for (const [t, to] of testImports) {
      const e = out.get(t);
      if (e.area || e.excluded) continue;
      const areas = to.map((f) => out.get(f)).filter((x) => x && x.area && !isTest(x.path)).map((x) => x.area);
      if (!areas.length) continue;
      const count = new Map();
      for (const a of areas) count.set(a, (count.get(a) || 0) + 1);
      const top = [...count.entries()].sort((x, y) => y[1] - x[1]);
      e.area = top.length > 1 && top[0][1] === top[1][1] ? 'AREA-SHARED' : top[0][0];
      e.by = 'what it imports';
    }
  }
  for (const e of out.values()) {
    if (e.area || e.excluded) continue;
    const f = rules.FALLBACK.find((x) => x.re.test(e.path));
    if (f) { e.area = f.area; e.by = 'its folder'; }
  }
  return [...out.values()];
}

// ── the reading log ──────────────────────────────────────────────────────────

const ROW = /^\| ([^|]+?) \| (—|\d{4}-\d{2}-\d{2}) \|(.*)\|\s*$/;
const RECORD = /\brecord ([a-z0-9-]+)\b/;

/** The reads both ledgers record: path from the repo → { date, ledger, record }. */
function readsOf(repo) {
  const reads = new Map();
  const take = (file, toRepo) => {
    let text;
    try { text = fs.readFileSync(path.join(repo, 'mobile', 'scripts', file), 'utf8'); } catch { return; }
    for (const line of text.split(/\r?\n/)) {
      const m = ROW.exec(line);
      if (!m || m[1] === 'File') continue;
      const rec = RECORD.exec(m[3]);
      reads.set(toRepo(m[1]), { date: m[2] === '—' ? null : m[2], ledger: file, record: rec ? rec[1] : null });
    }
  };
  take('COMMENTS-READ.md', (k) => (k.startsWith('../') ? k.slice(3) : `mobile/${k}`));
  take('READING-LOG.md', (k) => k);
  return reads;
}

/** A coverage record's commit, or null. */
function recordCommit(repo, id) {
  try { return JSON.parse(fs.readFileSync(path.join(repo, RECORDS, `${id}.json`), 'utf8')).commit || null; } catch { return null; }
}

// ── git: last change, and what changed since a read ──────────────────────────

/** Path → its commits, newest first: { hash, day }. */
function historyOf(repo) {
  const hist = new Map();
  let cur = null;
  for (const line of git(repo, ['log', '--format=@%H %cs', '--name-only', 'HEAD']).split('\n')) {
    if (line.startsWith('@')) { const [h, d] = line.slice(1).split(' '); cur = { hash: h, day: d }; continue; }
    const f = line.trim();
    if (!f || !cur) continue;
    if (!hist.has(f)) hist.set(f, []);
    hist.get(f).push(cur);
  }
  return hist;
}

/** Hunks of `git diff -U0` as new-side line ranges per file; a pure deletion marks the lines either side of it. */
function parseDiff(text, linesOf) {
  const out = new Map();
  let file = null;
  for (const line of text.split('\n')) {
    const f = /^\+\+\+ (?:b\/(.*)|\/dev\/null)$/.exec(line);
    if (f) { file = f[1] || null; if (file && !out.has(file)) out.set(file, []); continue; }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!h || !file) continue;
    const start = Number(h[1]);
    const count = h[2] === undefined ? 1 : Number(h[2]);
    const n = linesOf(file);
    if (count > 0) out.get(file).push([start, start + count - 1]);
    else if (n > 0) out.get(file).push([Math.max(1, start), Math.min(n, start + 1)]);
  }
  return out;
}

/** Ranges sorted and joined where they touch. */
function merge(ranges) {
  const s = ranges.filter((r) => r[1] >= r[0]).map((r) => [r[0], r[1]]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const r of s) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else out.push(r);
  }
  return out;
}

const size = (ranges) => ranges.reduce((n, [a, b]) => n + b - a + 1, 0);

/** A file's lines as the Read tool numbers them: a last newline ends a line, it does not begin one. */
function lineCount(text) {
  if (!text.length) return 0;
  const n = text.split('\n').length;
  return text.endsWith('\n') ? n - 1 : n;
}

/** The changed ranges of each file since its base commit, in HEAD's lines. `bases`: path → commit. */
function changedSince(repo, bases, linesOf) {
  const byBase = new Map();
  for (const [f, b] of bases) { if (!byBase.has(b)) byBase.set(b, []); byBase.get(b).push(f); }
  const out = new Map();
  for (const [b, files] of byBase) {
    for (let i = 0; i < files.length; i += 80) {
      const chunk = files.slice(i, i + 80);
      const parsed = parseDiff(git(repo, ['diff', '-U0', '--no-color', '--no-renames', b, 'HEAD', '--', ...chunk]), linesOf);
      for (const f of chunk) out.set(f, merge(parsed.get(f) || []));
    }
  }
  return out;
}

// ── the map ──────────────────────────────────────────────────────────────────

function buildMap(repo = ROOT) {
  const files = trackedFiles(repo);
  const decided = decideAll(files, { repo });
  const reads = readsOf(repo);
  const hist = historyOf(repo);
  const head = git(repo, ['rev-parse', 'HEAD']).trim();
  const text = new Map();
  const linesOf = (f) => {
    if (!text.has(f)) {
      let n = 0;
      if (!BINARY.test(f)) { try { n = lineCount(fs.readFileSync(path.join(repo, f), 'utf8')); } catch { n = 0; } }
      text.set(f, n);
    }
    return text.get(f);
  };
  const entries = [];
  const bases = new Map();
  for (const d of decided) {
    if (d.excluded || !d.area) continue;
    const h = hist.get(d.path) || [];
    const read = reads.get(d.path) || null;
    const e = {
      path: d.path, area: d.area, by: d.by, lines: linesOf(d.path), binary: BINARY.test(d.path),
      lastChange: h[0] ? { commit: h[0].hash, day: h[0].day } : null,
      read: read && read.date ? read : null, status: 'never', changed: null, changedLines: 0,
    };
    if (e.read) {
      const at = e.read.record ? recordCommit(repo, e.read.record) : (h.find((c) => c.day <= e.read.date) || {}).hash;
      if (!at) e.status = 'never';
      else if (h[0] && at === h[0].hash) e.status = 'current';
      else if (e.read.record || (h[0] && h[0].day > e.read.date)) { e.status = 'changed'; bases.set(d.path, at); }
      else e.status = 'current';
    }
    if (e.status === 'never') { e.changed = e.lines ? [[1, e.lines]] : []; e.changedLines = e.lines; }
    entries.push(e);
  }
  const ranges = changedSince(repo, bases, linesOf);
  for (const e of entries) {
    if (e.status !== 'changed') continue;
    e.changed = ranges.get(e.path) || [];
    e.changedLines = size(e.changed);
    if (!e.changedLines) e.status = 'current';
  }
  return {
    commit: head,
    rule: 'Applied migrations are read through the live schema (mobile/supabase/schema/live-schema.sql), the shape production runs; every pending migration and every undo file is read whole.',
    entries,
    excluded: decided.filter((d) => d.excluded).map((d) => ({ path: d.path, why: d.excluded })),
    unplaced: decided.filter((d) => !d.excluded && !d.area).map((d) => d.path),
  };
}

function summary(map) {
  const rows = AREAS_FILE.AREAS.map((a) => {
    const es = map.entries.filter((e) => e.area === a.id);
    const pick = (s) => es.filter((e) => e.status === s);
    return { ...a, files: es.length, lines: es.reduce((n, e) => n + e.lines, 0), current: pick('current').length,
      changed: pick('changed').length, changedLines: pick('changed').reduce((n, e) => n + e.changedLines, 0),
      never: pick('never').length, neverLines: pick('never').reduce((n, e) => n + e.lines, 0) };
  });
  const reasons = new Map();
  for (const x of map.excluded) reasons.set(x.why, (reasons.get(x.why) || 0) + 1);
  const md = [
    '# The reading map', '', `At ${map.commit.slice(0, 8)}. ${map.rule}`, '',
    '| Area | Holds | Files | Lines | Read, unchanged | Changed since read (files / lines) | Never read (files / lines) |',
    '|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.id} | ${r.holds} | ${r.files} | ${r.lines} | ${r.current} | ${r.changed} / ${r.changedLines} | ${r.never} / ${r.neverLines} |`),
    '', `## Left out (${map.excluded.length} files)`, '', '| Files | Why |', '|---|---|',
    ...[...reasons.entries()].map(([why, n]) => `| ${n} | ${why} |`),
    '', map.unplaced.length ? `## With no area (${map.unplaced.length}): refused\n\n${map.unplaced.map((f) => `- ${f}`).join('\n')}` : 'Every file has an area.', '',
  ];
  return { rows, md: md.join('\n') };
}

module.exports = { decideAll, buildMap, summary, readsOf, parseDiff, merge, size, lineCount, trackedFiles, appliedNames, isTest, historyOf, changedSince, recordCommit, importsOf, CODE };

if (require.main === module) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? undefined : process.argv[i + 1]; };
  const map = buildMap(ROOT);
  if (process.argv.includes('--check')) {
    if (map.unplaced.length) { console.error(`Files with no area (scripts/reading-areas.cjs):\n  ${map.unplaced.join('\n  ')}`); process.exit(1); }
    console.log(`Every one of ${map.entries.length} files has an area; ${map.excluded.length} are left out, each with its reason.`);
    process.exit(0);
  }
  const out = arg('--out') || path.join(ROOT, 'mobile', 'audit', 'final');
  fs.mkdirSync(out, { recursive: true });
  const { rows, md } = summary(map);
  fs.writeFileSync(path.join(out, 'reading-map.json'), JSON.stringify(map, null, 1));
  fs.writeFileSync(path.join(out, 'reading-map.md'), md);
  for (const r of rows) console.log(`${r.id.padEnd(12)} ${String(r.files).padStart(5)} files ${String(r.lines).padStart(7)} lines  current ${r.current}  changed ${r.changed} (${r.changedLines} lines)  never ${r.never} (${r.neverLines} lines)`);
  console.log(`left out ${map.excluded.length}; with no area ${map.unplaced.length}. Wrote ${path.join(out, 'reading-map.json')} and reading-map.md`);
}
