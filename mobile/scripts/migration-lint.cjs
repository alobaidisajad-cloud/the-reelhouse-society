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
 *     before its first other statement;
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
  return { kind: 'transaction', faults };
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
