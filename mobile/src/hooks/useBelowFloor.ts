/**
 * useBelowFloor — whether this build is under the house's floor (src/lib/houseFloor.ts).
 *
 * Answered at once from the floor kept on the phone, so the first screen waits for nothing; the
 * floor is then read in the background, and again on every return to the app. A read that fails
 * leaves the answer as it was.
 */
import { useEffect, useState } from 'react';
import { AppState, InteractionManager } from 'react-native';

import { belowFloor, keptFloor, readHouseFloor } from '@/src/lib/houseFloor';

export function useBelowFloor(): boolean {
  const [below, setBelow] = useState(() => belowFloor(keptFloor()));
  useEffect(() => {
    let live = true;
    const ask = () => {
      void readHouseFloor()
        .then((floor) => { if (live && floor) setBelow(belowFloor(floor)); })
        .catch(() => { /* the floor kept stands */ });
    };
    // After the first screen's own work: the floor never competes with it.
    const first = InteractionManager.runAfterInteractions(ask);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') ask(); });
    return () => { live = false; first.cancel(); sub.remove(); };
  }, []);
  return below;
}
