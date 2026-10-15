#!/usr/bin/env node
/**
 * shard-verdict.mjs — what no one shard of the sealed E2E can judge alone.
 *
 *   node mobile/e2e/shard-verdict.mjs <logs dir> --shards <N> --name <folder, {i} for the shard>
 *        --ceilings <json> --flows <flows folder>
 *
 * e2e.yml runs the flows on N machines (e2e/shards.json), and each keeps its
 * logs in its own folder under <logs dir>. Each shard judges its own device:
 * crashes, the splash, screen times, the keyboard's room. Read together here:
 *   - every shard kept its logs, wrote the list of flows it ran (flows-run.txt)
 *     and reached its end (the record screen-times.mjs writes with --record);
 *   - every flow in the folder ran in exactly one shard;
 *   - when every shard ran every flow to its end, every screen with a ceiling
 *     reported in some shard: a ceiling no shard measured was renamed, or no
 *     flow reaches it any more. A shard cut short is failed by its own job,
 *     and this rule waits for a whole run, as screen-times' --complete does.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** One shard's records from its kept logs; null for each it did not write. */
export function readShard(folder) {
  if (!existsSync(folder)) return { logs: false, flows: null, record: null };
  const list = join(folder, 'flows-run.txt');
  const rec = join(folder, 'screen-record.json');
  let record = null;
  try { record = existsSync(rec) ? JSON.parse(readFileSync(rec, 'utf8')) : null; } catch { record = null; }
  if (!Array.isArray(record?.reported)) record = null;
  return {
    logs: true,
    flows: existsSync(list) ? readFileSync(list, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : null,
    record,
  };
}

/** The verdict on N shards' records: lines to print, and each problem in words. */
export function judge(shards, { ceilings, flows }) {
  const total = shards.length;
  const problems = [];
  const lines = [];
  shards.forEach((s, i) => {
    const name = `shard ${i + 1}/${total}`;
    if (!s.logs) { problems.push(`${name} kept no logs: it never ran, or ended before they were kept`); return; }
    if (!s.flows) problems.push(`${name} did not finish: it wrote no list of the flows it ran`);
    if (!s.record) problems.push(`${name} did not finish: it wrote no record of its screens`);
    const ran = s.flows ? `${s.flows.length} flow${s.flows.length === 1 ? '' : 's'}` : 'no list of flows';
    const screens = s.record ? `${s.record.reported.length} screens reported` : 'no record of screens';
    const whole = s.record ? (s.record.complete ? 'every flow ran to its end' : 'cut short') : '';
    lines.push(`${name}: ${ran}, ${screens}${whole ? `, ${whole}` : ''}`);
  });

  const where = new Map();
  shards.forEach((s, i) => { for (const f of s.flows ?? []) where.set(f, [...(where.get(f) ?? []), i + 1]); });
  const everyList = shards.every((s) => s.flows);
  for (const f of flows) {
    const at = where.get(f) ?? [];
    if (at.length > 1) problems.push(`${f} ran in shards ${at.join(', ')}: a flow runs in one`);
    if (at.length === 0 && everyList) problems.push(`${f} ran in no shard`);
  }
  for (const f of [...where.keys()].filter((n) => !flows.includes(n))) {
    problems.push(`${f} ran in shard ${where.get(f).join(', ')} but is not among the flows: the shards ran another tree`);
  }

  const whole = shards.every((s) => s.record?.complete === true);
  if (whole) {
    const reported = new Set(shards.flatMap((s) => s.record.reported));
    for (const name of Object.keys(ceilings).sort()) {
      if (!reported.has(name)) problems.push(`${name} has a ceiling but no shard reported it: renamed, or no flow reaches it`);
    }
  } else {
    lines.push('(a ceiling no shard reported is not judged: a shard did not run every flow to its end)');
  }
  return { lines, problems };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const at = args.indexOf(name);
    return at === -1 ? null : args.splice(at, 2)[1];
  };
  const total = Number(flag('--shards'));
  const template = flag('--name');
  const ceilingsFile = flag('--ceilings');
  const flowsDir = flag('--flows');
  const dir = args[0];
  if (!dir || !Number.isInteger(total) || total < 1 || !template?.includes('{i}') || !ceilingsFile || !flowsDir) {
    console.error('usage: node mobile/e2e/shard-verdict.mjs <logs dir> --shards <N> --name <folder with {i}>'
      + ' --ceilings <json> --flows <flows folder>');
    process.exit(2);
  }
  const shards = Array.from({ length: total }, (_, i) => readShard(join(dir, template.replace('{i}', String(i + 1)))));
  const flows = readdirSync(flowsDir).filter((f) => f.endsWith('.yaml') && f !== 'config.yaml')
    .map((f) => f.replace(/\.yaml$/, '')).sort();
  const { lines, problems } = judge(shards, { ceilings: JSON.parse(readFileSync(ceilingsFile, 'utf8')), flows });
  console.log(lines.join('\n'));
  for (const p of problems) console.log(`✗ ${p}`);
  process.exit(problems.length ? 1 : 0);
}
