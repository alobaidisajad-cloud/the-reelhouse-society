/**
 * whatTheAppAsked.test.ts — e2e/what-the-app-asked.mjs holds every request the gateway saw the app
 * make to scripts/backend-contract.json, the list the reading of the code made.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const SCRIPT = join(__dirname, '..', 'what-the-app-asked.mjs');
const CONTRACT = { rpcs: ['get_wall', { name: 'claim_seat', signature: 'claim_seat()' }], tables: ['logs', 'profiles'], edgeFunctions: ['tmdb-proxy'], buckets: ['avatars'] };
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'what-the-app-asked-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const line = (method: string, path: string, status: number | null = 200) => JSON.stringify({ id: 1, method, path, at: '2026-10-16T10:00:00.000Z', status, fault: null });
function judge(...lines: string[]) {
  writeFileSync(join(dir, 'gateway.jsonl'), lines.map((l) => `${l}\n`).join(''));
  writeFileSync(join(dir, 'contract.json'), JSON.stringify(CONTRACT));
  const r = spawnSync(process.execPath, [SCRIPT, join(dir, 'gateway.jsonl'), '--contract', join(dir, 'contract.json')], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout.trim() };
}

it('passes a run whose every request is on the list, the house\'s own services aside', () => {
  const r = judge(
    line('GET', '/rest/v1/logs?select=id,film_id&user_id=eq.u1'), line('POST', '/rest/v1/rpc/get_wall'), line('POST', '/rest/v1/rpc/claim_seat'),
    line('POST', '/functions/v1/tmdb-proxy'), line('GET', '/storage/v1/object/public/avatars/u1.jpg'), line('POST', '/storage/v1/object/avatars/u1.jpg'),
    line('POST', '/auth/v1/token?grant_type=password'), line('GET', '/realtime/v1/websocket?apikey=x', 101),
  );
  expect(r).toEqual({ status: 0, out: 'Every request the app made is on the list: 8 requests; 2 rpcs, 1 table, 1 function, 1 bucket, 2 services.' });
});

it('says no to a table, an RPC, a function or a bucket the list lacks, naming each', () => {
  const r = judge(line('GET', '/rest/v1/films'), line('POST', '/rest/v1/rpc/drop_everything'), line('POST', '/functions/v1/notify-push'), line('GET', '/storage/v1/object/public/backdrops/x.jpg'), line('GET', '/rest/v1/films'));
  expect(r.status).toBe(1);
  expect(r.out.split('\n').slice(1).map((l) => l.trim())).toEqual([
    'GET /rest/v1/films: the table films is not on the list',
    'POST /rest/v1/rpc/drop_everything: the rpc drop_everything is not on the list',
    'POST /functions/v1/notify-push: the function notify-push is not on the list',
    'GET /storage/v1/object/public/backdrops/x.jpg: the bucket backdrops is not on the list',
  ]);
});

it('says no to a request that names no part of the house at all', () => {
  expect(judge(line('GET', '/graphql/v1')).out).toContain('GET /graphql/v1: no part of the house this list knows');
});

it('refuses to judge with no log, or a log with no request', () => {
  const none = spawnSync(process.execPath, [SCRIPT, join(dir, 'missing.jsonl')], { encoding: 'utf8' });
  expect(none.status).toBe(2);
  writeFileSync(join(dir, 'empty.jsonl'), '');
  expect(spawnSync(process.execPath, [SCRIPT, join(dir, 'empty.jsonl')], { encoding: 'utf8' }).status).toBe(2);
});

it('reads the real contract by default, and it holds what the app reads', () => {
  const code = `const m = await import(${JSON.stringify(pathToFileURL(SCRIPT).href)}); const c = JSON.parse((await import('node:fs')).readFileSync(${JSON.stringify(join(__dirname, '..', '..', 'scripts', 'backend-contract.json'))}, 'utf8')); console.log(JSON.stringify(m.judge([{ method: 'GET', path: '/rest/v1/logs' }, { method: 'GET', path: '/rest/v1/profiles' }], c)));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  expect(JSON.parse(r.stdout)).toEqual({ missing: [], seen: { rpc: 0, table: 2, function: 0, bucket: 0, service: 0 } });
});
