/**
 * raceDeadline — a promise's answer, or a refusal once `ms` have passed,
 * whichever comes first. The operation itself carries on unseen; it is only no
 * longer waited for. The deadline is cleared the moment the race is decided,
 * so nothing is left waiting after the answer.
 *
 * For a call that takes an AbortSignal, withTimeout.ts ends the call itself.
 * A caller that wants a value instead of a refusal catches it:
 * `raceDeadline(p, 2000).catch(() => false)`.
 */
export function raceDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    deadline = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(deadline));
}
