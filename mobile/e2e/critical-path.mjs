#!/usr/bin/env node
/**
 * critical-path.mjs — the round trips each screen waited on in a row, and the phone's own time
 * after its last answer (WORKLIST P4.53).
 *
 *   node e2e/critical-path.mjs <device log> [--json]
 *
 * A page is at its floor when it waits on one round trip at most (none when it holds what it
 * draws) and draws within a frame of the answer. The emulator's opening times swing threefold
 * between runs with no change in the code, so they cannot show a floor; what a screen waited on
 * can be counted exactly. From the lines the E2E build writes (`[e2e] request {at, ms}` in
 * src/lib/supabase.ts, `[e2e] screen.ready {ms}` in useScreenReady), for each opening: the
 * requests begun once it opened (20 ms before, the effect that opened it) and answered before it
 * was ready; the longest chain of them each begun after the last was answered (the round trips in
 * a row); and the time from its last answer to ready (the phone's own: the thread, the commit,
 * the frame). Per screen: how often it opened, the most round trips in a row and the median, and
 * the median phone time, with the requests of its deepest opening. Where a screen marks the
 * stages of its opening (`[e2e] film.data` as its answer is taken in, `[e2e] drawn {name:
 * "film.hero"}` from useTraceDrawn as a part is first drawn), each stage's median time after the
 * last answer: where the phone's own time went.
 *
 * Reported, not judged: a request the app makes for itself while a screen opens (the notices, a
 * rank's entitlement) is counted with the screen's. The judge comes once the runs have shown
 * which reads are each screen's own.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** The device log's clock: month-day and time, read in the year the requests give. */
const stampOf = (line, year) => {
  const m = line.match(/^(\d\d)-(\d\d) (\d\d:\d\d:\d\d\.\d{3})/);
  return m ? Date.parse(`${year}-${m[1]}-${m[2]}T${m[3]}Z`) : NaN;
};

/** Each opening's round trips in a row, requests, phone time and stages, from the device log's lines. */
export function openingsOf(lines) {
  const requests = [];
  const ready = [];
  const stages = [];
  let year = String(new Date().getUTCFullYear());
  for (const line of lines) {
    const s = line.match(/\[e2e\] (drawn|[a-z]+\.data)(?: (\{.*\}))?\s*$/);
    if (s) {
      let name = s[1];
      if (name === 'drawn') {
        try { name = JSON.parse(s[2] ?? '{}').name; } catch { continue; }
      }
      if (typeof name === 'string') stages.push({ line, name });
      continue;
    }
    const m = line.match(/\[e2e\] (request|screen\.ready) (\{.*\})\s*$/);
    if (!m) continue;
    let v;
    try { v = JSON.parse(m[2]); } catch { continue; }
    if (m[1] === 'request') {
      const at = Date.parse(v.at);
      if (Number.isNaN(at) || typeof v.ms !== 'number') continue;
      year = v.at.slice(0, 4);
      requests.push({ start: at, end: at + v.ms, path: String(v.path ?? '').split('?')[0] });
    } else if (typeof v.name === 'string' && typeof v.ms === 'number') {
      ready.push({ line, name: v.name, ms: v.ms });
    }
  }
  const marked = stages.map((s) => ({ name: s.name, at: stampOf(s.line, year) })).filter((s) => !Number.isNaN(s.at));
  const opened = ready.map((r) => ({ name: r.name, at: stampOf(r.line, year) - r.ms }));
  return ready.flatMap(({ line, name, ms }, i) => {
    const end = stampOf(line, year);
    if (Number.isNaN(end)) return [];
    const start = end - ms;
    const waited = requests.filter((r) => r.start >= start - 20 && r.end <= end + 5).sort((a, b) => a.start - b.start);
    const depth = waited.map(() => 1);
    for (let k = 0; k < waited.length; k++) {
      for (let j = 0; j < k; j++) if (waited[k].start >= waited[j].end - 2) depth[k] = Math.max(depth[k], depth[j] + 1);
    }
    const lastAnswer = waited.length ? Math.max(...waited.map((r) => r.end)) : start;
    // This opening's stages: its own screen's marks, from its opening to the next opening of it.
    const next = opened.slice(i + 1).find((o) => o.name === name)?.at ?? Infinity;
    const after = {};
    for (const s of marked) {
      if (!s.name.startsWith(`${name}.`) || s.at < start - 20 || s.at >= next || s.name in after) continue;
      after[s.name] = s.at - lastAnswer;
    }
    return [{
      name, ms, trips: waited.length ? Math.max(...depth) : 0, paths: waited.map((r) => r.path),
      phone: Math.max(0, end - lastAnswer), stages: after,
    }];
  });
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** The report: per screen, its openings, round trips in a row, phone time, and its stages. */
export function report(openings) {
  const by = new Map();
  for (const o of openings) by.set(o.name, [...(by.get(o.name) ?? []), o]);
  const out = ['screen       opened   trips in a row (most, median)   phone after its answer (median)'];
  for (const [name, os] of [...by].sort(([a], [b]) => a.localeCompare(b))) {
    const trips = os.map((o) => o.trips);
    const most = Math.max(...trips);
    const phone = median(os.map((o) => o.phone));
    out.push(`${name.padEnd(12)} ${String(os.length).padStart(6)}   ${String(most).padStart(4)}, ${String(median(trips)).padStart(4)}                    ${String(phone).padStart(6)} ms`);
    const named = [...new Set(os.flatMap((o) => Object.keys(o.stages)))];
    if (named.length > 0) {
      const at = (k) => median(os.filter((o) => k in o.stages).map((o) => o.stages[k]));
      const told = [...named.map((k) => [k, at(k)]), ['ready', phone]].sort((a, b) => a[1] - b[1]);
      out.push(`             after its answer: ${told.map(([k, ms]) => `${k} +${ms} ms`).join(', ')}`);
    }
    if (most > 1) {
      const deepest = os.find((o) => o.trips === most);
      out.push(`             its deepest: ${deepest.paths.map((p) => p.replace('/rest/v1/', '').replace('/functions/v1/', 'fn:')).join(' | ')}`);
    }
  }
  return out.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [log, ...flags] = process.argv.slice(2);
  if (!log) { console.error('usage: node e2e/critical-path.mjs <device log> [--json]'); process.exit(2); }
  const openings = openingsOf(readFileSync(log, 'utf8').split('\n'));
  console.log(flags.includes('--json') ? JSON.stringify(openings) : report(openings));
}
