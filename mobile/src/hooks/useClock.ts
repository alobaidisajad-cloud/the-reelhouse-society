/**
 * useClock — the one clock every drawn "… AGO", "CLOSES IN …" and "TODAY" reads.
 *
 * A label worked out from the time once, as its row first drew, stayed as it was: a Reel card
 * read "MOMENTS AGO" a day later, and a ballot past its closing still offered its options,
 * because a read that brings back the same rows draws nothing again. Here the time is read
 * again as the app comes back to the front and every half minute while it is there, and a
 * screen that reads through this clock is drawn again only when its words change.
 *
 * One timer for the whole app, running only while something reads the clock and the app is in
 * front. Every reader is handed the same instant, so two labels on one screen never disagree.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { localCalendarDate, timeAgo, timeUntil } from '@/src/utils/timeAgo';

const TICK_MS = 30_000;

let now = Date.now();
const readers = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | null = null;
let heard: { remove: () => void } | null = null;

function advance() {
  now = Date.now();
  readers.forEach((r) => r());
}

function run() {
  if (!ticker) ticker = setInterval(advance, TICK_MS);
}

function halt() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

function subscribe(reader: () => void) {
  if (readers.size === 0) {
    now = Date.now();
    if (AppState.currentState !== 'background') run();
    // Back in front, the time is read at once; in the background the timer rests.
    heard = AppState.addEventListener('change', (next) => {
      if (next === 'active') { advance(); run(); } else if (next === 'background') halt();
    });
  }
  readers.add(reader);
  return () => {
    readers.delete(reader);
    if (readers.size > 0) return;
    halt();
    heard?.remove();
    heard = null;
  };
}

/** The instant every reader shares; read fresh when nothing is reading yet. */
const instant = () => (readers.size > 0 ? now : Date.now());

/**
 * What a screen draws from the time, drawn again only when it changes. `of` must return a
 * string, number or boolean, so two reads of the same words are the same.
 */
export function useClock<T extends string | number | boolean>(of: (now: number) => T): T {
  return useSyncExternalStore(subscribe, () => of(instant()));
}

/** "5 MIN. AGO", kept true. */
export const useTimeAgo = (at: string | Date | null | undefined) => useClock((t) => timeAgo(at, t));

/** "IN 3 DAYS", kept true; '' once it has passed. */
export const useTimeUntil = (at: string | Date | null | undefined) => useClock((t) => timeUntil(at, t));

/** Whether an instant has come: false for none. */
export const useHasPassed = (at: string | Date | null | undefined) =>
  useClock((t) => (at ? new Date(at).getTime() <= t : false));

/** Today on the member's calendar, as `YYYY-MM-DD`: it turns at their midnight. */
export const useToday = () => useClock((t) => localCalendarDate(0, t));

/** A list's "… AGO" labels, in its order: the screen is drawn again only when one changes. */
export function useTimesAgo(ats: readonly (string | Date | null | undefined)[]): string[] {
  const joined = useClock((t) => ats.map((at) => timeAgo(at, t)).join('\u001f'));
  return useMemo(() => joined.split('\u001f'), [joined]);
}
