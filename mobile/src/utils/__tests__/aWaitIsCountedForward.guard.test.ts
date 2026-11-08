/**
 * aWaitIsCountedForward.guard.test.ts — no wait in the app is held by a phone's clock set back.
 *
 * A wait counted as the phone's clock now less a stamp (`Date.now() - last < N`) reads a clock set
 * back as time not yet passed: a salon's founding was refused until the clock caught up with the
 * last founding's stamp (nightly 42468307829). Every wait counts through src/lib/waits.ts: a short
 * one within a run on monotonicNow(), an age that must count the phone's sleep through agedSince(),
 * which reads a stamp in the future as long past. A wait still counted on the phone's clock directly
 * (`Date.now() - x`, or `now - x` where `now` is the phone's clock) fails here unless judged below.
 * Read from source, comments stripped.
 */
import { readCode } from '@/test-utils/readCode';
import { files, rel } from '@/test-utils/universe';

/**
 * A wait counted on the phone's clock directly, judged to stay so, and why. None now: the sign-in
 * throttle weighs its attempts against a `now` it is handed (evaluateAuthThrottle), and keeps an
 * attempt stamped in the future counted, so a clock set back never clears its lockout.
 */
const JUDGED: Record<string, string> = {};

/** A time less a stamp, weighed against a limit. */
const WAIT = /(Date\.now\(\)|\bnow\b)\s*-\s*[\w.$?()[\]]+\s*(<=?|>=?)\s*[\w.]/g;

/** Each wait in the code given counted on the phone's clock, as file:line. */
const phoneClockWaits = (sources: { file: string; code: string }[]) => sources.flatMap(({ file, code }) =>
  [...code.matchAll(WAIT)].flatMap((m) => {
    if (m[1] !== 'Date.now()') {
      // `now`: the phone's clock when its nearest naming before this wait says so.
      const named = [...code.slice(0, m.index).matchAll(/\bnow\b\s*(?::\s*number\s*)?=\s*([^;,\n]+)/g)].pop();
      if (!named || !/^Date\.now\(\)/.test((named[1] ?? '').trim())) return [];
    }
    return [`${file}:${code.slice(0, m.index).split('\n').length}`];
  }));

/**
 * Each stamp weighed against monotonicNow but set on the phone's clock, or begun at 0: two clocks
 * in one wait is a difference of decades, and monotonicNow starts near 0 at the app's start, so a
 * stamp begun at 0 reads as just now for the run's first seconds. Begun at -Infinity, it is long past.
 */
const mixedStamps = (sources: { file: string; code: string }[]) => sources.flatMap(({ file, code }) =>
  [...code.matchAll(/(monotonicNow\(\)|\bnow\b)\s*-\s*\(?([\w.$]+)/g)].flatMap((m) => {
    if (m[1] !== 'monotonicNow()') {
      const named = [...code.slice(0, m.index).matchAll(/\bnow\b\s*(?::\s*number\s*)?=\s*([^;,\n]+)/g)].pop();
      if (!named || !/^monotonicNow\(\)/.test((named[1] ?? '').trim())) return [];
    }
    const stamp = m[2] ?? '';
    const ref = stamp.replace(/\.current$/, '');
    const esc = (s: string) => s.replace(/[.$]/g, (c) => `\\${c}`);
    const wrong = new RegExp(`${esc(stamp)}\\s*=\\s*Date\\.now\\(\\)|\\b${esc(ref)}\\s*=\\s*useRef(?:<number>)?\\(0\\)|\\blet\\s+${esc(stamp)}\\s*=\\s*0\\b`).exec(code);
    return wrong ? [`${file}:${code.slice(0, wrong.index).split('\n').length} ${stamp}`] : [];
  }));

it('sets and begins every stamp weighed on monotonicNow on that clock: never Date.now, never 0', () => {
  const sources = files('appCode').map((f) => ({ file: rel(f), code: readCode(f) }));
  expect(mixedStamps(sources)).toEqual([]);
});

it('says NO to a stamp set on the phone clock or begun at 0, and not to one set forward', () => {
  const at = (code: string) => mixedStamps([{ file: 'a.tsx', code }]);
  expect(at('const last = useRef<number>(-Infinity);\nif (monotonicNow() - last.current > 15000) go();\nlast.current = Date.now();')).toEqual(['a.tsx:3 last.current']);
  expect(at('const last = useRef<number>(0);\nif (monotonicNow() - last.current > 15000) go();')).toEqual(['a.tsx:1 last.current']);
  expect(at('let lastUpdate = 0;\nconst now = monotonicNow();\nif (now - lastUpdate > 32) draw();')).toEqual(['a.tsx:1 lastUpdate']);
  expect(at('const last = useRef<number>(-Infinity);\nconst now = monotonicNow();\nif (now - last.current > 15000) last.current = now;')).toEqual([]);
});

it('counts every wait of the app forward: on monotonicNow, or through agedSince', () => {
  const sources = files('appCode').map((f) => ({ file: rel(f), code: readCode(f) }));
  expect(sources.length).toBeGreaterThan(300);
  const found = phoneClockWaits(sources);
  expect(found.filter((at) => !JUDGED[at.split(':')[0] ?? ''])).toEqual([]);
  // A judged file still holds such a wait, or its judgement is stale.
  expect(Object.keys(JUDGED).filter((file) => !found.some((at) => at.startsWith(`${file}:`)))).toEqual([]);
});

it('says NO to a wait on the phone clock, and not to one counted forward or on the house clock', () => {
  const at = (code: string) => phoneClockWaits([{ file: 'a.ts', code }]);
  expect(at('if (Date.now() - last < COOLDOWN) return;')).toEqual(['a.ts:1']);
  expect(at('const now = Date.now();\nif (now - lastPress.current < debounceMs) return;')).toEqual(['a.ts:2']);
  expect(at('function f(now: number = Date.now()) { if (last && now - last < WAIT) return; }')).toEqual(['a.ts:1']);
  expect(at('const now = monotonicNow();\nif (now - lastPress.current < debounceMs) return;')).toEqual([]);
  expect(at('if (agedSince(cached.ts) < TTL) return cached;')).toEqual([]);
  expect(at('const now = houseNow();\nif (now - m.timestamp >= STALE) drop(m);')).toEqual([]);
  expect(at('const took = Date.now() - started;')).toEqual([]);
});
