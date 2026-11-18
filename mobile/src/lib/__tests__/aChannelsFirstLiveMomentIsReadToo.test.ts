/**
 * A channel's first live moment is read too (review round 13, watchChannel).
 *
 * A screen reads its words, and its channel goes live a moment later: what was said between the
 * two was in neither, and watchChannel read again only after a break, never at the channel's first
 * SUBSCRIBED. Now the first SUBSCRIBED asks the screen to read what it missed (onFirstLive), once;
 * a break and a return read again as before (reread), never the first-live read a second time.
 */
import { onlineManager } from '@tanstack/react-query';
import { watchChannel } from '../watchChannel';

let reread: jest.Mock;
let firstLive: jest.Mock;
let watch: ReturnType<typeof watchChannel>;

beforeEach(() => {
  jest.useFakeTimers();
  reread = jest.fn();
  firstLive = jest.fn();
  watch = watchChannel({ reread, onLive: () => {}, onFirstLive: firstLive });
});
afterEach(() => {
  watch.end();
  jest.useRealTimers();
  onlineManager.setOnline(true);
});

it('the first SUBSCRIBED asks the screen to read what came since its read, once', () => {
  watch.status('SUBSCRIBED');
  expect(firstLive).toHaveBeenCalledTimes(1);
  watch.status('SUBSCRIBED');
  expect(firstLive).toHaveBeenCalledTimes(1);
  expect(reread).not.toHaveBeenCalled();
});

it('a break and a return read again as before, never the first-live read twice', () => {
  watch.status('SUBSCRIBED');
  watch.status('CHANNEL_ERROR');
  watch.status('SUBSCRIBED');
  expect([firstLive.mock.calls.length, reread.mock.calls.length]).toEqual([1, 1]);
});

it('offline, nothing is read', () => {
  onlineManager.setOnline(false);
  watch.status('SUBSCRIBED');
  expect(firstLive).not.toHaveBeenCalled();
});

it('a channel left on purpose reads nothing more', () => {
  watch.end();
  watch.status('SUBSCRIBED');
  expect(firstLive).not.toHaveBeenCalled();
});

it('a screen that asks nothing at its first live moment is not asked', () => {
  const plain = watchChannel({ reread, onLive: () => {} });
  expect(() => plain.status('SUBSCRIBED')).not.toThrow();
  plain.end();
});
