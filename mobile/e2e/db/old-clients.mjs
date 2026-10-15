#!/usr/bin/env node
/**
 * old-clients.mjs — every client in members' hands, against production as it
 * will be.
 *
 * Run in db-integration.yml after up-down-up.mjs has applied every pending
 * migration to production's shape. The database is snapshotted (the proposed
 * schema), and for each client mobile/e2e/old-clients.json marks as checked,
 * its own commit is checked out beside this one, the proposed snapshot is laid
 * into it, and its own copies of the three tests that hold a client to the
 * schema are run there:
 *   aQueryAsksOnlyForWhatExists  every query's table, columns and filters exist
 *   everyNameAClientCallsExists  every table, function and bucket it names exists
 *   backendContract              every function it calls exists, as it calls it
 * A change that breaks a build already shipped fails here, before any train.
 *
 * Only those tests can say a client breaks. A client that could not be set up
 * (its commit fetched, its packages installed) was not judged, and is said so:
 * the run fails, naming the step, never blaming the schema. Its install is
 * tried once more, as every install in a scheduled run is.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import oldClients from '../old-clients.cjs';

const { toCheck } = oldClients;

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE = join(HERE, '..', '..');
const ROOT = join(MOBILE, '..');
const TESTS = ['src/services/__tests__/aQueryAsksOnlyForWhatExists.test.ts',
  'src/services/__tests__/everyNameAClientCallsExists.test.ts', '__tests__/backendContract.test.ts'];
const SNAPSHOT = ['live-schema.sql', 'live-extensions.sql', 'live-outside-public.sql'];

/**
 * One client's verdict: 'held' (its tests passed), 'breaks' (they failed) or
 * 'unchecked' with the step it could not get past. `run` runs a command and
 * gives its exit status; `fresh` is whether its checkout must be made first.
 */
export function checkClient({ fresh, run, lay }) {
  if (fresh) {
    if (run('git', ['fetch', '--quiet', '--depth', '1', 'origin']) !== 0) return { verdict: 'unchecked', step: 'fetching its commit' };
    if (run('git', ['worktree', 'add', '--detach']) !== 0) return { verdict: 'unchecked', step: 'checking out its commit' };
  }
  lay();
  const install = () => run('npm', ['ci', '--no-audit', '--no-fund', '--ignore-scripts']);
  if (install() !== 0 && install() !== 0) return { verdict: 'unchecked', step: 'installing its packages (tried twice)' };
  return run('npx', ['jest', '--ci', ...TESTS]) === 0 ? { verdict: 'held' } : { verdict: 'breaks' };
}

/** The run's last words, and whether it passes. */
export function summary(results) {
  const breaks = results.filter((r) => r.verdict === 'breaks').map((r) => r.name);
  const unchecked = results.filter((r) => r.verdict === 'unchecked').map((r) => `${r.name} (${r.step})`);
  const lines = [];
  if (breaks.length) lines.push(`✗ Production as it will be breaks: ${breaks.join(', ')}`);
  if (unchecked.length) lines.push(`✗ Not checked, so not known to hold: ${unchecked.join(', ')}`);
  if (!lines.length) lines.push(`✓ ${results.length} client(s) in members' hands ask only for what production will have.`);
  return { lines, ok: !breaks.length && !unchecked.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const record = JSON.parse(readFileSync(join(MOBILE, 'e2e', 'old-clients.json'), 'utf8'));
  const clients = toCheck(record);
  const proposed = mkdtempSync(join(tmpdir(), 'proposed-'));
  const sh = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, stdio: 'inherit', env: process.env }).status ?? 1;
  console.log('→ the proposed schema: production with every pending migration applied');
  if (sh('node', [join(MOBILE, 'scripts', 'schema-snapshot.mjs')], MOBILE) !== 0) {
    console.error('\n✗ The proposed schema could not be snapshotted: no client was checked');
    process.exit(1);
  }
  for (const f of SNAPSHOT) cpSync(join(MOBILE, 'supabase', 'schema', f), join(proposed, f));
  const results = clients.map((c) => {
    const dir = join(tmpdir(), `old-${c.commit.slice(0, 8)}`);
    console.log(`\n→ ${c.name} (${c.commit.slice(0, 8)})`);
    const run = (cmd, args) => {
      if (cmd === 'git' && args[0] === 'fetch') return sh(cmd, [...args, c.commit], ROOT);
      if (cmd === 'git' && args[0] === 'worktree') return sh(cmd, [...args, dir, c.commit], ROOT);
      return sh(cmd, args, join(dir, 'mobile'));
    };
    const lay = () => { for (const f of SNAPSHOT) cpSync(join(proposed, f), join(dir, 'mobile', 'supabase', 'schema', f)); };
    return { name: c.name, ...checkClient({ fresh: !existsSync(dir), run, lay }) };
  });
  const { lines, ok } = summary(results);
  for (const l of lines) (ok ? console.log : console.error)(`\n${l}`);
  process.exit(ok ? 0 : 1);
}
