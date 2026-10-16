#!/usr/bin/env node
/**
 * shards.mjs — which flows one machine of the sealed E2E runs.
 *
 *   node mobile/e2e/shards.mjs <map> <i/N> [flow files…]
 *
 * e2e.yml builds the app once and runs its flows on N machines; e2e/shards.json
 * says which flows each runs, and which one runs the keyboard probes and the
 * launch with animations on. For shard i of N this prints its plan, for
 * run-flows.sh: `probes yes|no`, `launch yes|no`, one `flow <file>` per flow
 * (in the order given), and a `notice <text>` for anything out of the map.
 *
 * Nothing is skipped in silence. A flow file the map does not name (a shipped
 * client's flows can differ from this app's) runs in the last shard, and says
 * so; a flow the map names that is not among the files is said too.
 * shards.test.ts holds the map to mobile/.maestro: every flow in one shard.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

export const flowName = (file) => basename(file, '.yaml');

/** What is wrong with the map itself, whatever the flows: each problem in words. */
export function mapProblems(map) {
  const shards = map?.shards;
  if (!Array.isArray(shards) || shards.length === 0) return ['the map has no shards'];
  const problems = [];
  const where = new Map();
  shards.forEach((s, i) => {
    if (!Array.isArray(s?.flows)) { problems.push(`shard ${i + 1} has no list of flows`); return; }
    for (const f of s.flows) where.set(f, [...(where.get(f) ?? []), i + 1]);
  });
  for (const [f, at] of where) {
    if (at.length > 1) problems.push(`${f} is named ${at.length} times (shards ${at.join(', ')})`);
  }
  shards.forEach((s, i) => {
    if (s?.minutes !== undefined && !(Number.isInteger(s.minutes) && s.minutes > 0)) {
      problems.push(`shard ${i + 1}'s minutes are ${JSON.stringify(s.minutes)}, not a whole number above 0`);
    }
  });
  // A map that says where else they run (`probesElsewhere`: the fault runs', whose flows the
  // normal rounds' probes already cover) runs them in no shard; any other, in exactly one.
  const elsewhere = typeof map.probesElsewhere === 'string' && map.probesElsewhere.trim() !== '';
  for (const part of ['keyboardProbes', 'launchWithAnimations']) {
    const at = shards.flatMap((s, i) => (s?.[part] === true ? [i + 1] : []));
    if (elsewhere && at.length) problems.push(`${part} runs elsewhere (probesElsewhere), and is in shard ${at.join(', ')}`);
    if (!elsewhere && at.length !== 1) problems.push(`${part} must be in exactly one shard, and is in ${at.length ? at.join(', ') : 'none'}`);
  }
  return problems;
}

/** The map against the flows that exist: a flow in no shard, or a name with no flow. */
export function coverageProblems(map, flows) {
  const named = new Set((map.shards ?? []).flatMap((s) => s.flows ?? []));
  return [
    ...flows.filter((f) => !named.has(f)).map((f) => `${f} is in no shard`),
    ...[...named].filter((f) => !flows.includes(f)).map((f) => `${f} is named but is no flow`),
  ];
}

/** "i/N" for a map of N shards, or an Error saying why not. */
export function parseShard(spec, count) {
  const m = /^(\d+)\/(\d+)$/.exec(String(spec ?? '').trim());
  if (!m) return new Error(`E2E_SHARD is "${spec}": it must be "i/N"`);
  const [index, total] = [Number(m[1]), Number(m[2])];
  if (total !== count) return new Error(`E2E_SHARD is ${spec}, but the map has ${count} shards`);
  if (index < 1 || index > total) return new Error(`E2E_SHARD is ${spec}: no such shard`);
  return { index, total };
}

/** Shard i's part: its flow files in the order given, the probes, the launch, and notices. */
export function planShard(map, spec, files) {
  const problems = mapProblems(map);
  if (problems.length) return new Error(`the shard map is wrong: ${problems.join('; ')}`);
  const shard = parseShard(spec, map.shards.length);
  if (shard instanceof Error) return shard;
  const own = map.shards[shard.index - 1];
  const named = new Set(map.shards.flatMap((s) => s.flows));
  const last = shard.index === shard.total;
  const notices = [];
  const flows = files.filter((f) => {
    if (own.flows.includes(flowName(f))) return true;
    if (!last || named.has(flowName(f))) return false;
    notices.push(`${flowName(f)} is in no shard of the map, so it runs here, in the last`);
    return true;
  });
  const names = files.map(flowName);
  for (const f of own.flows.filter((n) => !names.includes(n))) {
    notices.push(`${f} is named for this shard but is not among the flows, so it is not run`);
  }
  return { ...shard, flows, probes: own.keyboardProbes === true, launch: own.launchWithAnimations === true, minutes: own.minutes, notices };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [mapFile, spec, ...files] = process.argv.slice(2);
  if (!mapFile || !spec) {
    console.error('usage: node mobile/e2e/shards.mjs <map> <i/N> [flow files…]');
    process.exit(2);
  }
  let map;
  try { map = JSON.parse(readFileSync(mapFile, 'utf8')); } catch (e) {
    console.log(`the shard map ${mapFile} could not be read: ${e.message}`);
    process.exit(1);
  }
  const plan = planShard(map, spec, files);
  if (plan instanceof Error) { console.log(plan.message); process.exit(1); }
  const out = [`probes ${plan.probes ? 'yes' : 'no'}`, `launch ${plan.launch ? 'yes' : 'no'}`];
  if (plan.minutes !== undefined) out.push(`minutes ${plan.minutes}`);
  for (const n of plan.notices) out.push(`notice ${n}`);
  for (const f of plan.flows) out.push(`flow ${f}`);
  console.log(out.join('\n'));
}
