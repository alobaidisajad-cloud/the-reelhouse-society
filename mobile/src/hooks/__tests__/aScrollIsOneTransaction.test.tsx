/**
 * aScrollIsOneTransaction.test.tsx — each scroll of a list opens one Sentry
 * transaction when it begins and closes it when the list comes to rest, a
 * fling's glide included, named by its screen's route and its list.
 */
import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { NavigationRouteContext } from "expo-router/react-navigation";
import { useAnimatedReaction } from 'react-native-reanimated';
import { NO_SCREEN, SCROLL_SETTLE_MS, useScrollTrace, useScrollTraceOf } from '@/src/hooks/useScrollTrace';
import { startScrollSpan } from '@/src/lib/sentry';

jest.mock('@/src/lib/sentry', () => ({ startScrollSpan: jest.fn() }));

const opened: { name: string; ended: number }[] = [];
beforeEach(() => {
  jest.useFakeTimers();
  opened.length = 0;
  (startScrollSpan as jest.Mock).mockImplementation((name: string) => {
    const span = { name, ended: 0 };
    opened.push(span);
    return () => { span.ended += 1; };
  });
});
afterEach(() => { jest.useRealTimers(); });

const pass = (ms: number) => act(() => { jest.advanceTimersByTime(ms); });

/** Drawn inside a screen whose route is `reels`, as the Reel tab's lists are. */
const onTheReel = { wrapper: ({ children }: { children: React.ReactNode }) => (
  <NavigationRouteContext.Provider value={{ key: 'reels-1', name: 'reels' } as never}>{children}</NavigationRouteContext.Provider>
) };

it('names a scroll from no screen as such', async () => {
  const { result, unmount } = await renderHook(() => useScrollTrace());
  await act(() => { result.current.begin(); });
  expect(opened).toEqual([{ name: NO_SCREEN, ended: 0 }]);
  await unmount();
});

it('opens one transaction for a drag and the glide after it, and closes it at rest', async () => {
  const { result, unmount } = await renderHook(() => useScrollTrace('logs'), onTheReel);
  await act(() => { result.current.begin(); });
  await act(() => { result.current.begin(); });
  expect(opened).toEqual([{ name: 'reels logs', ended: 0 }]);
  // The drag ends; the glide begins before the scroll is called over, and runs past that wait.
  await act(() => { result.current.settle(); });
  await pass(SCROLL_SETTLE_MS - 1);
  await act(() => { result.current.begin(); });
  await pass(SCROLL_SETTLE_MS * 2);
  expect(opened).toEqual([{ name: 'reels logs', ended: 0 }]);
  await act(() => { result.current.settle(); });
  await pass(SCROLL_SETTLE_MS - 1);
  expect(opened).toEqual([{ name: 'reels logs', ended: 0 }]);
  await pass(1);
  expect(opened).toEqual([{ name: 'reels logs', ended: 1 }]);
  // The next drag is the next scroll.
  await act(() => { result.current.begin(); });
  expect(opened.map((s) => s.ended)).toEqual([1, 0]);
  await unmount();
});

it('a list that leaves mid-scroll closes its scroll, once', async () => {
  const { result, unmount } = await renderHook(() => useScrollTrace(), onTheReel);
  await act(() => { result.current.begin(); });
  await act(() => { result.current.settle(); });
  await unmount();
  expect(opened).toEqual([{ name: 'reels', ended: 1 }]);
  await pass(SCROLL_SETTLE_MS * 2);
  expect(opened[0].ended).toBe(1);
});

it('hands a plain list the four events that begin and end a scroll', async () => {
  const { result, unmount } = await renderHook(() => useScrollTrace(), onTheReel);
  const p = result.current.traceProps;
  expect(Object.keys(p).sort()).toEqual(['onMomentumScrollBegin', 'onMomentumScrollEnd', 'onScrollBeginDrag', 'onScrollEndDrag']);
  await act(() => { p.onScrollBeginDrag(); p.onScrollEndDrag(); p.onMomentumScrollBegin(); p.onMomentumScrollEnd(); });
  await pass(SCROLL_SETTLE_MS);
  expect(opened).toEqual([{ name: 'reels', ended: 1 }]);
  await unmount();
});

it('follows a list’s own isScrolling: true begins, false ends', async () => {
  const isScrolling = { value: false } as never;
  const { unmount } = await renderHook(() => useScrollTraceOf(isScrolling, 'stacks'), onTheReel);
  const [read, react] = (useAnimatedReaction as jest.Mock).mock.calls.at(-1) as [() => boolean, (now: boolean, before: boolean | null) => void];
  expect(read()).toBe(false);
  await act(() => { react(false, null); });
  expect(opened).toEqual([]);
  await act(() => { react(true, false); });
  expect(opened).toEqual([{ name: 'reels stacks', ended: 0 }]);
  await act(() => { react(false, true); });
  await pass(SCROLL_SETTLE_MS);
  expect(opened).toEqual([{ name: 'reels stacks', ended: 1 }]);
  await unmount();
});
