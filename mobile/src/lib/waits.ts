/**
 * waits — how the app counts a wait, so a phone's clock set back never holds one.
 *
 * Date.now() is the phone's own clock. Set back (by hand, or after it ran ahead), it leaves every
 * stamp in the future, and a wait counted as now less the stamp read "not yet" until the clock
 * caught up, which could be hours: a salon's founding was refused so (nightly 42468307829). Two
 * kinds of wait, two clocks:
 *
 * - A short wait within one run (a debounce, a throttle, a search's time budget) counts on
 *   monotonicNow(): performance.now(), which only goes forward. It stops while the phone sleeps,
 *   which a wait of seconds never minds.
 * - An age that must count the phone's sleep too (a cached answer's, how long the app was away, a
 *   stamp kept on disk for a later run) counts on the phone's clock through agedSince(): a stamp in
 *   the future is read as long past, so the clock set back makes it old, never fresh.
 */

/** Milliseconds on a clock that only goes forward within this run of the app. */
export function monotonicNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

/** How long ago a stamp on the phone's clock was; a stamp in the future (the clock set back since) is long past. */
export function agedSince(stamp: number, now: number = Date.now()): number {
  const since = now - stamp;
  return since < 0 ? Infinity : since;
}
