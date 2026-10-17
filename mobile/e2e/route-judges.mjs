#!/usr/bin/env node
/**
 * route-judges.mjs — whether the route walk (e2e/walk-routes.mjs) captured every route it planned.
 *
 *   node e2e/route-judges.mjs <walk dir>
 *
 * Reads <walk dir>/walk.tsv (each route, its link and its capture's name) and holds each capture
 * under <walk dir>/routes/ (Maestro's output folder for the walk, at any depth it chose) to be there
 * and to be a picture (a PNG, not an empty file). A route
 * with no capture is one the walk never reached: Maestro stopped before it, or the app did. A
 * crash or a freeze on the way is app-crashes.mjs's to name, from the same run's device log.
 *
 * Exit 0 when every route was captured; 1 naming each one that was not; 2 when there is no plan,
 * or a plan of no route.
 */
import { Buffer } from 'node:buffer';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** Where a capture of this name is under `root` (Maestro's output folder may nest it), or the path it should be at. */
export function findCapture(root, name) {
  const direct = join(root, name);
  if (!name || existsSync(direct) || !existsSync(root)) return direct;
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const found = findCapture(join(root, e.name), name);
    if (existsSync(found)) return found;
  }
  return direct;
}

/** Each planned route and moment, from the walk's list; `part`, of a moment the system draws part of. */
export const readPlan = (text) => text.split(/\r?\n/).filter(Boolean).map((l) => {
  const [file, link, capture, part] = l.split('\t');
  return { file, link, capture, ...(part ? { part } : {}) };
});

/** What is wrong with one capture, or null. */
export function captureFault(path) {
  if (!existsSync(path)) return 'not captured';
  if (statSync(path).size < 1024) return 'captured empty';
  const head = readFileSync(path).subarray(0, 4);
  return head.equals(PNG) ? null : 'captured as no picture';
}

/** Every route the walk planned and did not capture, in words. */
export const judge = (dir) => readPlan(readFileSync(join(dir, 'walk.tsv'), 'utf8'))
  .flatMap((r) => { const why = captureFault(findCapture(join(dir, 'routes'), r.capture ?? '')); return why ? [`${r.file} (${r.link}): ${why}`] : []; });

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dir = process.argv[2];
  if (!dir || !existsSync(join(dir, 'walk.tsv'))) {
    console.error('usage: node e2e/route-judges.mjs <walk dir>, which holds the plan (walk.tsv)');
    process.exit(2);
  }
  const plan = readPlan(readFileSync(join(dir, 'walk.tsv'), 'utf8'));
  if (plan.length === 0) {
    console.error('the walk planned no route: nothing was walked, so nothing is proven');
    process.exit(2);
  }
  const faults = judge(dir);
  for (const f of faults) console.log(`✗ ${f}`);
  console.log(faults.length ? `${faults.length} of ${plan.length} routes not captured` : `every route captured: ${plan.length}`);
  process.exit(faults.length ? 1 : 0);
}
