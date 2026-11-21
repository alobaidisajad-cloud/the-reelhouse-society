/**
 * useStillHere — whether the screen that began some work is still there when the work answers.
 *
 * After a wait, a walk (nav, router), a timer or words that point at the screen act on whatever the
 * member is looking at now. Asked after the wait, `stillHere()` is false once the component has
 * left, so the work stops where its screen did. Raised in the effect, not at creation, so React's
 * second run of effects in development leaves it true.
 */
import { useCallback, useEffect, useRef } from 'react';

export function useStillHere(): () => boolean {
  const here = useRef(false);
  useEffect(() => {
    here.current = true;
    return () => { here.current = false; };
  }, []);
  return useCallback(() => here.current, []);
}
