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
 */
import { execFileSync } from 'node:child_process';
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

const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', env: process.env });

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const record = JSON.parse(readFileSync(join(MOBILE, 'e2e', 'old-clients.json'), 'utf8'));
  const clients = toCheck(record);
  const proposed = mkdtempSync(join(tmpdir(), 'proposed-'));
  console.log('→ the proposed schema: production with every pending migration applied');
  sh('node', [join(MOBILE, 'scripts', 'schema-snapshot.mjs')], MOBILE);
  for (const f of SNAPSHOT) cpSync(join(MOBILE, 'supabase', 'schema', f), join(proposed, f));
  const failed = [];
  for (const c of clients) {
    const dir = join(tmpdir(), `old-${c.commit.slice(0, 8)}`);
    console.log(`\n→ ${c.name} (${c.commit.slice(0, 8)})`);
    try {
      if (!existsSync(dir)) {
        sh('git', ['fetch', '--quiet', '--depth', '1', 'origin', c.commit], ROOT);
        sh('git', ['worktree', 'add', '--detach', dir, c.commit], ROOT);
      }
      for (const f of SNAPSHOT) cpSync(join(proposed, f), join(dir, 'mobile', 'supabase', 'schema', f));
      sh('npm', ['ci', '--no-audit', '--no-fund', '--ignore-scripts'], join(dir, 'mobile'));
      sh('npx', ['jest', '--ci', ...TESTS], join(dir, 'mobile'));
    } catch {
      failed.push(c.name);
    }
  }
  if (failed.length) { console.error(`\n✗ Production as it will be breaks: ${failed.join(', ')}`); process.exit(1); }
  console.log(`\n✓ ${clients.length} client(s) in members' hands ask only for what production will have.`);
}
