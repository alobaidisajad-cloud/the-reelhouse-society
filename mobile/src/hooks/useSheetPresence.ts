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
 * the sheet is still meant to be closed, and runs `onGone` then, on the JS
 * thread. `onOpen` runs as it opens.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Easing, runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';

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
  live.current = { visible, offscreen, onOpen, onGone };

  const gone = useCallback(() => {
    if (live.current.visible) return;
    setIsRendered(false);
    live.current.onGone?.();
  }, []);

  const mounted = useRef(false);
  useEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    if (visible) {
      live.current.onOpen?.();
      setIsRendered(true);
      translateY.value = live.current.offscreen;
      opacity.value = withTiming(1, { duration: 300 });
      translateY.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) });
    } else if (!first) {
      opacity.value = withTiming(0, { duration: 250 });
      translateY.value = withTiming(live.current.offscreen, { duration: 250, easing: Easing.out(Easing.cubic) }, () => {
        runOnJS(gone)();
      });
    }
  }, [visible, opacity, translateY, gone]);

  return { isRendered, setIsRendered, opacity, translateY };
}
