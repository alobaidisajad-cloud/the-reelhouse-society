/**
 * useSheetPresence — a bottom sheet's rise, its fall, and the moment it is gone.
 *
 * Five sheets carried this by hand, and every copy had the same three faults:
 *   · the open ran twice: the effect also watched `isRendered`, which the open
 *     itself sets, so the rise restarted from the bottom a frame in;
 *   · the fall unmounted at any END of its animation, so a sheet reopened inside
 *     those 250ms vanished and came back;
 *   · work after the fall was written inside the worklet, where a ref is a copy
 *     (CreateLoungeSheet's "a room was founded" flag never reset on the JS side).
 *
 * This opens and closes on `visible` alone. After the fall it unmounts only if
 * the sheet is still meant to be closed, and runs `onGone` then, on the JS thread,
 * once: at the fall's end, or when it should have ended, whichever comes first (a fall
 * whose frames stall never says it ended). `onOpen` runs as it opens.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Easing, runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';
import { ARRIVAL_GRACE_MS } from '@/src/hooks/useArrival';

/** A sheet's fall, its scrim's fade with it. */
export const SHEET_FALL_MS = 250;

export function useSheetPresence({ visible, offscreen = 800, onOpen, onGone }: {
  visible: boolean;
  /** Where the sheet rests below the screen; 800 unless the sheet measures its own. */
  offscreen?: number;
  onOpen?: () => void;
  onGone?: () => void;
}) {
  const [isRendered, setIsRendered] = useState(visible);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(offscreen);

  const live = useRef({ visible, offscreen, onOpen, onGone });
  useLayoutEffect(() => { live.current = { visible, offscreen, onOpen, onGone }; });

  // Each fall, numbered: gone once, by the fall's own end or by the time it should have ended
  // (a fall whose frames stall never says it ended, and its sheet stood, and whatever waited on
  // its going waited for ever).
  const fall = useRef(0);
  const gone = useCallback((which: number) => {
    if (live.current.visible || which !== fall.current) return;
    fall.current += 1;
    setIsRendered(false);
    live.current.onGone?.();
  }, []);

  // A visible sheet is a drawn one, from the very render that opens it.
  if (visible && !isRendered) setIsRendered(true);

  const mounted = useRef(false);
  useEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    if (visible) {
      live.current.onOpen?.();
      translateY.value = live.current.offscreen;
      opacity.value = withTiming(1, { duration: 300 });
      translateY.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) });
    } else if (!first) {
      const which = fall.current;
      opacity.value = withTiming(0, { duration: SHEET_FALL_MS });
      translateY.value = withTiming(live.current.offscreen, { duration: SHEET_FALL_MS, easing: Easing.out(Easing.cubic) }, () => {
        runOnJS(gone)(which);
      });
      const backstop = setTimeout(() => gone(which), SHEET_FALL_MS + ARRIVAL_GRACE_MS);
      return () => clearTimeout(backstop);
    }
    return undefined;
  }, [visible, opacity, translateY, gone]);

  return { isRendered, setIsRendered, opacity, translateY };
}
