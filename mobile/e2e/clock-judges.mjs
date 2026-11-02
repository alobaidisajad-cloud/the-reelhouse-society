#!/usr/bin/env node
/**
 * clock-judges.mjs — the clock runs' judges (WORKLIST P2.4, by P4.32's rules), over a run whose
 * flows set the phone's clock wrong on purpose (.maestro/clock/<ahead|behind>/*.yaml).
 *
 *   node e2e/clock-judges.mjs <device log> --gateway <gateway log> --flow-starts <file> --clock <ahead|behind>
 *
 * The phone's clock is the thing a clock run breaks, so nothing here is placed by it: the device
 * log is split by the markers run-flows.sh writes into it as each flow begins (`flow.begins`), and
 * the gateway's requests are placed by the runner's clock (run-flows.sh's flow-starts.txt, name,
 * attempt and the runner's time, against each request's `at`). Each flow of the run's way, its
 * last attempt, is judged:
 *   - the clock was moved (`phone.clock`, which e2e/fault-proxy.mjs writes as it sets it), or the
 *     flow proves nothing;
 *   - after it, every tab's first read was ready (`screen.ready` for each of TABS; the flow opens
 *     the app again once the clock is moved, so each is a first read); a behind run, on tokens that
 *     live 150 s, then waits past one (`phone.waited`, or it proves nothing), opens the app again,
 *     and every tab's first read is ready once more;
 *   - no read was said to have failed (`state.failed`, `screen.failed`) and the member was never
 *     signed out (the Lobby, once ready as `lobby`, ready again as `welcome`, the signed-out door);
 *   - the token refreshes the gateway saw (POST /auth/v1/token?grant_type=refresh_token): an ahead
 *     run, on 3600 s tokens, at most AHEAD_MOST in any AHEAD_WINDOW_S; a behind run, on 150 s tokens
 *     renewed 90 s before they end (one a minute), at most N + 1
 *     in any N minutes, and at least one, or its token never ran out and the flow proves nothing.
 * One write landing is verify-writes.mjs's to judge; a crash is app-crashes.mjs's.
 *
 * Exit 0 when every flow holds; 1 naming each fault; 2 when a file cannot be read, the way is not
 * named, or a flow of that way never ran.
 */
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Each clock flow, by name: which way its clock is set, and how far. */
export const CLOCK_FLOWS = {
  ahead_minutes: { direction: 'ahead', minutes: 5 },
  ahead_hours: { direction: 'ahead', minutes: 180 },
  ahead_day: { direction: 'ahead', minutes: 1440 },
  behind_minutes: { direction: 'behind', minutes: 5 },
  behind_hours: { direction: 'behind', minutes: 180 },
  behind_day: { direction: 'behind', minutes: 1440 },
};

/** The tabs' screens, as each says it is ready (useScreenReady). */
export const TABS = ['lobby', 'dispatch', 'reel', 'darkroom', 'member'];
/** An ahead run's refresh limit: its tokens live an hour, so a loop shows as more than this. */
export const AHEAD_MOST = 2;
export const AHEAD_WINDOW_S = 300;

const LINE = /\[e2e\] (flow\.begins|phone\.clock|phone\.waited|state\.failed|screen\.failed|screen\.ready) (\{[^}\n]*\})/;

/** The device log's lines that matter here, in the order the log holds them. */
export function readLines(log) {
  const out = [];
  for (const line of log.split(/\r?\n/)) {
    const m = LINE.exec(line);
    if (!m) continue;
    let detail;
    try { detail = JSON.parse(m[2] ?? ''); } catch { continue; }
    out.push({ event: m[1], detail });
  }
  return out;
}

/** Each flow's last attempt's lines, from its marker to the next flow's. */
export function segments(lines) {
  const out = new Map();
  let current = null;
  for (const l of lines) {
    if (l.event === 'flow.begins') { current = []; out.set(String(l.detail.name), current); continue; }
    if (current) current.push(l);
  }
  return out;
}

/** run-flows.sh's flow-starts.txt: each start, by the runner's clock, in order. */
export function readStarts(text) {
  return text.split(/\r?\n/).filter(Boolean).map((l) => {
    const [name, attempt, at] = l.split('\t');
    return { name, attempt: Number(attempt) || 1, at: Date.parse(at) };
  }).filter((s) => !Number.isNaN(s.at)).sort((a, b) => a.at - b.at);
}

/** The gateway's token refreshes, by the runner's clock, in seconds. */
export function readRefreshes(text) {
  return text.split(/\r?\n/).filter(Boolean).flatMap((l) => {
    let r;
    try { r = JSON.parse(l); } catch { return []; }
    return r.method === 'POST' && /^\/auth\/v1\/token\?(?:.*&)?grant_type=refresh_token\b/.test(String(r.path)) ? [Date.parse(r.at) / 1000] : [];
  }).filter((t) => !Number.isNaN(t)).sort((a, b) => a - b);
}

/** A flow's last attempt's window on the runner's clock: from its start to the next start. */
export function windowOf(name, starts) {
  const i = starts.map((s) => s.name).lastIndexOf(name);
  if (i < 0) return null;
  return { from: starts[i].at / 1000, to: i + 1 < starts.length ? starts[i + 1].at / 1000 : Infinity };
}

/** The most refreshes in any window of `seconds`. */
export function mostIn(times, seconds) {
  let most = 0;
  for (let i = 0, j = 0; j < times.length; j++) {
    while (times[j] - times[i] >= seconds) i++;
    most = Math.max(most, j - i + 1);
  }
  return most;
}

/** The first run of refreshes past N + 1 in N minutes, in words, or null. */
export function pastOneAMinute(times) {
  for (let i = 0; i < times.length; i++) {
    for (let j = i + 1; j < times.length; j++) {
      const minutes = Math.floor((times[j] - times[i]) / 60) + 1;
      if (j - i + 1 > minutes + 1) return `${j - i + 1} refreshes in ${minutes} minute(s)`;
    }
  }
  return null;
}

/** Each tab whose first read was not ready among these lines, in words. */
const unready = (name, lines, when) => TABS
  .filter((tab) => !lines.some((l) => l.event === 'screen.ready' && l.detail.name === tab))
  .map((tab) => `${name}: the ${tab} tab's first read was not ready ${when}`);

/** Each fault found in one flow, in words. */
export function judgeFlow(name, flow, lines, refreshes) {
  const moved = lines.findIndex((l) => l.event === 'phone.clock');
  if (moved < 0) return [`${name}: the clock was never moved, so the flow proves nothing`];
  const after = lines.slice(moved + 1);
  const faults = [];
  if (flow.direction === 'ahead') {
    faults.push(...unready(name, after, 'after the clock moved'));
  } else {
    const waited = after.findIndex((l) => l.event === 'phone.waited');
    if (waited < 0) return [`${name}: the flow never waited past its token, so it proves nothing`];
    faults.push(...unready(name, after.slice(0, waited), 'after the clock moved'), ...unready(name, after.slice(waited + 1), 'past the token'));
  }
  for (const l of after.filter((x) => x.event === 'state.failed' || x.event === 'screen.failed')) {
    faults.push(`${name}: a read failed with the clock ${flow.direction} ("${l.detail.what ?? l.detail.name ?? ''}")`);
  }
  const lobbyAt = after.findIndex((l) => l.event === 'screen.ready' && l.detail.name === 'lobby');
  if (lobbyAt >= 0 && after.slice(lobbyAt).some((l) => l.event === 'screen.ready' && l.detail.name === 'welcome')) {
    faults.push(`${name}: the member was signed out with the clock ${flow.direction}`);
  }
  if (flow.direction === 'ahead') {
    const most = mostIn(refreshes, AHEAD_WINDOW_S);
    if (most > AHEAD_MOST) faults.push(`${name}: ${most} token refreshes in ${AHEAD_WINDOW_S / 60} minutes, past ${AHEAD_MOST}: a refresh loop`);
  } else {
    if (!refreshes.length) faults.push(`${name}: no token was refreshed, so its 150 s token never ran out and the flow proves nothing`);
    const past = pastOneAMinute(refreshes);
    if (past) faults.push(`${name}: ${past}, past one a minute: a refresh loop`);
  }
  return faults;
}

/** Every fault in a run of one way; `unread` names each flow of that way that never ran. */
export function judge(log, gateway, starts, clock) {
  const segs = segments(readLines(log));
  const refreshes = readRefreshes(gateway);
  const ofRun = Object.keys(CLOCK_FLOWS).filter((f) => CLOCK_FLOWS[f].direction === clock);
  const ran = ofRun.filter((f) => segs.has(f) && windowOf(f, starts));
  const faults = ran.flatMap((f) => {
    const w = windowOf(f, starts);
    return judgeFlow(f, CLOCK_FLOWS[f], segs.get(f) ?? [], refreshes.filter((t) => t >= w.from && t < w.to));
  });
  return { faults, unread: ofRun.filter((f) => !ran.includes(f)) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
  const files = [args[0], opt('--gateway'), opt('--flow-starts')];
  const clock = opt('--clock');
  if (files.some((f) => !f || !existsSync(f)) || !['ahead', 'behind'].includes(clock)) {
    console.error('usage: node e2e/clock-judges.mjs <device log> --gateway <gateway log> --flow-starts <file> --clock <ahead|behind> (the files must exist)');
    process.exit(2);
  }
  const [log, gateway, starts] = files.map((f) => readFileSync(f, 'utf8'));
  const { faults, unread } = judge(log, gateway, readStarts(starts), clock);
  if (unread.length) { console.error(`never ran: ${unread.join(', ')}`); process.exit(2); }
  for (const f of faults) console.log(`✗ ${f}`);
  console.log(faults.length ? `${faults.length} fault(s) in the ${clock} clock runs` : `every ${clock} clock flow held`);
  process.exit(faults.length ? 1 : 0);
}
