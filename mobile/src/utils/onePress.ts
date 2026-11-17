/**
 * onePress — a press on words (`<Text onPress>`) acts once for one tap, as a PressableScale does.
 *
 * A PressableScale waits out 400 ms after a press before it hears another; words with their own
 * press had no such wait, so a quick double tap on a stack's curator opened their file twice, one
 * over the other, and a link in a salon opened twice (review round 8). Each press is named by what
 * it does, and heard once in that span, on the forward clock.
 */
import { monotonicNow } from '@/src/lib/waits';

/** The span a press waits out, as PressableScale's own. */
export const ONE_PRESS_MS = 400;

const lastHeard = new Map<string, number>();

export function onePress(what: string, act: () => void): void {
  const now = monotonicNow();
  if (now - (lastHeard.get(what) ?? -Infinity) < ONE_PRESS_MS) return;
  lastHeard.set(what, now);
  act();
}
