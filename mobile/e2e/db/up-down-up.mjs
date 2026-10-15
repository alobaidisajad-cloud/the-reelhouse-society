#!/usr/bin/env node
/**
 * up-down-up.mjs — every pending migration's undo, proven on production's shape.
 *
 * Run on the runner after bootstrap.mjs has built production's shape
 * (db-integration.yml). A migration is pending when it is not in
 * mobile/supabase/APPLIED.txt; its undo is the file of the same name in
 * mobile/supabase/migrations-down/. For each pending migration, in name order:
 *   the schema is dumped (A); the migration is applied (B); its undo (C must
 *   equal A); the migration again (D must equal B).
 * Each runs as apply.cjs runs it: one transaction, under the time limits. The
 * database is left with every pending migration applied, so the checks that
 * follow test production as it will be.
 *
 *   node mobile/e2e/db/up-down-up.mjs              the pending migrations
 *   node mobile/e2e/db/up-down-up.mjs --self-test  a good pair must pass and a
 *                                                  planted bad undo must fail,
 *                                                  in a scratch database
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE = join(HERE, '..', '..');
const ROOT = join(MOBILE, '..');
const SERVER = `postgresql://postgres:postgres@${process.env.E2E_DB_HOST ?? '127.0.0.1'}:${process.env.E2E_DB_PORT ?? '54322'}`;
const LIMITS = '-c lock_timeout=2s -c statement_timeout=30s';

/** Every migration file with code in it, both trees, by name. */
export const migrations = () => ['supabase/migrations', 'mobile/supabase/migrations'].flatMap((dir) =>
  readdirSync(join(ROOT, dir)).filter((f) => f.endsWith('.sql')).map((f) => ({ name: f, path: join(ROOT, dir, f) })))
  .filter((m) => readFileSync(m.path, 'utf8').split('\n').some((l) => l.trim() && !l.trim().startsWith('--')))
  .sort((a, b) => a.name.localeCompare(b.name));

export const applied = () => new Set(readFileSync(join(MOBILE, 'supabase', 'APPLIED.txt'), 'utf8')
  .split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));

export const undoOf = (name) => join(MOBILE, 'supabase', 'migrations-down', name);

const apply = (url, file) => execFileSync('psql', [url, '-X', '-q', '-1', '-v', 'ON_ERROR_STOP=1', '-f', file],
  { encoding: 'utf8', env: { ...process.env, PGOPTIONS: LIMITS }, stdio: ['ignore', 'pipe', 'pipe'] });

/** pg_dump's schema, less its comments, settings and per-run restrict key, so two compare. */
const dump = (url) => execFileSync('pg_dump', [url, '--schema-only', '--no-comments'], { encoding: 'utf8', maxBuffer: 1e9 })
  .split('\n').filter((l) => l.trim() && !l.startsWith('--') && !/^SET |^SELECT pg_catalog\.set_config|^\\(un)?restrict /.test(l))
  .join('\n');

const firstDifference = (a, b) => {
  const x = a.split('\n');
  const y = b.split('\n');
  const i = x.findIndex((l, k) => l !== y[k]);
  return i === -1 ? `(${x.length} lines against ${y.length})` : `line ${i + 1}:\n    before: ${x[i] ?? '(none)'}\n    after:  ${y[i] ?? '(none)'}`;
};

/** Up, down, up for one migration on url; the fault, or null. */
const roundTrip = (url, up, down) => {
  const a = dump(url);
  apply(url, up);
  const b = dump(url);
  if (a === b) return 'the migration changed nothing in the schema';
  apply(url, down);
  const c = dump(url);
  if (c !== a) return `the undo does not restore the schema, at ${firstDifference(a, c)}`;
  apply(url, up);
  const d = dump(url);
  if (d !== b) return `applied again, the migration gives a different schema, at ${firstDifference(b, d)}`;
  return null;
};

const run = () => {
  const done = applied();
  const pending = migrations().filter((m) => !done.has(m.name));
  const faults = [];
  for (const m of pending) {
    if (!existsSync(undoOf(m.name))) { faults.push(`${m.name}: no undo file`); continue; }
    console.log(`→ ${m.name}: up, down, up`);
    try {
      const fault = roundTrip(`${SERVER}/postgres`, m.path, undoOf(m.name));
      if (fault) faults.push(`${m.name}: ${fault}`);
    } catch (e) {
      faults.push(`${m.name}: ${(e.stderr || e.message).trim().split('\n')[0]}`);
    }
  }
  if (faults.length) { console.error(`✗ Undo not proven:\n  ${faults.join('\n  ')}`); process.exit(1); }
  console.log(`✓ ${pending.length} pending migration(s), each undone and redone to the same schema.`);
};

/** A round trip in a scratch database of its own, dropped after. */
const inScratch = (name, down) => {
  const fixtures = join(HERE, 'fixtures', 'up-down-up');
  const admin = ['psql', [`${SERVER}/postgres`, '-X', '-q']];
  execFileSync(admin[0], [...admin[1], '-c', `DROP DATABASE IF EXISTS ${name}`, '-c', `CREATE DATABASE ${name}`]);
  try {
    return roundTrip(`${SERVER}/${name}`, join(fixtures, 'up.sql'), join(fixtures, down));
  } finally {
    execFileSync(admin[0], [...admin[1], '-c', `DROP DATABASE ${name}`]);
  }
};

const selfTest = () => {
  const good = inScratch('up_down_up_good', 'down.sql');
  const bad = inScratch('up_down_up_bad', 'down-forgets-a-function.sql');
  if (good !== null) { console.error(`✗ self-test: a correct undo was refused: ${good}`); process.exit(1); }
  if (!bad || !bad.startsWith('the undo does not restore the schema')) { console.error(`✗ self-test: a bad undo passed (${bad})`); process.exit(1); }
  console.log('✓ self-test: a correct undo passes, and one that forgets a function is caught.');
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--self-test')) selfTest(); else run();
}
