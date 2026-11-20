/**
 * LabFeelProbe — how the app feels, measured from inside it, in the speed lab's feel build alone.
 *
 * Mounted only where extra.feel is set (FEEL=1 beside E2E=1 and LAB=1: app.config.js), whose React
 * is the profiling build (metro.config.js), so a Profiler times each commit: every other build,
 * the lab's own timed builds among them, runs without it. For the page then open:
 *   feel.on       {path}                              as each page opens
 *   feel.commits  {path, n, total, longest}           each second that held any: React's commits,
 *                                                      and the ms each spent rendering (actualDuration)
 *   feel.tap      {path, js, answer, commit}          each touch: `js`, the ms from the touch as the
 *                                                      phone stamped it to the JS thread's first sight
 *                                                      of it; `answer`, to the end of the first commit
 *                                                      after it (null when none came within
 *                                                      ANSWER_WAIT_MS: a press only the UI thread draws)
 *   feel.tap      {path, clocks: 'apart', js}         a touch whose stamp is not on the JS clock: the
 *                                                      judge (e2e/lab/feel.mjs) fails it as unmeasured
 * A tap is answered on the next frame when its answer comes within one frame (FRAME_MS) of the touch.
 */
import React, { Profiler, useEffect, type ProfilerOnRenderCallback, type ReactNode } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { usePathname } from 'expo-router';
import { FEEL_BUILD, e2eTrace } from '@/src/utils/e2eTrace';

/** One frame of a 60 Hz screen. */
export const FRAME_MS = 1000 / 60;
/** How long a touch waits for a commit to call its answer. */
export const ANSWER_WAIT_MS = 1000;
/** Past this the touch's stamp and the JS clock are two clocks, not one touch's delay. */
export const CLOCKS_APART_MS = 5000;

const now = () => globalThis.performance.now();
const round = (ms: number) => Math.round(ms * 10) / 10;

let path = '';
let tap: { touch: number; seen: number; timer: ReturnType<typeof setTimeout> } | null = null;
let commits = { n: 0, total: 0, longest: 0 };

/** The root's onTouchStart in the feel build: each touch's stamp, and when JavaScript first saw it. */
export const feelTouch: ((e: GestureResponderEvent) => void) | undefined = FEEL_BUILD ? (e) => {
  const seen = now();
  const touch = e.nativeEvent.timestamp;
  const js = seen - touch;
  if (!Number.isFinite(js) || js < -1 || js > CLOCKS_APART_MS) {
    e2eTrace('feel.tap', { path, clocks: 'apart', js: Number.isFinite(js) ? round(js) : null });
    return;
  }
  if (tap) clearTimeout(tap.timer);
  const timer = setTimeout(() => {
    if (tap?.timer !== timer) return;
    e2eTrace('feel.tap', { path, js: round(tap.seen - tap.touch), answer: null, commit: null });
    tap = null;
  }, ANSWER_WAIT_MS);
  tap = { touch, seen, timer };
} : undefined;

const onRender: ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
  commits = { n: commits.n + 1, total: commits.total + actualDuration, longest: Math.max(commits.longest, actualDuration) };
  if (!tap) return;
  const end = now();
  clearTimeout(tap.timer);
  e2eTrace('feel.tap', { path, js: round(tap.seen - tap.touch), answer: round(end - tap.touch), commit: round(actualDuration) });
  tap = null;
};

/** The page's commits, written each second that held any. */
function FeelLog() {
  const here = usePathname();
  useEffect(() => {
    path = here;
    commits = { n: 0, total: 0, longest: 0 };
    e2eTrace('feel.on', { path: here });
    const every = setInterval(() => {
      if (commits.n) e2eTrace('feel.commits', { path: here, n: commits.n, total: round(commits.total), longest: round(commits.longest) });
      commits = { n: 0, total: 0, longest: 0 };
    }, 1000);
    return () => clearInterval(every);
  }, [here]);
  return null;
}

/** The app's tree, timed commit by commit in the feel build; as it is in every other. */
export function FeelProfiler({ children }: { children: ReactNode }) {
  if (!FEEL_BUILD) return <>{children}</>;
  return (
    <Profiler id="app" onRender={onRender}>
      {children}
      <FeelLog />
    </Profiler>
  );
}
