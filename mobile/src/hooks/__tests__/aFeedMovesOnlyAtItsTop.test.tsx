/**
 * A feed moves only at its top (P4.7).
 *
 * Coming back to the app read nothing again: React Query never heard the return, and a Reel left
 * open for an hour showed the hour-old feed. A feed fetched again under the member's thumb would
 * move every row they were reading, so the Reel's feeds are fetched again on return, or as the
 * connection comes back, only while their list stands at its top; below it nothing is fetched
 * and nothing moves, and the missed fetch runs once when the member reaches the top again.
 * Driven through the real feed hook and the real client; only the house's answer is stood in.
 */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { focusManager, onlineManager, QueryClientProvider } from '@tanstack/react-query';
import type { SharedValue } from 'react-native-reanimated';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { useCommunityFeed } from '../useFeeds';
import { useFeedTop } from '../useFeedTop';

const mockCommunity = jest.fn();
jest.mock('@/src/services/FeedService', () => ({
  ...jest.requireActual('@/src/services/FeedService'),
  FeedService: { getCommunityFeed: (o: unknown) => mockCommunity(o) },
}));
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { id: 'me' } }),
}));
jest.mock('@/src/stores/blockStore', () => ({
  useBlockStore: { getState: () => ({ isHidden: () => false }) },
}));

const row = (id: string) => ({ id, user_id: 'author', created_at: '2026-10-27T10:00:00Z' });
/** The list's place: read on the UI thread, which is a stand-in here; the crossing is told by hand. */
const scrollY = { value: 0 } as SharedValue<number>;
const FEEDS = [['feed', 'community']] as const;

function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(testQueryClient);
  return React.createElement(QueryClientProvider, { client }, children);
}
function useReel() {
  const { whenBack, reach } = useFeedTop(scrollY, FEEDS);
  return { feed: useCommunityFeed(whenBack), reach };
}

const opened = Date.now();
/** Away long enough that the feed is older than a read stays fresh. */
const anHourLater = () => jest.spyOn(Date, 'now').mockReturnValue(opened + 3_600_000);
const backInTheApp = () => act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); });
const reconnected = () => act(async () => { onlineManager.setOnline(false); onlineManager.setOnline(true); });
const drawn = (r: { current: ReturnType<typeof useReel> }) => r.current.feed.data?.pages.flat().map((x) => x.id);

beforeEach(() => {
  mockCommunity.mockReset();
  mockCommunity.mockResolvedValueOnce([row('a'), row('b')]).mockResolvedValue([row('new'), row('a'), row('b')]);
});
afterEach(() => {
  jest.restoreAllMocks();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
});

it('at the top, a return fetches the feed again and draws the new row', async () => {
  const { result } = await renderHook(useReel, { wrapper: Wrapper });
  await waitFor(() => expect(drawn(result)).toEqual(['a', 'b']));
  anHourLater();
  await backInTheApp();
  await waitFor(() => expect(drawn(result)).toEqual(['new', 'a', 'b']));
  expect(mockCommunity).toHaveBeenCalledTimes(2);
});

it('below the top, a return fetches nothing and moves nothing; back at the top, it fetches once', async () => {
  const { result } = await renderHook(useReel, { wrapper: Wrapper });
  await waitFor(() => expect(drawn(result)).toEqual(['a', 'b']));
  await act(async () => { result.current.reach(false); });
  anHourLater();
  await backInTheApp();
  expect(mockCommunity).toHaveBeenCalledTimes(1);
  expect(drawn(result)).toEqual(['a', 'b']);

  await act(async () => { result.current.reach(true); });
  await waitFor(() => expect(drawn(result)).toEqual(['new', 'a', 'b']));
  await act(async () => { result.current.reach(false); result.current.reach(true); });
  expect(mockCommunity).toHaveBeenCalledTimes(2);
});

it('below the top, the connection coming back fetches nothing; at the top, it draws the new row', async () => {
  const { result } = await renderHook(useReel, { wrapper: Wrapper });
  await waitFor(() => expect(drawn(result)).toEqual(['a', 'b']));
  await act(async () => { result.current.reach(false); });
  await reconnected();
  expect(mockCommunity).toHaveBeenCalledTimes(1);
  expect(drawn(result)).toEqual(['a', 'b']);

  await act(async () => { result.current.reach(true); });
  // The missed reconnect is caught up only if the feed is older than it stays fresh: it is not yet.
  expect(mockCommunity).toHaveBeenCalledTimes(1);
  await reconnected();
  await waitFor(() => expect(drawn(result)).toEqual(['new', 'a', 'b']));
});
