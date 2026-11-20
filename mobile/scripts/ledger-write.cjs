#!/usr/bin/env node
/**
 * ledger-write.cjs — the only writer of the reading log (scripts/COMMENTS-READ.md and scripts/READING-LOG.md).
 *
 *   node mobile/scripts/ledger-write.cjs --log <agent.jsonl> --scope <scope> [--allow-write <file>]...
 *   node mobile/scripts/ledger-write.cjs --sync
 *
 * A read is written only from a coverage record this script takes itself, from the reader's own work log and the
 * scope it was given (scripts/coverage.cjs): never from a record handed to it. It refuses when the record does not
 * pass (100% of the scope opened, nothing touched outside the copy), when the scope was a planted copy, when the
 * scope's commit is not in HEAD's history, and when the copy differs from that commit in any file of the scope.
 * Then each file of the scope whose unread changes (all of it, if never read) the scope held is given a row: the
 * day the reading ended, and `record <id>`; the record is kept at mobile/audit/reads/<id>.json and names the exact
 * commit read. A file whose unread changes reach outside its scope keeps its row, and is printed.
 *
 * --sync gives each ledger a "—" row (never read) for a file it lacks and drops the row of a file gone:
 * COMMENTS-READ.md holds the files scripts/comment-truth.js checks; READING-LOG.md every other file of the reading
 * map. A "—" row claims no read, so it needs no record.
 *
 * A row read on or after READS_NEED_RECORDS must name a record (scripts/__tests__/readingLog.test.ts).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { check, sealOf, norm, lineCount } = require('./coverage.cjs');
const map = require('./reading-map.cjs');

const ROOT = path.join(__dirname, '..', '..');
const READS_NEED_RECORDS = '2026-11-21';
const RECORDS = 'mobile/audit/reads';

const git = (repo, args, opts = {}) => execFileSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 30, ...opts });

// ── the two ledgers ──────────────────────────────────────────────────────────

const LEDGERS = {
  'COMMENTS-READ.md': { key: (rel) => (rel.startsWith('mobile/') ? rel.slice(7) : `../${rel}`), rel: (k) => (k.startsWith('../') ? k.slice(3) : `mobile/${k}`) },
  'READING-LOG.md': { key: (rel) => rel, rel: (k) => k },
};
const ROW = /^\| ([^|]+?) \| (—|\d{4}-\d{2}-\d{2}) \|(.*)\|\s*$/;

/** A ledger as its lines, with an index of its rows: key → line number. */
function readLedger(repo, name) {
  const file = path.join(repo, 'mobile', 'scripts', name);
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const rows = new Map();
  lines.forEach((l, i) => { const m = ROW.exec(l); if (m && m[1] !== 'File') rows.set(m[1], i); });
  return { file, lines, rows, eol: text.includes('\r\n') ? '\r\n' : '\n' };
}

const rowLine = (key, date, said) => `| ${key} | ${date} | ${said} |`;

/** A row replaced where it stands; a new row goes at the end of the table. */
function placeRow(ledger, key, line) {
  if (ledger.rows.has(key)) { ledger.lines[ledger.rows.get(key)] = line; return; }
  const last = Math.max(ledger.lines.findIndex((l) => /^\|---/.test(l)), ...ledger.rows.values());
  ledger.lines.splice(last + 1, 0, line);
  ledger.rows = new Map();
  ledger.lines.forEach((l, i) => { const m = ROW.exec(l); if (m && m[1] !== 'File') ledger.rows.set(m[1], i); });
}

function dropRow(ledger, key) {
  if (!ledger.rows.has(key)) return;
  ledger.lines.splice(ledger.rows.get(key), 1);
  ledger.rows = new Map();
  ledger.lines.forEach((l, i) => { const m = ROW.exec(l); if (m && m[1] !== 'File') ledger.rows.set(m[1], i); });
}

const saveLedger = (ledger) => {
  while (ledger.lines.length && ledger.lines[ledger.lines.length - 1] === '') ledger.lines.pop();
  fs.writeFileSync(ledger.file, `${ledger.lines.join(ledger.eol)}${ledger.eol}`);
};

/** The files comment-truth checks, as paths from the repo. */
function commentChecked(repo) {
  const was = process.cwd();
  process.chdir(path.join(repo, 'mobile'));
  try {
    const { checkedFiles } = require(path.join(repo, 'mobile', 'scripts', 'comment-truth.js'));
    const f = checkedFiles();
    return new Set([...f.code, ...f.hash, ...f.docs].map(LEDGERS['COMMENTS-READ.md'].rel));
  } finally { process.chdir(was); }
}

/** Which ledger holds a file's row. */
const ledgerFor = (rel, checked) => (checked.has(rel) ? 'COMMENTS-READ.md' : 'READING-LOG.md');

// ── sync ─────────────────────────────────────────────────────────────────────

/** Adds a "—" row for each file a ledger lacks and drops the rows of files gone from it. Returns what changed. */
function sync(repo = ROOT) {
  const checked = commentChecked(repo);
  const files = map.trackedFiles(repo);
  const placed = map.decideAll(files, { repo }).filter((d) => d.area).map((d) => d.path);
  const want = {
    'COMMENTS-READ.md': new Set([...checked].map(LEDGERS['COMMENTS-READ.md'].key)),
    'READING-LOG.md': new Set(placed.filter((p) => !checked.has(p))),
  };
  const done = { added: [], dropped: [] };
  for (const name of Object.keys(LEDGERS)) {
    const ledger = readLedger(repo, name);
    for (const k of [...ledger.rows.keys()]) if (!want[name].has(k)) { dropRow(ledger, k); done.dropped.push(`${name}: ${k}`); }
    for (const k of [...want[name]].sort()) if (!ledger.rows.has(k)) { placeRow(ledger, k, rowLine(k, '—', '')); done.added.push(`${name}: ${k}`); }
    saveLedger(ledger);
  }
  return done;
}

// ── writing a read ───────────────────────────────────────────────────────────

/** The day an ISO time falls on, here. */
function dayOf(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whether the copy holds each file of the scope exactly as the commit has it. Returns the files that differ. */
function copyDiffers(repo, scope) {
  const differ = [];
  for (const rel of Object.keys(scope.files || {})) {
    let want;
    try { want = git(repo, ['show', `${scope.commit}:${rel}`], { encoding: 'buffer' }); } catch { differ.push(`${rel} (not at ${scope.commit.slice(0, 8)})`); continue; }
    let have;
    try { have = fs.readFileSync(path.join(scope.copy, rel)); } catch { differ.push(`${rel} (not in the copy)`); continue; }
    if (!want.equals(have) && want.toString('utf8').replace(/\r\n/g, '\n') !== have.toString('utf8').replace(/\r\n/g, '\n')) differ.push(rel);
  }
  return differ;
}

/** A file's unread ranges at `commit` (its lines there), from its row; "whole" if never read. */
function unreadAt(repo, rel, read, commit, lineCount) {
  if (!read || !read.date) return 'whole';
  let at = read.record ? map.recordCommit(repo, read.record) : null;
  if (!at && !read.record) {
    try { at = git(repo, ['log', '-1', '--format=%H', `--until=${read.date} 23:59:59`, commit, '--', rel]).trim() || null; } catch { at = null; }
  }
  if (!at) return 'whole';
  if (at === commit) return [];
  try { git(repo, ['merge-base', '--is-ancestor', at, commit]); } catch { return []; }
  const diff = git(repo, ['diff', '-U0', '--no-color', '--no-renames', at, commit, '--', rel]);
  return map.merge(map.parseDiff(diff, () => lineCount).get(rel) || []);
}

const holds = (scopePart, need, n) => {
  if (scopePart === 'whole') return true;
  if (need === 'whole') return n === 0 || map.merge(scopePart).some(([a, b]) => a <= 1 && b >= n);
  return need.every(([a, b]) => scopePart.some(([x, y]) => x <= a && y >= b));
};

/**
 * Takes the record and writes the reads. Returns { record, written, kept, refused }: `refused` set means nothing
 * was written.
 */
function write({ repo = ROOT, logPath, scopePath, allowWrite = [], today = null, checked = null }) {
  const logText = fs.readFileSync(logPath, 'utf8');
  const scope = JSON.parse(fs.readFileSync(scopePath, 'utf8'));
  const record = check({ logText, logPath, scope, allowWrite });
  const refuse = (why) => ({ record, written: [], kept: [], refused: why });
  if (!record.pass) return refuse(`the record does not pass: ${record.percent}% opened, ${record.outside.length} touches outside the copy`);
  if (scope.planted) return refuse('a planted copy is not the code: its reading is the round\'s, not the log\'s');
  if (!/^[a-z0-9-]+$/.test(scope.id || '')) return refuse('the scope has no id of lower-case letters, digits and dashes');
  if (fs.existsSync(path.join(repo, RECORDS, `${scope.id}.json`))) return refuse(`a record named ${scope.id} is already kept`);
  if (!scope.commit) return refuse('the scope names no commit');
  try { git(repo, ['merge-base', '--is-ancestor', scope.commit, 'HEAD']); } catch { return refuse(`${scope.commit} is not in HEAD's history`); }
  const differ = copyDiffers(repo, scope);
  if (differ.length) return refuse(`the copy is not the commit: ${differ.join(', ')}`);

  const inComments = checked || commentChecked(repo);
  const reads = map.readsOf(repo);
  const ledgers = Object.fromEntries(Object.keys(LEDGERS).map((n) => [n, readLedger(repo, n)]));
  const day = today || dayOf(record.log.ended || new Date().toISOString());
  const written = [];
  const kept = [];
  for (const [rel, part] of Object.entries(scope.files)) {
    let n = 0;
    try { n = lineCount(fs.readFileSync(path.join(scope.copy, rel), 'utf8')); } catch { n = 0; }
    const read = reads.get(rel);
    const need = unreadAt(repo, rel, read, scope.commit, n);
    if (!holds(part, need, n)) { kept.push(`${rel}: its unread changes reach outside the scope`); continue; }
    if (read && read.record) {
      const was = map.recordCommit(repo, read.record);
      let newer = false;
      try { git(repo, ['merge-base', '--is-ancestor', scope.commit, was]); newer = was !== scope.commit; } catch { newer = false; }
      if (newer) { kept.push(`${rel}: already read at a later commit`); continue; }
    }
    const name = ledgerFor(rel, inComments);
    const ledger = ledgers[name];
    const key = LEDGERS[name].key(rel);
    const said = `${need === 'whole' ? 'read whole' : need.length ? 'read what changed' : 'read again'} at ${scope.commit.slice(0, 8)}, record ${scope.id}`;
    placeRow(ledger, key, rowLine(key, day, said));
    written.push(rel);
  }
  fs.mkdirSync(path.join(repo, RECORDS), { recursive: true });
  const stored = { ...record, written, seal: undefined };
  stored.seal = sealOf(stored);
  fs.writeFileSync(path.join(repo, RECORDS, `${scope.id}.json`), `${JSON.stringify(stored, null, 1)}\n`);
  for (const l of Object.values(ledgers)) saveLedger(l);
  return { record: stored, written, kept, refused: null };
}

module.exports = { sync, write, READS_NEED_RECORDS, RECORDS, LEDGERS, ROW, readLedger, copyDiffers, unreadAt, commentChecked };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const arg = (n) => { const i = argv.indexOf(n); return i < 0 ? undefined : argv[i + 1]; };
  if (argv.includes('--sync')) {
    const { added, dropped } = sync(ROOT);
    for (const a of added) console.log(`added  ${a}`);
    for (const d of dropped) console.log(`dropped ${d}`);
    console.log(`${added.length} rows added, ${dropped.length} dropped`);
    process.exit(0);
  }
  if (!arg('--log') || !arg('--scope')) { console.error('usage: ledger-write.cjs --log <agent.jsonl> --scope <scope.json> [--allow-write <file>]... | --sync'); process.exit(2); }
  const r = write({ logPath: arg('--log'), scopePath: arg('--scope'), allowWrite: argv.flatMap((a, i) => (a === '--allow-write' ? [argv[i + 1]] : [])) });
  if (r.refused) { console.error(`REFUSED: ${r.refused}`); process.exit(1); }
  for (const k of r.kept) console.log(`kept   ${k}`);
  console.log(`${r.written.length} files read, record ${norm(path.join(ROOT, RECORDS, `${r.record.id}.json`))}`);
}
