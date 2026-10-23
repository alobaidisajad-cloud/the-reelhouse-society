/**
 * LabFrameLog — the speed lab's frame record (WORKLIST P0.111, P0.112), in the lab's builds alone.
 *
 * Mounted only where extra.lab is set (LAB=1, speed-lab.yml; app.config.js): every other build,
 * the Sealed E2E's among them, runs without it, so its speed gates measure the app as it ships.
 * As each page opens, `[e2e] lab.frames.on`; then each second that held any, one line,
 * `[e2e] lab.frames {...}`, for the page then open:
 *   js      animation frames the JS thread reached more than 50 ms past a frame's time, and the
 *           longest. On Android a JS timer fires only on the UI thread's frame, so a late frame
 *           reads here as a long task: on the lab's software GPU it counts the frames (speed lab
 *           39868403930), and the lab does not judge it (scrolls.mjs UNMEASURED)
 *   ui      the UI thread's frames, from Reanimated's frame callback: how many, how many took
 *           over 25 ms (a frame and a half), and the longest; on iOS as on Android
 * The lab's scripts read them per page (e2e/lab/scrolls.mjs).
 */
import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { e2eTrace } from '@/src/utils/e2eTrace';

/** A frame's time on a 60 Hz screen, and what a JavaScript task must outlast it by to be long. */
const FRAME_MS = 1000 / 60;
const LONG_TASK_MS = 50;
const SLOW_UI_FRAME_MS = 25;

export function LabFrameLog() {
  const path = usePathname();
  // The UI thread's running totals, written by its worklet alone; the JS side reads the change.
  const uiFrames = useSharedValue(0);
  const uiSlow = useSharedValue(0);
  const uiWorst = useSharedValue(0);

  useFrameCallback((frame) => {
    'worklet';
    const gap = frame.timeSincePreviousFrame;
    if (gap == null) return;
    uiFrames.value += 1;
    if (gap > SLOW_UI_FRAME_MS) uiSlow.value += 1;
    if (gap > uiWorst.value) uiWorst.value = gap;
  });

  useEffect(() => {
    // The record is running for this page: a second with no line is then a quiet one, not a gap.
    e2eTrace('lab.frames.on', { path });
    let long = 0;
    let longest = 0;
    let last = 0;
    let raf = 0;
    const tick = (now: number) => {
      if (last && now - last - FRAME_MS > LONG_TASK_MS) {
        long += 1;
        longest = Math.max(longest, now - last - FRAME_MS);
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Counted from this page's first moment: the totals so far are another page's.
    let seen = { frames: uiFrames.value, slow: uiSlow.value };
    uiWorst.value = 0;
    const every = setInterval(() => {
      const frames = uiFrames.value - seen.frames;
      const slow = uiSlow.value - seen.slow;
      seen = { frames: uiFrames.value, slow: uiSlow.value };
      if (long || slow) {
        e2eTrace('lab.frames', {
          path,
          js: { long, longest: Math.round(longest) },
          ui: { frames, slow, worst: Math.round(uiWorst.value) },
        });
      }
      long = 0;
      longest = 0;
      uiWorst.value = 0;
    }, 1000);
    return () => { cancelAnimationFrame(raf); clearInterval(every); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return null;
}
