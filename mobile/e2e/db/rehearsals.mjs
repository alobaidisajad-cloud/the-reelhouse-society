#!/usr/bin/env node
/**
 * rehearsals.mjs — every production rehearsal, run on the sealed database.
 *
 * Run on the runner after bootstrap.mjs has built production's shape and
 * up-down-up.mjs has left every pending migration applied (db-integration.yml).
 * The rehearsals are every mobile/supabase/diagnostics/*_rehearsal.sql, found by
 * listing the folder, so a new one runs here the day it is written. First the
 * made-up house in rehearsal-seed.sql is laid down, as supabase_admin; then each
 * rehearsal runs in its own psql as postgres, the login production runs them as,
 * from mobile/ (a rehearsal may read a file by a path from there). No variable
 * is passed: the database already holds every pending migration, as
 * production will.
 *
 * Each rehearsal is one transaction that ends in its verdict: a miss, or a pick
 * that finds nothing, raises, and ON_ERROR_STOP makes psql exit non-zero. The
 * run fails naming every rehearsal that did.
 *
 *   node mobile/e2e/db/rehearsals.mjs              seed, then every rehearsal
 *   node mobile/e2e/db/rehearsals.mjs --self-test  a rehearsal that holds must
 *                                                  pass, and one that misses a
 *                                                  case or finds nothing must fail
 */
import { spawnSync } from 'node:child_process';
import { applied, apply, migrations, undoOf } from './up-down-up.mjs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import universe from '../../test-utils/universe.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE = join(HERE, '..', '..');
const DIAGNOSTICS = join(MOBILE, 'supabase', 'diagnostics');
const HOST = process.env.E2E_DB_HOST ?? '127.0.0.1';
const PORT = process.env.E2E_DB_PORT ?? '54322';
// The local stack's fixed development passwords — this database exists only on the runner.
const AS_POSTGRES = `postgresql://postgres:postgres@${HOST}:${PORT}/postgres`;
const AS_ADMIN = `postgresql://supabase_admin:postgres@${HOST}:${PORT}/postgres`;

if (!/^(127\.0\.0\.1|localhost)$/.test(HOST)) {
  console.error(`Refusing ${HOST}: the rehearsals run here only against a local database.`);
  process.exit(2);
}

/** Every rehearsal test-utils/universe.js names, by its path from the diagnostics folder. */
export const rehearsals = () => universe.files('rehearsals').map((f) => relative(DIAGNOSTICS, f).split(sep).join('/'));

/** One file in its own psql, from mobile/; its exit status and everything it printed. */
const psql = (url, file) => {
  const r = spawnSync('psql', [url, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-f', file],
    { cwd: MOBILE, encoding: 'utf8', maxBuffer: 1e8 });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
};

/** The rehearsal's own words for why it failed: its verdict, or the error that stopped it. */
const why = (out) => out.split('\n').filter((l) => /ERROR:/.test(l)).map((l) => l.replace(/^.*ERROR:\s*/, '')).join(' / ') || out.split('\n').slice(-3).join(' / ');

const run = () => {
  console.log('→ the made-up house (rehearsal-seed.sql), as supabase_admin');
  const seed = psql(AS_ADMIN, join(HERE, 'rehearsal-seed.sql'));
  if (seed.status !== 0) {
    console.error(`✗ the seed failed:\n${seed.out}`);
    process.exit(1);
  }
  const files = rehearsals();
  const failed = [];
  for (const f of files) {
    const r = psql(AS_POSTGRES, join(DIAGNOSTICS, f));
    console.log(`\n── ${f} ${r.status === 0 ? '✓' : '✗'}\n${r.out}`);
    if (r.status !== 0) {
      failed.push(`${f}: ${why(r.out)}`);
      console.log(`::error title=Rehearsal ${f}::${why(r.out).slice(0, 900)}`);
    }
  }
  if (failed.length) {
    console.error(`\n✗ ${failed.length} of ${files.length} rehearsal(s) failed:\n  ${failed.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`\n✓ ${files.length} rehearsals, every case as expected.`);
};

/**
 * Each pending migration's rehearsal (the one of the same name: 20261016_01_x.sql's is
 * x_rehearsal.sql), the migration taken away. A rehearsal that holds without its
 * migration proves nothing of it: a member's identity that never took, a table with no
 * row to ask about, a case that cannot fail. The pending migrations are undone from the
 * last; each rehearsal runs once its own is undone (the ones before it still applied,
 * as the train rehearses it) and must fail; then every one is applied again, in order,
 * and the database is as the checks after it expect.
 */
export const pairedWithRehearsals = (pending, files) => pending
  .map((m) => ({ migration: m, rehearsal: `${m.name.replace(/^\d{8}_\d{2}_/, '').replace(/\.sql$/, '')}_rehearsal.sql` }))
  .filter((p) => files.includes(p.rehearsal));

const without = () => {
  const done = applied();
  const pending = migrations().filter((m) => !done.has(m.name));
  const pairs = pairedWithRehearsals(pending, rehearsals());
  const vacuous = [];
  try {
    for (const m of [...pending].reverse()) {
      apply(AS_POSTGRES, undoOf(m.name));
      const pair = pairs.find((p) => p.migration === m);
      if (!pair) { console.log(`→ ${m.name} undone (no rehearsal of its name)`); continue; }
      const r = psql(AS_POSTGRES, join(DIAGNOSTICS, pair.rehearsal));
      const said = r.status === 0 ? 'HELD — it proves nothing of its migration' : why(r.out).slice(0, 300);
      console.log(`→ ${pair.rehearsal}, without ${m.name}: ${r.status === 0 ? '✗' : '✓'} ${said}`);
      if (r.status === 0) {
        vacuous.push(pair.rehearsal);
        console.log(`::error title=Rehearsal ${pair.rehearsal}::holds without ${m.name}, so it proves nothing of it`);
      }
    }
  } finally {
    for (const m of pending) apply(AS_POSTGRES, m.path);
  }
  if (vacuous.length) { console.error(`✗ ${vacuous.length} rehearsal(s) hold without their migration:\n  ${vacuous.join('\n  ')}`); process.exit(1); }
  console.log(`✓ ${pairs.length} pending migration(s) with a rehearsal, each rehearsal failing without its own; every one applied again.`);
};

/** The verdict and the picks must be able to say no, on this database. */
const selfTest = () => {
  const fixtures = join(HERE, 'fixtures', 'rehearsals');
  const expect = [['holds_rehearsal.sql', 0], ['misses_a_case_rehearsal.sql', 'fail'],
    ['finds_nothing_rehearsal.sql', 'fail'], ['runs_no_case_rehearsal.sql', 'fail']];
  const wrong = [];
  for (const [f, want] of expect) {
    const r = psql(AS_POSTGRES, join(fixtures, f));
    const ok = want === 0 ? r.status === 0 : r.status !== 0 && /REHEARSAL (FAILED|CANNOT RUN)/.test(r.out);
    console.log(`→ ${f}: exit ${r.status} ${ok ? '(as it must)' : '(WRONG)'}`);
    if (!ok) wrong.push(`${f}: ${r.out.split('\n').slice(-3).join(' / ')}`);
  }
  if (wrong.length) { console.error(`✗ self-test:\n  ${wrong.join('\n  ')}`); process.exit(1); }
  console.log('✓ self-test: a rehearsal that holds passes; a miss, an empty pick and no case at all each fail.');
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--self-test')) selfTest();
  else if (process.argv.includes('--without')) without();
  else run();
}
