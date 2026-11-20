#!/usr/bin/env node
/**
 * The migration lint: a migration applies as one unit, under the time limits,
 * or it does not apply.
 *
 * Two kinds of file:
 *   - a transaction file (every migration but one kind): apply.cjs runs it as
 *     one transaction, so it holds no transaction control of its own (a nested
 *     COMMIT ends the outer transaction early), and it sets
 *     `SET LOCAL lock_timeout = '2s'` and `SET LOCAL statement_timeout = '30s'`
 *     before its first other statement, builds an index only on a table it
 *     makes itself (one members write to is indexed CONCURRENTLY), and analyzes
 *     each column it adds to, or fills in, a table it did not make;
 *   - a CONCURRENTLY file: an index built, dropped or rebuilt CONCURRENTLY,
 *     which cannot run inside a transaction. It holds that one statement alone,
 *     with plain `SET lock_timeout = '2s'` and a plain `SET statement_timeout`
 *     (SET LOCAL does nothing outside a transaction). apply.cjs runs it only
 *     with --no-transaction.
 * An undo file (supabase/migrations-down/) holds no transaction control either.
 * The root tree's migrations/archive/ is not a migration (test-utils/universe.js),
 * and is not read.
 *
 *   node mobile/scripts/migration-lint.cjs <base>     (lints what the push adds or changes)
 */
const { execFileSync } = require('child_process');
const { readFileSync } = require('fs');
const { join } = require('path');
const { statements } = require('./add-only.cjs');
const universe = require('../test-utils/universe');

const ROOT = join(__dirname, '..', '..');
const CONTROL = /^(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|START TRANSACTION|END|ABORT|PREPARE TRANSACTION)\b/;
const CONCURRENT = /^(?:CREATE (?:UNIQUE )?INDEX CONCURRENTLY|DROP INDEX CONCURRENTLY|REINDEX (?:\(.*?\) )?\w+ CONCURRENTLY)\b/;
const LIMIT = /^SET (LOCAL )?(LOCK_TIMEOUT|STATEMENT_TIMEOUT) ?(?:=|TO) ?'' ?$/;

/** A file's kind and what is wrong with it ([] when nothing). */
const lint = (sql, { undo = false } = {}) => {
  const all = statements(sql);
  const faults = [];
  // The masked text blanks string values, so the limits' values are read from the statement itself.
  const valueOf = (s) => (s.text.match(/=\s*'([^']*)'|\bTO\s+'([^']*)'/i) || []).slice(1).find(Boolean);
  for (const s of all.filter((x) => CONTROL.test(x.masked))) faults.push(`transaction control: ${s.text.split('\n')[0]}`);
  const concurrent = all.filter((s) => CONCURRENT.test(s.masked));
  if (undo) return { kind: concurrent.length ? 'concurrently' : 'transaction', faults };
  const limits = all.filter((s) => LIMIT.test(s.masked));
  const others = all.filter((s) => !LIMIT.test(s.masked));
  const local = (s) => LIMIT.exec(s.masked)[1] === 'LOCAL ';
  const named = (name) => limits.filter((s) => LIMIT.exec(s.masked)[2] === name);
  if (concurrent.length) {
    if (others.length !== 1) faults.push(`a CONCURRENTLY statement must be alone in its file (${others.length} statements here)`);
    for (const s of limits.filter(local)) faults.push(`SET LOCAL does nothing outside a transaction: ${s.text}`);
    if (!named('LOCK_TIMEOUT').some((s) => !local(s) && valueOf(s) === '2s')) faults.push("no plain SET lock_timeout = '2s'");
    if (!named('STATEMENT_TIMEOUT').some((s) => !local(s) && valueOf(s))) faults.push('no plain SET statement_timeout');
    return { kind: 'concurrently', faults };
  }
  const firstOther = all.findIndex((s) => !LIMIT.test(s.masked));
  const before = (s) => firstOther === -1 || all.indexOf(s) < firstOther;
  for (const [name, value] of [['LOCK_TIMEOUT', '2s'], ['STATEMENT_TIMEOUT', '30s']]) {
    const ok = named(name).some((s) => local(s) && valueOf(s) === value && before(s));
    if (!ok) faults.push(`no SET LOCAL ${name.toLowerCase()} = '${value}' before the first statement`);
  }
  // An index on a table members already write to is built CONCURRENTLY: inside a transaction its
  // build holds their writes (the certification key held them a second and a half on the load
  // test's two million rows). Only a table this file makes may be indexed in it.
  const plain = (name) => name.replace(/^PUBLIC\./, '');
  const made = new Set(all.map((s) => /^CREATE (?:UNLOGGED )?TABLE (?:IF NOT EXISTS )?(?<table>[\w.]+)/.exec(s.masked)?.groups?.table).filter(Boolean).map(plain));
  for (const s of all) {
    const on = /^CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?(?:[\w.]+ )?ON (?:ONLY )?(?<table>[\w.]+)/.exec(s.masked)?.groups?.table;
    if (on && !made.has(plain(on))) faults.push(`an index on ${plain(on).toLowerCase()}, a table that already holds rows, is built CONCURRENTLY in a file of its own`);
  }
  // A column added to a table that holds rows has no statistics, and one filled by a top-level
  // UPDATE has stale ones; nothing gathers them soon (adding a column changes no row). The planner
  // then guesses: `withheld_at IS NULL` read as 0.5% of logs, when it is all of them, and the feed
  // read every log for a page of twenty. So the file analyzes each such column after it.
  for (const [at, s] of all.entries()) {
    for (const { table, column } of changedColumns(s.masked)) {
      if (made.has(plain(table))) continue;
      const counted = all.slice(at + 1).some((a) => analyzed(a.masked).some((x) => plain(x.table) === plain(table) && (!x.columns || x.columns.includes(column))));
      if (!counted) faults.push(`${plain(table).toLowerCase()}.${column.toLowerCase()} is added or filled here with no ANALYZE after it: the planner would guess its values`);
    }
  }
  return { kind: 'transaction', faults };
};

/** A text split at its commas outside parentheses, each part trimmed. */
const topLevel = (text) => {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;
    else if (text[i] === ',' && depth === 0) { parts.push(text.slice(from, i).trim()); from = i + 1; }
  }
  parts.push(text.slice(from).trim());
  return parts.filter(Boolean);
};

/** Where a word first stands outside parentheses in a text, or -1. */
const atTopLevel = (text, word) => {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;
    else if (depth === 0 && text.startsWith(word, i)) return i;
  }
  return -1;
};

/** The columns a masked statement adds (ALTER TABLE ... ADD COLUMN) or fills (a top-level UPDATE ... SET). */
const changedColumns = (masked) => {
  const altered = /^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?([\w.]+) (.*)$/.exec(masked);
  if (altered) {
    return topLevel(altered[2])
      .map((action) => /^ADD (?:COLUMN )?(?:IF NOT EXISTS )?(?!(?:CONSTRAINT|CHECK|UNIQUE|FOREIGN|PRIMARY|EXCLUDE)\b)(\w+)\b/.exec(action)?.[1])
      .filter(Boolean).map((column) => ({ table: altered[1], column }));
  }
  const updated = /^UPDATE (?:ONLY )?([\w.]+)(?: (?:AS )?(?!SET\b)\w+)? SET (.*)$/.exec(masked);
  if (!updated) return [];
  const ends = [' FROM ', ' WHERE ', ' RETURNING '].map((w) => atTopLevel(updated[2], w)).filter((i) => i >= 0);
  const set = updated[2].slice(0, ends.length ? Math.min(...ends) : undefined);
  return topLevel(set).flatMap((pair) => {
    const many = /^\(([^)]*)\) ?=/.exec(pair);
    const names = many ? many[1].split(',') : [/^(?:\w+\.)?(\w+) ?=/.exec(pair)?.[1] ?? ''];
    return names.map((n) => n.trim().replace(/^\w+\./, '')).filter(Boolean).map((column) => ({ table: updated[1], column }));
  });
};

/** The tables a masked ANALYZE statement reads, each with the columns it names (null: every one). */
const analyzed = (masked) => {
  const a = /^ANALYZE (?:VERBOSE )?(?:\([^)]*\) )?(.+)$/.exec(masked);
  if (!a) return [];
  return topLevel(a[1]).map((target) => {
    const t = /^([\w.]+)(?: ?\(([^)]*)\))?$/.exec(target);
    return t ? { table: t[1], columns: t[2] ? t[2].split(',').map((c) => c.trim()) : null } : null;
  }).filter(Boolean);
};

/**
 * Of the paths a push adds or changes (from the repo root), the ones the lint
 * reads, by what test-utils/universe.js says each is: a migration, or an undo
 * file. A SQL file in a supabase/ tree that no rule names is refused, so a new
 * folder cannot hide one; the archive is not a migration, by that written rule.
 */
const lintable = (paths, kindOf = universe.kindOf) => {
  const read = [];
  const unnamed = [];
  for (const p of paths.filter((x) => /^(?:mobile\/)?supabase\/.*\.sql$/.test(x))) {
    const kind = kindOf(p);
    if (kind === 'migration' || kind === 'undo') read.push({ path: p, undo: kind === 'undo' });
    else if (kind === 'unknown') unnamed.push(p);
  }
  return { read, unnamed };
};

if (require.main === module) {
  const base = process.argv[2];
  if (!base) { console.error('usage: node mobile/scripts/migration-lint.cjs <base commit>'); process.exit(2); }
  const changed = execFileSync('git', ['diff', '--name-only', '--diff-filter=AM', `${base}...HEAD`], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  const { read, unnamed } = lintable(changed);
  const faults = [
    ...unnamed.map((p) => `${p}: a SQL file no rule in test-utils/universe.js names — say what it is there`),
    ...read.flatMap(({ path, undo }) => lint(readFileSync(join(ROOT, path), 'utf8'), { undo }).faults.map((f) => `${path}: ${f}`)),
  ];
  if (faults.length) { console.error(`Migrations that cannot be applied safely:\n  ${faults.join('\n  ')}`); process.exit(1); }
  console.log(`Every migration and undo file since the base passes the lint (${read.length} read).`);
}

module.exports = { lint, lintable };
