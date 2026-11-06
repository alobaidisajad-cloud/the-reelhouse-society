/**
 * houseClock — the time by the house's clock, as this phone can know it (WORKLIST P4.32).
 * ─────────────────────────────────────────────────────────────────────────────
 * A phone's clock can be wrong by minutes, hours or a day, and the house's
 * times are the server's. Anything weighed against a time the server wrote, or
 * against another device, is weighed by this clock: which copy of a draft is
 * newer, where a row just written sits among the house's rows, how long ago a
 * post was filed, when a suspension ends, and what day it is.
 *
 * Every answer the house gives carries its own time (the `Date` header, to the
 * second). The phone hears it as the headers arrive and keeps how far its own
 * clock is from the house's. A phone within two seconds of the house keeps its
 * own clock untouched: the header's second and the trip there and back cannot
 * tell it any better. Not kept across launches: a clock set right while the app
 * was closed would be set wrong again by it. Until the first answer of a launch
 * (no network at all), the phone's clock is the best there is.
 *
 * A duration, a throttle or an id is the phone's own business and stays on
 * `Date.now()`; the guard aClockIsJudged holds every reading of the phone's
 * clock to one of the two.
 */

import { instantOf } from '@/src/utils/instant';

/** Nearer than this, the phone's own clock is kept: the header is whole seconds. */
export const HOUSE_CLOCK_SLACK_MS = 2000;
/** An answer slower than this cannot place the house's second well enough to move the clock. */
export const HOUSE_CLOCK_SLOWEST_MS = 10_000;

let offsetMs = 0;
const listeners = new Set<() => void>();

/** Told each time the house clock moves (a phone's clock found wrong, or set right). Returns the way to stop. */
export function onHouseClockMoved(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * An answer's `Date` header, heard as it arrived. The house wrote it somewhere
 * between asking and hearing, so it is placed at the middle of the trip; a
 * header names the whole second, so half of one is added.
 */
export function heardTheHouse(dateHeader: string | null | undefined, askedAt: number, heardAt: number): void {
  if (!dateHeader || heardAt < askedAt || heardAt - askedAt > HOUSE_CLOCK_SLOWEST_MS) return;
  const house = instantOf(dateHeader);
  if (!Number.isFinite(house)) return;
  const measured = house + 500 - (askedAt + heardAt) / 2;
  const next = Math.abs(measured) <= HOUSE_CLOCK_SLACK_MS ? 0 : Math.round(measured);
  if (next === offsetMs || (next !== 0 && Math.abs(next - offsetMs) <= HOUSE_CLOCK_SLACK_MS)) return;
  offsetMs = next;
  listeners.forEach((l) => l());
}

/** Now, by the house's clock, in milliseconds. */
export function houseNow(): number {
  return Date.now() + offsetMs;
}

/** Now, by the house's clock, as the ISO string the house writes. */
export function houseIso(): string {
  return new Date(houseNow()).toISOString();
}

/** How far the phone's clock is from the house's, in milliseconds (0 when within the slack). */
export function houseOffset(): number {
  return offsetMs;
}

/** For tests: the phone's clock taken as the house's again. */
export function __forgetTheHouse(): void {
  offsetMs = 0;
}
