#!/usr/bin/env node
/**
 * what-the-app-asked.mjs — every request the app really made, held to the list the reading of its
 * code made (WORKLIST P0.75): a table, an RPC, an edge function or a storage bucket the app asked
 * for that scripts/backend-contract.json lacks is a call no static check ever saw.
 *
 *   node e2e/what-the-app-asked.mjs <gateway log> [--contract <json>]
 *
 * The gateway log is the fault proxy's (e2e/fault-proxy.mjs --log): one JSON line per request. Auth
 * and the live channels are the house's own services, named by no list. Exit 1 when a request asks
 * for what the list lacks, or names no part of the house at all; exit 2 when the log is missing or
 * holds no request, which is no run to judge.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/** The storage API's words that come before a bucket's name, and are not one. */
const STORAGE_WORDS = new Set(['public', 'sign', 'authenticated', 'list', 'info', 'move', 'copy', 'upload', 'render', 'image']);

/** What a request asked for: its kind and name, or the house's own service, or nothing known. */
export function askedFor(path) {
  const p = path.split('?')[0];
  let m;
  if ((m = /^\/rest\/v1\/rpc\/([a-z0-9_]+)$/.exec(p))) return { kind: 'rpc', name: m[1] };
  if ((m = /^\/rest\/v1\/([a-z0-9_]+)$/.exec(p))) return { kind: 'table', name: m[1] };
  if ((m = /^\/functions\/v1\/([a-z0-9-]+)/.exec(p))) return { kind: 'function', name: m[1] };
  if ((m = /^\/storage\/v1\/(?:object|render)\/(.+)$/.exec(p))) {
    const bucket = m[1].split('/').find((s) => !STORAGE_WORDS.has(s));
    return bucket ? { kind: 'bucket', name: bucket } : { kind: 'unknown', name: p };
  }
  if (/^\/(auth|realtime)\/v1\//.test(p)) return { kind: 'service', name: p.split('/')[1] };
  return { kind: 'unknown', name: p };
}

/** Each request the list lacks, in words; and how many of each kind were seen. */
export function judge(requests, contract) {
  const lists = {
    rpc: new Set(contract.rpcs.map((r) => (typeof r === 'string' ? r : r.name))),
    table: new Set(contract.tables),
    function: new Set(contract.edgeFunctions),
    bucket: new Set(contract.buckets),
  };
  const seen = { rpc: new Set(), table: new Set(), function: new Set(), bucket: new Set(), service: new Set() };
  const missing = [];
  for (const r of requests) {
    const a = askedFor(r.path);
    if (a.kind === 'unknown') { missing.push(`${r.method} ${r.path}: no part of the house this list knows`); continue; }
    seen[a.kind].add(a.name);
    if (a.kind !== 'service' && !lists[a.kind].has(a.name)) missing.push(`${r.method} ${r.path}: the ${a.kind} ${a.name} is not on the list`);
  }
  return { missing: [...new Set(missing)], seen: Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, v.size])) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const logFile = argv[0];
  const i = argv.indexOf('--contract');
  const contractFile = i < 0 ? join(HERE, '..', 'scripts', 'backend-contract.json') : argv[i + 1];
  if (!logFile || !existsSync(logFile)) { console.log(`✗ no gateway log at ${logFile}: no run to judge`); process.exit(2); }
  const requests = readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  if (!requests.length) { console.log('✗ the gateway log holds no request: no run to judge'); process.exit(2); }
  const { missing, seen } = judge(requests, JSON.parse(readFileSync(contractFile, 'utf8')));
  const counts = Object.entries(seen).map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`).join(', ');
  if (!missing.length) { console.log(`Every request the app made is on the list: ${requests.length} requests; ${counts}.`); process.exit(0); }
  console.log(`✗ The app asked for what the reading of its code never saw (scripts/backend-contract.json):\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
