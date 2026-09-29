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
 * moment (the status bar and keyboard left out, so it fits an annotation). Where
 * Maestro kept no screen, `<hierarchy dir>/<flow>.json` (read by the runner as the
 * flow failed). From `<hierarchy dir>/<flow>.log`, the device's log for that flow
 * alone: what Android and the app said, and what Android drew but called invisible.
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
    const system = id.startsWith('com.android.systemui') || id.includes('inputmethod');
    if ((id || text || label) && !system) {
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

/** The device's log for `flow` alone, as the runner kept it; null when it did not. */
function flowLog(flow) {
  const file = hierarchyDir && join(hierarchyDir, `${flow}.log`);
  return file && existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : null;
}

// A hang or a crash, whoever reports it, and the app's own warnings and errors,
// less the one React Native repeats on every screen of an edge-to-edge app.
const SAID = /ANR in|not responding|unresponsive|Input dispatching timed out|FATAL EXCEPTION|\s[EWF] (ReactNativeJS|ReactNative|unknown:ReactNative|AndroidRuntime)\s*:/;
const NOISE = /StatusBarModule: Ignored status bar change/;

/** What Android and the app said during the flow: its last hangs, crashes, errors and warnings. */
function saidRead(flow) {
  const log = flowLog(flow);
  if (!log) return ['(the log was not kept)'];
  const said = [...new Set(log.filter((l) => SAID.test(l) && !NOISE.test(l) && !/\sMaestro\s*:/.test(l))
    .map((l) => l.replace(/^\d\d-\d\d (\d\d:\d\d:\d\d)\.\d+\s+\d+\s+\d+\s+/, '$1 ').slice(0, 160)))];
  if (!said.length) return ['(no hang, crash, error or warning)'];
  return said.length > 8 ? [`… ${said.length - 8} earlier`, ...said.slice(-8)] : said;
}

/** A line's time as milliseconds within its day, from "MM-DD HH:MM:SS.mmm". */
const clock = (line) => {
  const m = /^\d\d-\d\d (\d\d):(\d\d):(\d\d)\.(\d+)/.exec(line);
  return m ? ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4].slice(0, 3).padEnd(3, '0') : NaN;
};

/**
 * The app's elements Android called not visible to the user (outside its
 * parent, transparent, covered) on the screen the flow failed on. Maestro's
 * driver logs each one it skips ("Skipping invisible child", tag Maestro) every
 * time it reads the screen, and does not look inside one, so a hidden box shows
 * here with its rows unnamed. Only the last reading (its final two seconds) is
 * kept; empty boxes (nothing to see, or scrolled off) are left out; named
 * elements come first, then the rest, each largest first.
 */
function hiddenRead(flow) {
  const log = flowLog(flow);
  if (!log) return ['(the log was not kept)'];
  const field = (line, name) => {
    const v = new RegExp(`\\b${name}: ([^;]*)`).exec(line)?.[1]?.trim();
    return v && v !== 'null' ? v : '';
  };
  const lines = log.filter((l) => l.includes('Skipping invisible child'));
  if (!lines.length) return ['(the driver skipped nothing as invisible)'];
  const last = Math.max(...lines.map(clock).filter((t) => !Number.isNaN(t)));
  const named = new Map();
  const unnamed = new Map();
  for (const line of lines) {
    if (clock(line) < last - 2000) continue;
    if (field(line, 'packageName') !== 'com.reelhouse.society') continue;
    const where = field(line, 'boundsInScreen');
    const [l, t, r, b] = (/Rect\((-?\d+), (-?\d+) - (-?\d+), (-?\d+)\)/.exec(where) ?? []).slice(1).map(Number);
    const area = Math.max(0, r - l) * Math.max(0, b - t);
    if (!area) continue;
    const id = field(line, 'viewIdResName');
    const text = field(line, 'text');
    const what = [id && `#${id}`, text && `"${text.slice(0, 40)}"`].filter(Boolean).join(' ');
    (what ? named : unnamed).set(`${what || field(line, 'className').replace(/^.*\./, '')} ${where}`, area);
  }
  const bySize = (m) => [...m].sort((x, y) => y[1] - x[1]).map(([k]) => k);
  const all = [...bySize(named), ...bySize(unnamed)];
  if (!all.length) return ['(none of the app: only other apps, or empty boxes)'];
  return all.length > 8 ? [...all.slice(0, 8), `… and ${all.length - 8} more`] : all;
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
      said: saidRead(flow),
      hidden: hiddenRead(flow),
    });
  }
  groups.get(key).flows.push(flow);
}

for (const g of groups.values()) {
  const [first, ...rest] = g.flows.sort();
  const lines = [
    `${g.flows.join(', ')}: failed at ${g.where}`,
    `why: ${g.why}`,
    // Before the screen, whose long list the annotation cuts short.
    `said during the flow${rest.length ? ` (${first}'s)` : ''}:`,
    ...g.said,
    `drawn but called invisible by Android${rest.length ? ` (${first}'s)` : ''}:`,
    ...g.hidden,
    `on the screen then${rest.length ? ` (${first}'s)` : ''}:`,
    ...g.screen,
  ];
  // No spaces: run-flows.sh reads these names off a word-split list.
  const out = join(outDir, `${first}${rest.length ? `-and-${rest.length}-more` : ''}.txt`);
  writeFileSync(out, lines.join('\n') + '\n');
  console.log(out);
}
