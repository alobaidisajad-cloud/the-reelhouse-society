#!/usr/bin/env node
/**
 * speed-record.mjs — every screen against its floor, and the app's start, memory, size and images.
 *
 *   node e2e/speed-record.mjs <device log>… [--history e2e/screen-history.json] [--cold <dir>]
 *        [--size <download-size json>] [--images <image-weight json>] [--json FILE] [--md FILE]
 *
 * A screen is at its floor when it waits on one round trip at most (none when it holds what it
 * draws) and draws within one frame of the answer. Per screen, from the device logs of a run
 * (critical-path.mjs, openingsOf):
 *   floor    one round trip, as long as this run's answers to that screen took (the median of
 *            every answer it waited on), when it waits on any; and one frame (FRAME_MS)
 *   now      the median of its openings' ready times in these logs; beside it the median of the
 *            recorded history (e2e/screen-history.json), many runs over
 *   gap      now less its floor: the time the screen spends past what the network and one frame
 *            cost, the work left for stage D
 *   trips    the most round trips in a row any opening waited on: over one is OVER its floor,
 *            and fails the record, named with that opening's requests
 * And the app as a whole: its cold start and its native memory once the first screen is ready
 * (cold-start.mjs, readMeasured: --cold, the measured launch's dir), its download by part
 * (scripts/download-size.cjs --json: --size) and the images it ships and asks for
 * (mockups/tools/image-weight.cjs --json: --images). Every cell holds a value or says why not.
 * Exits 1 when a screen waits on more than one round trip in a row, or no screen opened at all.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openingsOf } from './critical-path.mjs';
import { readMeasured } from './cold-start.mjs';

/** One frame of a 60 Hz screen: what a page may take, past its data, at its floor. */
export const FRAME_MS = 1000 / 60;
/** The most round trips in a row a page at its floor waits on. */
export const FLOOR_TRIPS = 1;

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) / 2; return s.length ? (s[Math.floor(i)] + s[Math.ceil(i)]) / 2 : null; };
const round = (v) => (v == null ? null : Math.round(v));

/** Per screen: its openings, floor, now, gap and trips; and each one over its floor. */
export function screensOf(openings, history = null) {
  const by = new Map();
  for (const o of openings) by.set(o.name, [...(by.get(o.name) ?? []), o]);
  const screens = [];
  const over = [];
  for (const [name, os] of [...by].sort(([a], [b]) => a.localeCompare(b))) {
    const answers = os.flatMap((o) => o.answers ?? []);
    const waits = os.some((o) => o.trips > 0);
    const trip = waits ? median(answers) : 0;
    const floor = (trip ?? 0) + FRAME_MS;
    const now = median(os.map((o) => o.ms));
    const recorded = history ? median(history.samples.filter((s) => s.screen === name).map((s) => s.median)) : null;
    const most = Math.max(...os.map((o) => o.trips));
    screens.push({ name, opened: os.length, trip: round(trip), floor: round(floor), now: round(now), recorded: round(recorded),
      gap: round(now - floor), trips: most, afterAnswer: round(median(os.map((o) => o.phone))) });
    if (most > FLOOR_TRIPS) {
      const deepest = os.find((o) => o.trips === most);
      over.push(`${name}: ${most} round trips in a row, its floor allows ${FLOOR_TRIPS} (${deepest.paths.join(' | ')})`);
    }
  }
  return { screens, over };
}

/** The app as a whole: each measure's value, or why it has none. */
export function wholeOf({ cold = null, size = null, images = null } = {}) {
  const m = cold ? readMeasured(cold) : null;
  const not = (why) => ({ value: null, why: `not measured: ${why}` });
  return {
    coldStart: m?.totalTime != null ? { value: m.totalTime, unit: 'ms', from: 'am start-activity -W TotalTime' } : not(cold ? `no TotalTime in ${cold}/cold-am.txt` : 'no --cold dir given'),
    memory: m?.nativeKb != null ? { value: Math.round(m.nativeKb / 1024), unit: 'MB', from: 'dumpsys meminfo Native Heap, the first screen ready' } : not(cold ? `no Native Heap in ${cold}/cold-meminfo.txt` : 'no --cold dir given'),
    download: size ? { value: size.total, unit: 'bytes', parts: size.parts, from: size.from } : not('no --size record given (scripts/download-size.cjs --json)'),
    images: images ? { value: images.shipped?.bytes ?? null, unit: 'bytes shipped', asked: images.asked, from: 'mockups/tools/image-weight.cjs' } : not('no --images record given (mockups/tools/image-weight.cjs --json)'),
  };
}

export function markdown(rec) {
  const cell = (v, unit = 'ms') => (v == null ? '—' : `${v}${unit ? ` ${unit}` : ''}`);
  const lines = ['| Screen | Opened | Trips in a row | One trip | Floor | Now | Recorded | Gap | After its answer |', '|---|---|---|---|---|---|---|---|---|'];
  for (const s of rec.screens) lines.push(`| ${s.name} | ${s.opened} | ${s.trips}${s.trips > FLOOR_TRIPS ? ' OVER' : ''} | ${cell(s.trip)} | ${cell(s.floor)} | ${cell(s.now)} | ${cell(s.recorded)} | ${cell(s.gap)} | ${cell(s.afterAnswer)} |`);
  lines.push('', '| The app | Value | From |', '|---|---|---|');
  for (const [k, v] of Object.entries(rec.whole)) lines.push(`| ${k} | ${v.value == null ? v.why : `${v.value} ${v.unit}`} | ${v.from ?? ''} |`);
  return `${lines.join('\n')}\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argv = process.argv.slice(2);
  const flags = new Set(['--history', '--cold', '--size', '--images', '--json', '--md']);
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const logs = argv.filter((a, i) => !a.startsWith('--') && !flags.has(argv[i - 1]));
  if (!logs.length) { console.error('usage: node e2e/speed-record.mjs <device log>… [--history F] [--cold DIR] [--size F] [--images F] [--json F] [--md F]'); process.exit(2); }
  const read = (f) => (f && existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);
  const openings = logs.flatMap((f) => openingsOf(readFileSync(f, 'utf8').split('\n')));
  const { screens, over } = screensOf(openings, read(opt('--history')));
  const rec = { screens, over, whole: wholeOf({ cold: opt('--cold'), size: read(opt('--size')), images: read(opt('--images')) }) };
  if (opt('--json')) writeFileSync(opt('--json'), `${JSON.stringify(rec, null, 2)}\n`);
  if (opt('--md')) writeFileSync(opt('--md'), markdown(rec));
  console.log(markdown(rec));
  if (!screens.length) { console.error('no screen opened in these logs: nothing to hold to its floor'); process.exit(1); }
  if (over.length) { console.error(`Over the floor:\n  ${over.join('\n  ')}`); process.exit(1); }
}
