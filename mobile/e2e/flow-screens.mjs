#!/usr/bin/env node
/**
 * flow-screens.mjs — each failed flow, at the moment it failed.
 *
 *   node e2e/flow-screens.mjs <maestro --debug-output dir> <out dir>
 *
 * The run used to report ONE screen: the one left on the emulator after every
 * flow had finished — the last flow's, whichever failed. Eleven flows failed
 * for two different reasons and the page showed one of them. Maestro's debug
 * output keeps, per flow, every command it ran, its status, its error and (on
 * failure) the screen's hierarchy at that instant; this writes one file per
 * failed flow — `<out>/<flow>.txt`: the command that failed, why, and the app's
 * own elements on screen then (the system's status bar left out, so the part
 * that matters fits an annotation).
 *
 * Prints the files it wrote, one per line. Reads nothing it cannot find: a flow
 * with no hierarchy says so rather than going silent.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const [debugDir, outDir] = process.argv.slice(2);
if (!debugDir || !outDir) {
  console.error('usage: node e2e/flow-screens.mjs <maestro-debug dir> <out dir>');
  process.exit(2);
}
if (!existsSync(debugDir)) process.exit(0);
mkdirSync(outDir, { recursive: true });

const files = [];
const walk = (d) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/^commands-.*\.json$/.test(e)) files.push(p);
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

/** A command, as a person would read it: its kind and what it pointed at. */
function nameOf(command) {
  const [kind, body] = Object.entries(command ?? {}).find(([, v]) => v) ?? ['command', {}];
  const target = body?.selector ?? body?.condition?.visible ?? body?.condition?.notVisible ?? body;
  const bits = [target?.idRegex && `id ${target.idRegex}`, target?.textRegex && `"${target.textRegex}"`, body?.text && `"${String(body.text).slice(0, 40)}"`, body?.link && body.link].filter(Boolean);
  return `${kind.replace(/Command$/, '')}${bits.length ? ` (${bits.join(', ')})` : ''}`;
}

for (const f of files) {
  let entries;
  try { entries = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
  if (!Array.isArray(entries)) continue;
  const failed = entries.find((e) => e?.metadata?.status === 'FAILED');
  if (!failed) continue;
  const flow = basename(f).replace(/^commands-\(?/, '').replace(/\)?\.json$/, '');
  const done = entries.filter((e) => e?.metadata?.status === 'COMPLETED').length;
  const lines = [
    `${flow}: failed at step ${done + 1} of ${entries.length} — ${nameOf(failed.command)}`,
    `why: ${failed.metadata?.error?.message ?? '(no message)'}`,
    'on the screen then:',
    ...(failed.metadata?.hierarchy ? describe(failed.metadata.hierarchy) : ['(Maestro kept no screen for this step)']),
  ];
  const out = join(outDir, `${flow}.txt`);
  writeFileSync(out, lines.join('\n') + '\n');
  console.log(out);
}
