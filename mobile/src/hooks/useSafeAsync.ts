import { useEffect, useRef, useCallback } from 'react';

/**
 * useSafeAsync.ts
 * ────────────────────────────────────────────────────────
 * React Native concurrency hook. Automatically tracks
 * inflight promises and guarantees they will NOT trigger
 * state updates if the component unmounts. Also automatically
 * invokes AbortController.abort() to cancel fetch requests
 * natively on unmount.
 */

export function useSafeAsync() {
  const abortControllers = useRef<Set<AbortController>>(new Set());
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    const controllers = abortControllers.current;
    return () => {
      isMounted.current = false;
      // Abort any inflight network requests when unmounting
      controllers.forEach(ctrl => ctrl.abort());
      controllers.clear();
    };
  }, []);

  /**
   * Execute an async function safely. If the component unmounts mid-flight,
   * the promise is squashed and no resolution/rejection propagates to the caller.
   */
  const execute = useCallback(<T>(asyncFn: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      abortControllers.current.add(controller);

      asyncFn(controller.signal)
        .then(res => {
          if (isMounted.current) {
            abortControllers.current.delete(controller);
            resolve(res);
          }
        })
        .catch(err => {
          if (isMounted.current) {
            abortControllers.current.delete(controller);
            // If the error was specifically caused by us aborting it on unmount, swallow it.
            // (We shouldn't hit this if isMounted is false, but just to be safe)
            if (err instanceof Error && err.name === 'AbortError') return;
            reject(err);
          }
        });
    });
  }, []);

  return { execute, isMounted };
}
