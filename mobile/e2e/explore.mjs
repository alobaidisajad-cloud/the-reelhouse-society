#!/usr/bin/env node
/**
 * explore.mjs — the explorer: every route opened on the Android emulator, then poked at random —
 * taps, a turn of the phone, a trip to the background and back, a bad network — and every screen it
 * reaches read for crashes, screen-reader faults, overlaps and console errors.
 *
 *   node e2e/explore.mjs <out dir> [--seed N] [--taps N] [--routes a,b] [--proxy http://127.0.0.1:54331]
 *
 * Built on the route walk (walk-routes.mjs): its routes (e2e/routes.json) and the ids the sealed
 * world's seed made (readIds, through API_URL and SERVICE_ROLE_KEY of a local stack alone), as the
 * seeded member, signed in already on the emulator adb reaches. For each route, in the list's order:
 * the app stopped and the route opened cold by its link, then TAPS actions chosen by a seeded random
 * walk (PLAN: mostly a tap on a control the screen holds, sometimes the phone turned and turned back,
 * the app sent home and brought back, or the back key), each followed by a read of the screen
 * (uiautomator) and of the device log since. The second half of each route's actions run on a bad
 * network, cleared after: with --proxy (the fault proxy's control port, where the app reaches the
 * house through it) the plan's EDGE, 3000 ± 1000 ms and 20 KB/s; without, the emulator's own EDGE
 * speed and GPRS delay, on every host. The same seed walks the same way, so a fault found can be
 * walked again.
 *
 * A read's faults (faultsOf):
 *   NAMELESS  a control a screen reader can only call "button": clickable, with no words or label
 *             of its own or beneath it
 *   OVERLAP   two words drawn over each other: two text nodes with no parent between them whose
 *             boxes share over a third of the smaller
 *   OFF       words running off the side of the screen
 * The log's (logFaults): CRASH (the app's process died: AndroidRuntime FATAL, or no process left),
 * ERROR (console.error, or an uncaught error, from the app's JavaScript). A failed read said on a
 * slow network is the screen doing its job, never an ERROR. Writes <out dir>/explore.json and
 * prints each fault with the route, the action and the read's file; exits 1 on any.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nodesOf } from './lab/feel.mjs';
import { plan as walkPlan, readIds } from './walk-routes.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PKG = 'com.reelhouse.society';

/** The walk's chances, of a hundred: the rest are taps. */
export const PLAN = { turn: 8, home: 8, back: 10 };

/** A small seeded random number source: the same seed, the same walk. */
export function prng(seed) {
  // The seed spread over all 32 bits first, and the first draws thrown away: xorshift started from
  // a small seed gives small numbers for its first few.
  let s = Math.imul(seed >>> 0, 2654435761) >>> 0 || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 0; i < 16; i++) next();
  return next;
}

/** The next action on a screen: a tap on one of its controls, a turn, a trip home, or back. */
export function nextAction(rand, xml) {
  const roll = rand() * 100;
  if (roll < PLAN.turn) return { kind: 'turn' };
  if (roll < PLAN.turn + PLAN.home) return { kind: 'home' };
  if (roll < PLAN.turn + PLAN.home + PLAN.back) return { kind: 'back' };
  const nodes = nodesOf(xml);
  const screen = nodes[0]?.bounds;
  const controls = nodes.filter((n) => n.clickable && screen && n.bounds[2] - n.bounds[0] >= 8 && n.bounds[3] - n.bounds[1] >= 8
    && n.bounds[1] >= screen[1] && n.bounds[3] <= screen[3]);
  if (!controls.length) return { kind: 'back' };
  const n = controls[Math.floor(rand() * controls.length)];
  return { kind: 'tap', at: [Math.round((n.bounds[0] + n.bounds[2]) / 2), Math.round((n.bounds[1] + n.bounds[3]) / 2)], name: n.name || n.cls };
}

/** The faults one read of the screen shows: NAMELESS, OVERLAP, OFF. */
export function faultsOf(xml) {
  const faults = [];
  // The tree, with each node's depth, so a control is judged with what lies beneath it.
  const nodes = [];
  let depth = 0;
  for (const m of xml.matchAll(/<node\b([^>]*?)(\/?)>|<\/node>/g)) {
    if (m[0] === '</node>') { depth -= 1; continue; }
    const attr = (k) => new RegExp(`\\b${k}="([^"]*)"`).exec(m[1])?.[1] ?? '';
    const b = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(attr('bounds'));
    nodes.push({ depth, text: attr('text'), desc: attr('content-desc'), id: attr('resource-id'), clickable: attr('clickable') === 'true', bounds: b ? b.slice(1).map(Number) : null });
    if (m[2] !== '/') depth += 1;
  }
  const screen = nodes[0]?.bounds;
  nodes.forEach((n, i) => {
    if (!n.clickable || !n.bounds) return;
    const own = n.text || n.desc;
    let beneath = false;
    for (let j = i + 1; j < nodes.length && nodes[j].depth > n.depth; j++) if (nodes[j].text || nodes[j].desc) { beneath = true; break; }
    if (!own && !beneath) faults.push({ kind: 'NAMELESS', what: n.id || `a control at ${n.bounds.join(',')}` });
  });
  const words = nodes.filter((n) => n.text && n.bounds);
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      const a = words[i].bounds;
      const b = words[j].bounds;
      const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
      const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
      if (w <= 0 || h <= 0) continue;
      const smaller = Math.min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]));
      if (smaller > 0 && (w * h) / smaller > 1 / 3) faults.push({ kind: 'OVERLAP', what: `"${words[i].text.slice(0, 30)}" over "${words[j].text.slice(0, 30)}"` });
    }
  }
  if (screen) for (const n of words) if (n.bounds[0] < screen[0] - 1 || n.bounds[2] > screen[2] + 1) faults.push({ kind: 'OFF', what: `"${n.text.slice(0, 30)}" runs off the side (${n.bounds.join(',')})` });
  return faults;
}

/** The faults a stretch of the device log shows: CRASH, ERROR. */
export function logFaults(log, { slow = false } = {}) {
  const faults = [];
  const lines = log.split('\n');
  for (const [i, l] of lines.entries()) {
    if (/AndroidRuntime.*FATAL EXCEPTION/.test(l) && lines.slice(i, i + 4).some((x) => x.includes(PKG))) faults.push({ kind: 'CRASH', what: l.trim().slice(0, 200) });
    if (/\sE ReactNativeJS:/.test(l) || /ReactNativeJS.*(Uncaught|Unhandled|TypeError|ReferenceError)/.test(l)) {
      if (slow && /\[e2e\] screen\.failed/.test(l)) continue;
      faults.push({ kind: 'ERROR', what: l.trim().slice(0, 200) });
    }
  }
  return faults;
}

/** A wait on this thread, with no program run for it. */
const pause = (seconds) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);

const adb = (...args) => spawnSync('adb', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000 }).stdout ?? '';

function read(file) {
  adb('shell', 'uiautomator', 'dump', '/sdcard/explore.xml');
  const xml = adb('shell', 'cat', '/sdcard/explore.xml');
  writeFileSync(file, xml);
  return xml;
}

function act(a) {
  if (a.kind === 'tap') adb('shell', 'input', 'tap', String(a.at[0]), String(a.at[1]));
  else if (a.kind === 'back') adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  else if (a.kind === 'home') { adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); pause(2); adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1'); }
  else if (a.kind === 'turn') {
    adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
    adb('shell', 'settings', 'put', 'system', 'user_rotation', '1');
    pause(2);
    adb('shell', 'settings', 'put', 'system', 'user_rotation', '0');
  }
  pause(2);
}

async function main(argv) {
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const out = argv[0];
  const API = process.env.API_URL;
  const KEY = process.env.SERVICE_ROLE_KEY;
  if (!out || out.startsWith('--') || !API || !KEY) { console.error('usage: node e2e/explore.mjs <out dir> [--seed N] [--taps N] [--routes a,b] [--proxy URL], with API_URL and SERVICE_ROLE_KEY of the sealed world'); return 2; }
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) { console.error(`Refusing to explore with ${API}: the explorer reads only a local stack.`); return 2; }
  const seed = Number(opt('--seed', '20261120'));
  const taps = Number(opt('--taps', '12'));
  const proxy = opt('--proxy', null);
  const only = opt('--routes', null)?.split(',');
  const ask = async (path) => {
    const res = await fetch(`${API}${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  };
  const { routes } = JSON.parse(readFileSync(join(HERE, 'routes.json'), 'utf8'));
  const steps = walkPlan(routes, await readIds(ask)).filter((s) => s.as === 'member' && (!only || only.some((o) => s.file.includes(o))));
  mkdirSync(out, { recursive: true });
  const rand = prng(seed);
  const found = [];
  // The bad network: the fault proxy's, where the app reaches the house through it; else the
  // emulator's own (its console's network speed and delay), which slows every host alike.
  const fault = async (on) => {
    if (proxy) {
      await fetch(`${proxy}/fault`, on ? { method: 'POST', body: JSON.stringify({ kind: 'slow', latencyMs: 3000, jitterMs: 1000, bytesPerSecond: 20000 }), headers: { 'Content-Type': 'application/json' } } : { method: 'DELETE' });
      return;
    }
    adb('emu', 'network', 'speed', on ? 'edge' : 'full');
    adb('emu', 'network', 'delay', on ? 'gprs' : 'none');
  };
  for (const [r, s] of steps.entries()) {
    adb('shell', 'am', 'force-stop', PKG);
    adb('logcat', '-c');
    adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `reelhouse://${s.link.replace(/^\//, '')}`, PKG);
    pause(4);
    let slow = false;
    for (let t = 0; t <= taps; t++) {
      if (t === Math.ceil(taps / 2)) { await fault(true); slow = true; }
      const file = join(out, `${String(r + 1).padStart(2, '0')}-${t}.xml`);
      const xml = read(file);
      const log = adb('logcat', '-d', '-v', 'threadtime');
      adb('logcat', '-c');
      const alive = adb('shell', 'pidof', PKG).trim() !== '';
      const here = [...faultsOf(xml), ...logFaults(log, { slow }), ...(alive ? [] : [{ kind: 'CRASH', what: 'the app has no process left' }])];
      const action = t === taps ? null : nextAction(rand, xml);
      for (const f of here) found.push({ route: s.file, step: t, read: file, ...f });
      if (!alive) break;
      if (action) act(action);
    }
    if (slow) await fault(false);
  }
  writeFileSync(join(out, 'explore.json'), `${JSON.stringify({ seed, taps, routes: steps.length, found }, null, 2)}\n`);
  for (const f of found) console.log(`${f.kind.padEnd(8)} ${f.route} (step ${f.step}, ${f.read}): ${f.what}`);
  console.log(`explored ${steps.length} routes, ${taps} actions each, seed ${seed}: ${found.length} faults`);
  return found.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e); process.exit(2); });
