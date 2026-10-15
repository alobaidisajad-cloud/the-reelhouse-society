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
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** Every rehearsal in the folder, by name. */
export const rehearsals = () => readdirSync(DIAGNOSTICS).filter((f) => f.endsWith('_rehearsal.sql')).sort();

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
  if (process.argv.includes('--self-test')) selfTest(); else run();
}
