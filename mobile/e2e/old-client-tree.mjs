#!/usr/bin/env node
/**
 * old-client-tree.mjs — lays a shipped client's app over this checkout, for an
 * E2E run of that client against production as it will be.
 *
 *   node mobile/e2e/old-client-tree.mjs "TestFlight build 41"
 *
 * Everything under mobile/ is replaced by the client's own commit, except the
 * harness, which stays as this checkout has it: mobile/e2e (the sealed world,
 * run-flows.sh and the recordings), mobile/scripts (the snapshot check) and
 * mobile/supabase (production's shape, and the migrations still pending). Then
 * each patch mobile/e2e/old-clients.json lists for the client is laid over it
 * from its own commit, and each of its flows waits at least as long as this
 * checkout's same flow; nothing else: the record and the waits are the whole
 * difference.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import oldClients from './old-clients.cjs';

const { HARNESS, clientNamed, raiseWaits } = oldClients;

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE = join(HERE, '..');
const ROOT = join(MOBILE, '..');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e9 });

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const record = JSON.parse(readFileSync(join(MOBILE, 'e2e', 'old-clients.json'), 'utf8'));
  const { client, refuse } = clientNamed(record, process.argv[2]);
  if (refuse) { console.error(`REFUSED: ${refuse}`); process.exit(1); }
  const commits = [client.commit, ...(client.patches ?? []).map((p) => p.from)];
  git('fetch', '--quiet', '--depth', '1', 'origin', ...new Set(commits));
  for (const entry of readdirSync(MOBILE)) {
    if (!HARNESS.includes(entry)) rmSync(join(MOBILE, entry), { recursive: true, force: true });
  }
  git('checkout', client.commit, '--', 'mobile', ...HARNESS.map((h) => `:!mobile/${h}`));
  for (const p of client.patches ?? []) {
    git('checkout', p.from, '--', p.path);
    console.log(`  patched ${p.path} from ${p.from.slice(0, 8)}: ${p.why}`);
  }
  // Each of the client's flows waits at least as long as this checkout's same flow (old-clients.cjs, raiseWaits).
  const flows = new Set([
    ...git('ls-tree', '-r', '--name-only', client.commit, 'mobile/.maestro').split('\n'),
    ...(client.patches ?? []).map((p) => p.path),
  ].filter((f) => f.startsWith('mobile/.maestro/') && f.endsWith('.yaml')));
  for (const flow of [...flows].sort()) {
    let own;
    try { own = git('show', `HEAD:${flow}`); } catch { continue; }
    const { text, raised } = raiseWaits(readFileSync(join(ROOT, flow), 'utf8'), own);
    if (!raised.length) continue;
    writeFileSync(join(ROOT, flow), text);
    for (const r of raised) console.log(`  ${flow}: ${r.command} for "${r.waitsFor}" waits ${r.to} ms, as this checkout's (${r.from} in the client's)`);
  }
  console.log(`${client.name}: its app, from ${client.commit.slice(0, 8)}, over this checkout's harness.`);
}
