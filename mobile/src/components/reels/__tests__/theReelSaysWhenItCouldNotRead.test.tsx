/**
 * theReelSaysWhenItCouldNotRead.test.tsx — the Reel, when its feeds could not
 * be read.
 *
 * The feeds threw (FeedService says so), and the screen never asked: a member
 * with no signal was told "The projection booth is dark. Be the first to log a
 * film and leave your mark." — and, of the stacks, "The archive awaits its
 * first curator." Now: the house's failed state and TRY AGAIN; the honest
 * empty states only for feeds that ARRIVED empty; and a pull that reached
 * nothing says so over the reel it keeps.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));
jest.mock('@react-navigation/native', () => ({ useScrollToTop: jest.fn(), useIsFocused: () => true }));
jest.mock('@shopify/flash-list', () => require('@/mockups/tabs/flashListMock').makeFlashListMock());
jest.mock('@/src/stores/auth', () => {
  const s = { isAuthenticated: true, user: { id: 'me', username: 'kane', role: 'archivist', tier: 'archivist', preferences: {} } };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useAuthStore as any).getState = () => s;
  return { useAuthStore };
});
jest.mock('@/src/stores/followStore', () => {
  const s = { following: [], followers: [] };
  const useSocialStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useSocialStore as any).getState = () => s;
  return { useSocialStore };
});
jest.mock('@/src/utils/reelToast', () => {
  const t = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: t };
});
/** Each feed as React Query would hand it back. */
let mockFeeds: Record<'community' | 'following' | 'stacks', Record<string, unknown>>;
jest.mock('@/src/hooks/useFeeds', () => ({
  useCommunityFeed: () => mockFeeds.community,
  useFollowingFeed: () => mockFeeds.following,
  useStacksFeed: () => mockFeeds.stacks,
}));
/** The lists' own props, as the screen last drew them (the pull lives there). */
const mockListProps: Record<string, Record<string, any>> = {};
jest.mock('@/src/components/reels/ReelsFeedList', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  const draw = (C: unknown) => (!C ? null : mockReact.isValidElement(C) ? C : mockReact.createElement(C));
  return {
    ReelsFeedList: (props: Record<string, any>) => {
      mockListProps.feed = props;
      return mockReact.createElement(View, null, draw(props.ListHeaderComponent), props.feed.length ? null : draw(props.ListEmptyComponent));
    },
  };
});
jest.mock('@/src/components/reels/ReelsStackList', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  const draw = (C: unknown) => (!C ? null : mockReact.isValidElement(C) ? C : mockReact.createElement(C));
  return {
    ReelsStackList: (props: Record<string, any>) => {
      mockListProps.stacks = props;
      return mockReact.createElement(View, null, props.stacks.length ? null : draw(props.ListEmptyComponent));
    },
  };
});

// eslint-disable-next-line import/first
import ReelScreen from '@/app/(tabs)/reels';

const query = (over: Record<string, unknown> = {}) => ({
  data: undefined, isLoading: false, isError: false, refetch: jest.fn(async () => ({ isError: false })),
  fetchNextPage: jest.fn(), hasNextPage: false, isFetchingNextPage: false, ...over,
});
const failed = () => query({ isError: true });
const arrivedEmpty = () => query({ data: { pages: [[]] } });
const toast = () => jest.requireMock('@/src/utils/reelToast').default;

async function mount() {
  let r!: ReturnType<typeof render>;
  // (The Member Registry reads its own members.)
  const client = testQueryClient({ queries: { enabled: false } });
  await act(async () => { r = render(<QueryClientProvider client={client}><ReelScreen /></QueryClientProvider>); });
  return r;
}

beforeEach(() => {
  mockFeeds = { community: arrivedEmpty(), following: arrivedEmpty(), stacks: arrivedEmpty() };
  toast().error.mockClear();
});

it('a feed it could not read is not "the projection booth is dark"', async () => {
  mockFeeds.community = failed();
  const r = await mount();
  expect(r.queryByText('The projection booth is dark.')).toBeNull();
  expect(r.getAllByText('Transmission Interrupted').length).toBeGreaterThan(0);
  await act(async () => { fireEvent.press(r.getAllByLabelText('Try again')[0]); });
  expect(mockFeeds.community.refetch).toHaveBeenCalledTimes(1);
});

it('stacks it could not read are not "the archive awaits its first curator"', async () => {
  mockFeeds.stacks = failed();
  const r = await mount();
  // (The stacks sit behind the logs until their tab is chosen: hidden, not absent.)
  const all = { includeHiddenElements: true };
  expect(r.queryByText('The archive awaits its first curator.', all)).toBeNull();
  expect(r.getByText('Transmission Interrupted', all)).toBeTruthy();
  await act(async () => { fireEvent.press(r.getAllByLabelText('Stacks tab')[0]); });
  await act(async () => { fireEvent.press(r.getByLabelText('Try again', all)); });
  expect(mockFeeds.stacks.refetch).toHaveBeenCalledTimes(1);
});

it('feeds that ARRIVED empty say so, as they always did', async () => {
  const r = await mount();
  expect(r.getByText('The projection booth is dark.')).toBeTruthy();
  expect(r.getByText('The archive awaits its first curator.', { includeHiddenElements: true })).toBeTruthy();
  expect(r.queryByText('Transmission Interrupted')).toBeNull();
});

it('a pull that reaches nothing keeps the reel and says so', async () => {
  mockFeeds.community = query({
    data: { pages: [[]] },
    refetch: jest.fn(async () => ({ isError: true, data: { pages: [[]] } })),
  });
  await mount();
  await act(async () => { await mockListProps.feed.onRefresh(); });
  expect(toast().error).toHaveBeenCalledWith('Could not refresh — check your connection.');
});

it('a pull that was answered says nothing', async () => {
  await mount();
  await act(async () => { await mockListProps.feed.onRefresh(); });
  // The pull did ask the feed, and was answered: silence is earned, not assumed.
  expect(mockFeeds.community.refetch).toHaveBeenCalled();
  expect(toast().error).not.toHaveBeenCalled();
});

it('the stacks search says what it searches: stacks, not "the archives"', async () => {
  await mount();
  const head = render(mockListProps.stacks.ListHeaderComponent);
  expect(head.getByPlaceholderText('SEARCH STACKS...')).toBeTruthy();
  expect(head.getByLabelText('Search curated stacks')).toBeTruthy();
  head.unmount();
});
