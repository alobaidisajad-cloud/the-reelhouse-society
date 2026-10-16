/**
 * useStateSaid — which state a screen drew, written to the sealed E2E build's device log:
 * `state.empty` for a room with nothing in it, `state.failed` for a read that reached nothing.
 * The fault runs' judges (WORKLIST P0.76) read them: under a broken network a failure must be
 * said as a failure, never drawn as an empty room. Nothing in any other build (e2eTrace).
 */
import { useEffect } from 'react';
import { e2eTrace } from '@/src/utils/e2eTrace';

/** The two states a room says instead of its content. */
export type SaidState = 'empty' | 'failed';

/** Writes the state once when it is drawn, and again if what it says changes. */
export function useStateSaid(state: SaidState, what: string): void {
  useEffect(() => {
    e2eTrace(`state.${state}`, { what });
  }, [state, what]);
}
