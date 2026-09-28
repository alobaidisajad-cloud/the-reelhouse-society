#!/usr/bin/env node
/**
 * flow-screens.mjs — each failed flow, at the moment it failed.
 *
 *   node e2e/flow-screens.mjs <maestro --debug-output dir> <out dir> [<hierarchy dir>]
 *
 * The screen left at the end is only the last flow's. Maestro's debug output
 * keeps, per flow, each command, its status, its error and (on failure) the
 * screen's hierarchy then; this writes one `<out>/<flow>.txt` per failed flow:
 * the command that failed, why, and the app's own elements on screen at that
 * moment (the status bar left out, so it fits an annotation). Where Maestro kept
 * no screen, `<hierarchy dir>/<flow>.json` (read by the runner as the flow failed).
 *
 * Flows that failed at the same step for the same reason share ONE file, which
 * names them all: a job step carries at most ten notices, and seven flows
 * failing alike must not crowd out the three that failed differently. A step
 * that never finished (no FAILED record, as when a command hangs) is reported
 * as the step that did not finish.
 *
 * Prints the files it wrote, one per line. Reads nothing it cannot find: a flow
 * with no hierarchy says so rather than going silent.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const [debugDir, outDir, hierarchyDir] = process.argv.slice(2);
if (!debugDir || !outDir) {
  console.error('usage: node e2e/flow-screens.mjs <maestro-debug dir> <out dir> [<hierarchy dir>]');
  process.exit(2);
}
if (!existsSync(debugDir)) process.exit(0);
mkdirSync(outDir, { recursive: true });

const files = [];
const walk = (d) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/^commands.*\.json$/.test(e)) files.push(p);
  }
};
walk(debugDir);

/** The app's elements, top to bottom: id, text and label — as screen.mjs prints them. */
function describe(tree) {
  const rows = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    const a = node.attributes ?? {};
    const id = a['resource-id'] || a.resourceId || '';
    const text = (a.text || '').trim();
    const label = (a.accessibilityText || a['content-desc'] || '').trim();
    const top = Number(/\[\d+,(\d+)\]/.exec(a.bounds || '')?.[1] ?? 0);
    if ((id || text || label) && !id.startsWith('com.android.systemui')) {
      const parts = [];
      if (id) parts.push(`#${id}`);
      if (text) parts.push(`"${text.slice(0, 60)}"`);
      if (label && label !== text) parts.push(`[${label.slice(0, 60)}]`);
      rows.push([top, parts.join(' ')]);
    }
    for (const c of node.children ?? []) visit(c);
  };
  visit(tree);
  const seen = new Set();
  return rows.sort((x, y) => x[0] - y[0]).map(([, r]) => r).filter((r) => !seen.has(r) && seen.add(r));
}

/** The screen the runner read as `flow` failed, when Maestro kept none. */
function screenRead(flow) {
  const file = hierarchyDir && join(hierarchyDir, `${flow}.json`);
  try {
    const rows = describe(JSON.parse(readFileSync(file, 'utf8')));
    return rows.length ? rows : ['(nothing on screen had an id, a text or a label)'];
  } catch {
    return ['(no screen was kept for this step, nor read as the flow failed)'];
  }
}

/** A command, as a person would read it: its kind and what it pointed at. */
function nameOf(command) {
  const [kind, body] = Object.entries(command ?? {}).find(([, v]) => v) ?? ['command', {}];
  const target = body?.selector ?? body?.condition?.visible ?? body?.condition?.notVisible ?? body;
  const bits = [target?.idRegex && `id ${target.idRegex}`, target?.textRegex && `"${target.textRegex}"`, body?.text && `"${String(body.text).slice(0, 40)}"`, body?.link && body.link].filter(Boolean);
  return `${kind.replace(/Command$/, '')}${bits.length ? ` (${bits.join(', ')})` : ''}`;
}

const groups = new Map();
for (const f of files) {
  let entries;
  try { entries = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
  if (!Array.isArray(entries)) continue;
  const status = (e) => e?.metadata?.status;
  const failed = entries.find((e) => status(e) === 'FAILED')
    ?? entries.find((e) => status(e) && status(e) !== 'COMPLETED' && status(e) !== 'SKIPPED');
  if (!failed) continue;
  // Named `commands-(<flow>)`, or plain `commands` inside the flow's own folder.
  const own = basename(f).replace(/^commands-?\(?/, '').replace(/\)?\.json$/, '');
  const flow = own || basename(join(f, '..'));
  const done = entries.filter((e) => status(e) === 'COMPLETED').length;
  const where = `step ${done + 1} of ${entries.length} — ${nameOf(failed.command)}`;
  const why = failed.metadata?.error?.message
    ?? (status(failed) === 'FAILED' ? '(no message)' : `the step never finished (${status(failed)})`);
  const key = `${where}|${why}`;
  if (!groups.has(key)) {
    groups.set(key, {
      flows: [], where, why,
      screen: failed.metadata?.hierarchy ? describe(failed.metadata.hierarchy) : screenRead(flow),
    });
  }
  groups.get(key).flows.push(flow);
}

for (const g of groups.values()) {
  const [first, ...rest] = g.flows.sort();
  const lines = [
    `${g.flows.join(', ')}: failed at ${g.where}`,
    `why: ${g.why}`,
    `on the screen then${rest.length ? ` (${first}'s)` : ''}:`,
    ...g.screen,
  ];
  // No spaces: run-flows.sh reads these names off a word-split list.
  const out = join(outDir, `${first}${rest.length ? `-and-${rest.length}-more` : ''}.txt`);
  writeFileSync(out, lines.join('\n') + '\n');
  console.log(out);
}
