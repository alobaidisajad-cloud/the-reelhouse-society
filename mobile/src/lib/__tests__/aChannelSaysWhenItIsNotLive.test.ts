/**
 * A channel says when it is not live, and reads what it missed (P4.8, P4.10).
 *
 * A live channel's status went unheard: back after a drop, what was said in the gap was never
 * read; down for good with the network up, its screen sat stale and said nothing.
 */
import { onlineManager } from '@tanstack/react-query';
import { NOT_LIVE_GRACE_MS, NOT_LIVE_REREAD_MS, watchChannel } from '../watchChannel';

let reread: jest.Mock;
let live: boolean[];
let watch: ReturnType<typeof watchChannel>;

beforeEach(() => {
  jest.useFakeTimers();
  reread = jest.fn();
  live = [];
  watch = watchChannel({ reread, onLive: (l) => live.push(l) });
});
afterEach(() => {
  watch.end();
  jest.useRealTimers();
  onlineManager.setOnline(true);
});

it('SUBSCRIBED, then CHANNEL_ERROR, then SUBSCRIBED: what was missed is read again', () => {
  watch.status('SUBSCRIBED');
  expect(reread).not.toHaveBeenCalled();
  watch.status('CHANNEL_ERROR');
  watch.status('SUBSCRIBED');
  expect(reread).toHaveBeenCalledTimes(1);
});

it('a drop shorter than a beat says nothing', () => {
  watch.status('SUBSCRIBED');
  watch.status('TIMED_OUT');
  jest.advanceTimersByTime(NOT_LIVE_GRACE_MS - 1);
  watch.status('SUBSCRIBED');
  jest.advanceTimersByTime(NOT_LIVE_REREAD_MS * 3);
  expect(live).toEqual([true, true]);
  expect(reread).toHaveBeenCalledTimes(1);
});

it('down past a beat: not live, read on the interval, and both stop when it answers', () => {
  watch.status('SUBSCRIBED');
  watch.status('CHANNEL_ERROR');
  jest.advanceTimersByTime(NOT_LIVE_GRACE_MS);
  expect(live).toEqual([true, false]);
  expect(reread).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(NOT_LIVE_REREAD_MS * 2);
  expect(reread).toHaveBeenCalledTimes(3);

  watch.status('SUBSCRIBED');
  expect(live).toEqual([true, false, true]);
  expect(reread).toHaveBeenCalledTimes(4);
  jest.advanceTimersByTime(NOT_LIVE_REREAD_MS * 3);
  expect(reread).toHaveBeenCalledTimes(4);
});

it('offline, the intervals pass and no read is made', () => {
  onlineManager.setOnline(false);
  watch.status('CLOSED');
  jest.advanceTimersByTime(NOT_LIVE_GRACE_MS + NOT_LIVE_REREAD_MS * 3);
  expect(live).toEqual([false]);
  expect(reread).not.toHaveBeenCalled();
});

it('a channel left on purpose reads nothing more and says nothing', () => {
  watch.status('SUBSCRIBED');
  watch.end();
  watch.status('CLOSED');
  jest.advanceTimersByTime(NOT_LIVE_GRACE_MS + NOT_LIVE_REREAD_MS);
  expect(live).toEqual([true]);
  expect(reread).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});
