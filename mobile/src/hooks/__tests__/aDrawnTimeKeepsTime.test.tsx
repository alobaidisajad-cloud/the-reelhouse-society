/**
 * A drawn time keeps time (P4.7).
 *
 * A label worked out once, as its row first drew, stayed as it was: a Reel card read "MOMENTS
 * AGO" a day later, because a read that brings back the same rows draws nothing again. The
 * shared clock reads the time again as the app comes back to the front and every half minute
 * while it is there; a label is drawn again only when its words change, and when nothing reads
 * the clock no timer and no listener are left behind.
 */
import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, cleanup, render } from '@testing-library/react-native';
import { Text } from '@/src/components/text';
import { useHasPassed, useTimeAgo, useTimesAgo, useTimeUntil, useToday } from '@/src/hooks/useClock';

let mockHeard: ((next: AppStateStatus) => void)[] = [];
/** The clock's own timers running: its half-minute interval, counted apart from the renderer's. */
let ticking = new Set<unknown>();
beforeEach(() => {
  mockHeard = [];
  ticking = new Set();
  jest.useFakeTimers({ now: new Date(2026, 9, 27, 12, 0, 0) });
  const set = global.setInterval;
  const clear = global.clearInterval;
  jest.spyOn(global, 'setInterval').mockImplementation(((fn: () => void, ms?: number) => {
    const id = set(fn, ms);
    if (ms === 30_000) ticking.add(id);
    return id;
  }) as typeof setInterval);
  jest.spyOn(global, 'clearInterval').mockImplementation(((id?: Parameters<typeof clearInterval>[0]) => {
    ticking.delete(id);
    clear(id);
  }) as typeof clearInterval);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    mockHeard.push(listener as (next: AppStateStatus) => void);
    return { remove: () => { mockHeard = mockHeard.filter((l) => l !== listener); } } as ReturnType<typeof AppState.addEventListener>;
  });
});
// The screens go while the fake clock and the heard listeners are still the ones they were drawn under.
afterEach(async () => {
  await act(async () => { await cleanup(); });
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Drawn, and its effects run. */
const draw = async (el: React.ReactElement) => {
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(el); });
  return r;
};
const say = (next: AppStateStatus) => act(async () => { mockHeard.forEach((l) => l(next)); });
const pass = (ms: number) => act(async () => { jest.advanceTimersByTime(ms); });

function Ago({ at }: { at: string }) {
  return <Text>{useTimeAgo(at)}</Text>;
}

it('a label drawn MOMENTS AGO says how long ago as time passes', async () => {
  const { getByText } = await draw(<Ago at={new Date().toISOString()} />);
  expect(getByText('MOMENTS AGO')).toBeTruthy();
  await pass(60_000);
  expect(getByText('1 MIN. AGO')).toBeTruthy();
});

it('back from a day away, the same label says a day', async () => {
  const { getByText } = await draw(<Ago at={new Date().toISOString()} />);
  expect(ticking.size).toBe(1);
  await say('background');
  // In the background the clock rests: its timer is gone.
  expect(ticking.size).toBe(0);
  jest.setSystemTime(Date.now() + 26 * 3_600_000);
  expect(getByText('MOMENTS AGO')).toBeTruthy();
  await say('active');
  expect(getByText('1 DAY AGO')).toBeTruthy();
});

it('is drawn again only when its words change', async () => {
  const drawn = jest.fn();
  await draw(<React.Profiler id="ago" onRender={drawn}><Ago at={new Date(Date.now() - 3 * 86_400_000).toISOString()} /></React.Profiler>);
  const first = drawn.mock.calls.length;
  await pass(10 * 60_000); // twenty readings of the clock, the same words each time
  expect(drawn).toHaveBeenCalledTimes(first);
  await pass(4 * 86_400_000); // and once the words change, it is drawn again
  expect(drawn.mock.calls.length).toBeGreaterThan(first);
});

it('an open ballot closes while it is read: the time left runs out, and it has passed', async () => {
  function Closing({ at }: { at: string }) {
    const left = useTimeUntil(at);
    const passed = useHasPassed(at);
    return <Text>{passed ? 'CLOSED' : `CLOSES ${left}`}</Text>;
  }
  const { getByText } = await draw(<Closing at={new Date(Date.now() + 90_000).toISOString()} />);
  expect(getByText('CLOSES IN 1 MIN.')).toBeTruthy();
  await pass(120_000);
  expect(getByText('CLOSED')).toBeTruthy();
});

it('today turns at the member’s midnight, with the screen open', async () => {
  jest.setSystemTime(new Date(2026, 9, 27, 23, 59, 50));
  function Today() { return <Text>{useToday()}</Text>; }
  const { getByText } = await draw(<Today />);
  expect(getByText('2026-10-27')).toBeTruthy();
  await pass(30_000);
  expect(getByText('2026-10-28')).toBeTruthy();
});

it('a list’s labels each keep time, in its order', async () => {
  const now = Date.now();
  function List({ ats }: { ats: string[] }) { return <Text>{useTimesAgo(ats).join(' | ')}</Text>; }
  const { getByText } = await draw(<List ats={[new Date(now).toISOString(), new Date(now - 2 * 3_600_000).toISOString()]} />);
  expect(getByText('MOMENTS AGO | 2 HRS. AGO')).toBeTruthy();
  await pass(3_600_000);
  expect(getByText('1 HR. AGO | 3 HRS. AGO')).toBeTruthy();
});

it('when the last reader leaves, no timer and no listener are left', async () => {
  const a = await draw(<Ago at={new Date().toISOString()} />);
  const b = await draw(<Ago at={new Date().toISOString()} />);
  // One timer and one listener for the whole app, however many read it.
  expect(ticking.size).toBe(1);
  expect(mockHeard).toHaveLength(1);
  await act(async () => { a.unmount(); });
  expect(ticking.size).toBe(1);
  await act(async () => { b.unmount(); });
  expect(ticking.size).toBe(0);
  expect(mockHeard).toHaveLength(0);
});
