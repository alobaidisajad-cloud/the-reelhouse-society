import { useEffect, useRef } from 'react';
import { tmdb } from '../lib/tmdb';

/**
 * useStaggeredPrefetch
 * 
 * FAANG-Level Architecture: Extracts monolithic batching logic out of the UI render cycle.
 * This hook debounces viewability events and processes API prefetching in staggered 
 * batches to prevent network congestion and JS thread blocking.
 */
export function useStaggeredPrefetch() {
  const inflightFetches = useRef(new Set<number>());
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingIdsRef = useRef<Set<number>>(new Set());
  const batchTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const batchTimers = batchTimersRef.current;
    return () => {
      if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
      batchTimers.forEach((t) => clearTimeout(t));
      batchTimers.clear();
    };
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: import('react-native').ViewToken[] }) => {
    if (inflightFetches.current.size > 200) {
      inflightFetches.current.clear();
    }

    // Collect IDs
    viewableItems.forEach((vi) => {
      if (vi.item && vi.item.id && !inflightFetches.current.has(vi.item.id)) {
        pendingIdsRef.current.add(vi.item.id);
      }
    });

    // Debounce: wait 300ms after last viewability change before firing
    if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    prefetchTimerRef.current = setTimeout(() => {
      const ids = Array.from(pendingIdsRef.current);
      pendingIdsRef.current.clear();
      if (ids.length === 0) return;

      ids.forEach(id => inflightFetches.current.add(id));
      const BATCH_SIZE = 3;
      const BATCH_DELAY = 200; // ms between batches
      
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const chunk = ids.slice(i, i + BATCH_SIZE);
        const delay = (i / BATCH_SIZE) * BATCH_DELAY;
        const timerId = setTimeout(() => {
          chunk.forEach(id => {
            tmdb.detail(id)
              .catch(() => {}) // Prefetch failures are silent by design
              .finally(() => {
                inflightFetches.current.delete(id);
              });
          });
          batchTimersRef.current.delete(timerId);
        }, delay);
        batchTimersRef.current.add(timerId);
      }
    }, 300);
  }).current;

  return { onViewableItemsChanged };
}
