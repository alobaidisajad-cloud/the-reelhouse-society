/**
 * useLater — something a component does a moment from now, on its own watch.
 *
 * `later(run, ms)` runs `run` once after `ms`; a second call replaces the
 * first. When the component goes, whatever is still waiting goes with it: a
 * timer that outlives its screen fires on whatever replaced it (a delayed
 * navigation, a focus, a lock released on a recycled card). `cancel()` drops
 * it sooner.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';

export function useLater(): { later: (run: () => void, ms: number) => void; cancel: () => void } {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  const later = useCallback((run: () => void, ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      run();
    }, ms);
  }, []);
  useEffect(() => cancel, [cancel]);
  return useMemo(() => ({ later, cancel }), [later, cancel]);
}
