#!/usr/bin/env node
/**
 * The add-only check: a database change may not narrow what a shipped client
 * (the TestFlight build, the live website, an old internal build) relies on,
 * unless it says why that is safe.
 *
 * Over every migration a push adds or changes (both trees: supabase/ and
 * mobile/supabase/), each statement of these kinds is a break:
 *   DROP, RENAME, ALTER ... TYPE, REVOKE; a changed policy, a RESTRICTIVE one,
 *   or row level security switched on for a table that exists; a new
 *   constraint on a table that exists (CHECK, NOT NULL, UNIQUE, FOREIGN KEY,
 *   EXCLUDE, PRIMARY KEY, a unique index); a new trigger on a table that
 *   exists; ALTER FUNCTION changing a setting, owner or security; and a new
 *   body for a function that exists (CREATE OR REPLACE), since a narrowing can
 *   be silent.
 * "Exists" means it is in production's snapshot (mobile/supabase/schema).
 *
 * A break passes only with its reason in the comment lines right above it:
 *   -- add-only (1): no shipped client uses it: <the clients checked>
 *   -- add-only (2): an equal rewrite, shown by the attack matrix before and after
 *   -- add-only (3): it only widens or fixes: <the calls replayed>
 *   -- add-only (4): a break the user accepted: <the dated decision, quoted>
 * A change to an existing edge function needs, in one of the push's commit
 * messages, a line "Add-only (N): <function>: <why>" with the same reasons.
 *
 *   node mobile/scripts/add-only.cjs <base>     (where the push starts)
 */
const { execFileSync } = require('child_process');
const { readFileSync } = require('fs');
const { join } = require('path');
const universe = require('../test-utils/universe');

const ROOT = join(__dirname, '..', '..');
const SNAPSHOT = join(ROOT, 'mobile', 'supabase', 'schema', 'live-schema.sql');

const plain = (name) => name.replace(/"/g, '').replace(/^public\./i, '').toLowerCase();

/** The tables and functions production has. */
const existingIn = (snapshot) => ({
  tables: new Set([...snapshot.matchAll(/^CREATE TABLE (?:IF NOT EXISTS )?([\w."]+)/gim)].map((m) => plain(m[1]))),
  functions: new Set([...snapshot.matchAll(/^CREATE (?:OR REPLACE )?FUNCTION ([\w."]+)\(/gim)].map((m) => plain(m[1]))),
});

/**
 * The statements of a SQL file, each with the comment lines just above it and
 * its text with every string, quoted name and function body blanked, so a word
 * inside them is never read as a command.
 */
const statements = (sql) => {
  const out = [];
  let i = 0;
  let start = 0;
  let masked = '';
  let comments = [];
  let pending = [];
  const flush = (end) => {
    const text = sql.slice(start, end);
    if (masked.trim()) out.push({ text: text.trim(), masked: masked.replace(/\s+/g, ' ').trim().toUpperCase(), reason: comments.join('\n') });
    masked = '';
    comments = [];
    start = end + 1;
  };
  while (i < sql.length) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      const line = sql.slice(i, nl === -1 ? sql.length : nl);
      if (!masked.trim()) pending.push(line);
      i = nl === -1 ? sql.length : nl;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (c === '\n' && !masked.trim()) {
      // A blank line between a comment and its statement still keeps it; two do not.
      if (sql[i + 1] === '\n' || (sql[i + 1] === '\r' && sql[i + 2] === '\n')) pending = [];
    }
    if (c === "'" || c === '"') {
      const end = sql.indexOf(c, i + 1);
      masked += c === '"' ? ' X ' : " '' ";
      i = end === -1 ? sql.length : end + 1;
      continue;
    }
    const tag = c === '$' && sql.slice(i).match(/^\$[A-Za-z_]*\$/);
    if (tag) {
      const end = sql.indexOf(tag[0], i + tag[0].length);
      masked += ' $BODY$ ';
      i = end === -1 ? sql.length : end + tag[0].length;
      continue;
    }
    if (c === ';') { flush(i); i++; continue; }
    // A statement's first word: it keeps the comment lines that came right before it.
    if (!masked.trim() && /\S/.test(c)) { comments = pending; pending = []; }
    masked += c;
    i++;
  }
  flush(sql.length);
  return out;
};

/** The breaks among a file's statements, each with the kind it is. */
const breaksIn = (sql, existing) => {
  const created = new Set();
  const found = [];
  for (const s of statements(sql)) {
    const m = s.masked;
    const table = (re) => { const t = m.match(re); return t ? plain(t[1]) : null; };
    const exists = (name) => !!name && existing.tables.has(name) && !created.has(name);
    const newTable = table(/^CREATE TABLE (?:IF NOT EXISTS )?([\w.]+)/);
    if (newTable) created.add(newTable);
    const altered = table(/^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?([\w.]+)/);
    const kinds = [];
    if (/^DROP\b/.test(m)) kinds.push('DROP');
    if (/\bRENAME\b/.test(m) && /^ALTER\b/.test(m)) kinds.push('RENAME');
    if (/^ALTER TABLE\b.*\bALTER (?:COLUMN )?[\w]+ (?:SET DATA )?TYPE\b/.test(m)) kinds.push('ALTER ... TYPE');
    if (/^REVOKE\b/.test(m)) kinds.push('REVOKE');
    if (/^ALTER POLICY\b/.test(m)) kinds.push('a changed policy');
    if (/^CREATE POLICY\b.*\bAS RESTRICTIVE\b/.test(m)) kinds.push('a RESTRICTIVE policy');
    if (exists(altered) && /\b(?:ENABLE|FORCE) ROW LEVEL SECURITY\b/.test(m)) kinds.push('row level security on an existing table');
    if (exists(altered) && /\b(?:ADD CONSTRAINT|ADD CHECK|ADD UNIQUE|ADD FOREIGN KEY|ADD PRIMARY KEY|ADD EXCLUDE|SET NOT NULL|VALIDATE CONSTRAINT)\b/.test(m)) {
      kinds.push('a new constraint on an existing table');
    }
    const keyword = '(?:CONSTRAINT|CHECK|UNIQUE|FOREIGN|PRIMARY|EXCLUDE)\\b';
    const column = new RegExp(`\\bADD (?:COLUMN )?(?:IF NOT EXISTS )?(?!${keyword})\\w+ [^,]*\\b(?:NOT NULL|CHECK|UNIQUE|REFERENCES|PRIMARY KEY)\\b`);
    if (exists(altered) && column.test(m)) {
      kinds.push('a new column with a constraint on an existing table');
    }
    if (exists(table(/^CREATE UNIQUE INDEX (?:CONCURRENTLY )?(?:IF NOT EXISTS )?(?:[\w.]+ )?ON (?:ONLY )?([\w.]+)/))) kinds.push('a unique index on an existing table');
    if (exists(table(/^CREATE (?:OR REPLACE )?(?:CONSTRAINT )?TRIGGER \w+ .*?\bON ([\w.]+)/))) kinds.push('a new trigger on an existing table');
    if (/^ALTER FUNCTION\b.*\b(?:SET|RESET|OWNER TO|SECURITY DEFINER|SECURITY INVOKER)\b/.test(m)) kinds.push('a changed function setting');
    // A DO block runs its own SQL, blanked above, and dynamic SQL hides any break: one that changes
    // or runs SQL is read whole and needs its reason like any other.
    if (/^DO\b/.test(m) && /\b(?:DROP|REVOKE|RENAME|ALTER|EXECUTE|CREATE OR REPLACE|CREATE TRIGGER|CREATE POLICY|DELETE|UPDATE|TRUNCATE)\b/i.test(s.text)) {
      kinds.push('a DO block that changes what exists');
    }
    const replaced = m.match(/^CREATE OR REPLACE FUNCTION ([\w.]+) ?\(/);
    if (replaced && existing.functions.has(plain(replaced[1]))) kinds.push('a new body for an existing function');
    if (kinds.length) found.push({ statement: s.text.split('\n')[0].slice(0, 120), kinds, reason: s.reason });
  }
  return found;
};

/** Why a stated reason is not enough, or null when it is. */
const reasonFault = (comments) => {
  const r = comments.match(/add-only \(([1-4])\):\s*(.+)/is);
  if (!r) return 'no reason';
  const [, n, words] = r;
  const said = words.replace(/--/g, ' ').replace(/\s+/g, ' ').trim();
  if (said.length < 20) return `reason (${n}) says too little`;
  if (n === '1' && !/TestFlight|website|build \d+/i.test(said)) return 'reason (1) names no client checked';
  if (n === '2' && !/attack matrix/i.test(said)) return 'reason (2) names no attack-matrix proof';
  if (n === '3' && !/replay|old[- ]app|E2E/i.test(said)) return 'reason (3) names no replay';
  if (n === '4' && !/\d{4}-\d{2}-\d{2}/.test(said)) return 'reason (4) quotes no dated decision';
  return null;
};

// By kind (test-utils/universe.js): never an undo file or the archive.
const isMigration = (path) => universe.kindOf(path) === 'migration';
// SQL in a supabase/ tree that no rule names is refused, never passed over.
const unnamedSql = (path) => /^(?:mobile\/)?supabase\/.*\.sql$/.test(path) && universe.kindOf(path) === 'unknown';
const FUNCTIONS = /^(?:mobile\/)?supabase\/functions\/([^/]+)\//;

const check = (base) => {
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 });
  const changed = git('diff', '--name-status', '--no-renames', `${base}...HEAD`).split('\n').filter(Boolean)
    .map((l) => { const [status, path] = l.split('\t'); return { status, path }; });
  const existing = existingIn(readFileSync(SNAPSHOT, 'utf8'));
  const faults = changed.filter((c) => c.status !== 'D' && unnamedSql(c.path))
    .map((c) => `${c.path}: a SQL file no rule in test-utils/universe.js names — say what it is there`);
  for (const { status, path } of changed.filter((c) => c.status !== 'D' && isMigration(c.path))) {
    for (const b of breaksIn(readFileSync(join(ROOT, path), 'utf8'), existing)) {
      const fault = reasonFault(b.reason);
      if (fault) faults.push(`${path} (${status}): ${b.kinds.join(', ')} — ${fault}\n    ${b.statement}`);
    }
  }
  const messages = git('log', '--format=%B', `${base}..HEAD`);
  const touched = new Set();
  for (const { path } of changed) {
    const fn = path.match(FUNCTIONS);
    if (!fn) continue;
    const folder = path.slice(0, path.indexOf(fn[1]) + fn[1].length);
    let inBase = true;
    try { git('cat-file', '-e', `${base}:${folder}`); } catch { inBase = false; }
    if (inBase) touched.add(fn[1]);
  }
  return [...faults, ...functionFaults([...touched], messages)];
};

/** Each existing function a push changed whose commits give no good enough reason. */
const functionFaults = (touched, messages) => touched.flatMap((fn) => {
  const line = messages.split('\n').find((l) => l.startsWith('Add-only (') && l.includes(`${fn}:`));
  const fault = line ? reasonFault(line.replace(/^Add-only/, 'add-only')) : 'no "Add-only (N): <function>:" line in the push\'s commits';
  return fault ? [`supabase function ${fn}: ${fault}`] : [];
});

if (require.main === module) {
  const base = process.argv[2];
  if (!base) { console.error('usage: node mobile/scripts/add-only.cjs <base commit>'); process.exit(2); }
  const faults = check(base);
  if (faults.length) {
    console.error(`A change could break a shipped client, and says no reason why it is safe:\n  ${faults.join('\n  ')}`);
    process.exit(1);
  }
  console.log('Every migration and function change since the base is add-only, or says why it is safe.');
}

module.exports = { breaksIn, existingIn, functionFaults, isMigration, reasonFault, statements, unnamedSql };
