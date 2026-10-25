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
  ...require('@/test-utils/expoRouterMock').expoRouterMock(),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));
jest.mock('expo-router/react-navigation', () => ({ ...require('@/test-utils/navigationMock').navigationMock(), useScrollToTop: jest.fn(), useIsFocused: () => true }));
/** What the screen tells the E2E run (silent in a member's build). */
const mockTrace = jest.fn();
jest.mock('@/src/utils/e2eTrace', () => ({ E2E_BUILD: false, e2eTrace: (...a: unknown[]) => mockTrace(...a) }));
jest.mock('@shopify/flash-list', () => require('@/mockups/tabs/flashListMock').makeFlashListMock());
jest.mock('@/src/stores/auth', () => {
  const s = { isAuthenticated: true, user: { id: 'me', username: 'kane', role: 'archivist', tier: 'archivist', preferences: {} } };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useAuthStore as any).getState = () => s;
  return { useAuthStore };
});
/** Who the member follows, and whether that list was read. */
let mockSocial: Record<string, unknown> = { following: [], followers: [], followingKnown: 'held' };
jest.mock('@/src/stores/followStore', () => {
  const useSocialStore = (sel?: (x: unknown) => unknown) => (sel ? sel(mockSocial) : mockSocial);
  (useSocialStore as any).getState = () => mockSocial;
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
// eslint-disable-next-line import/first
import { CROSSFADE_MS, HIDDEN, SHOWN } from '@/src/components/reels/sectionLayers';
// eslint-disable-next-line import/first
import { ARRIVAL_GRACE_MS } from '@/src/hooks/useArrival';

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
  mockSocial = { following: [], followers: [], followingKnown: 'held' };
  toast().error.mockClear();
});

// "Your orbit is quiet. Follow other members…" was said to a member who follows people,
// while the list of whom was still unread, or could not be read (P0.112).
describe('the following reel, before the follow list is known', () => {
  const following = async () => {
    const r = await mount();
    await act(async () => { await fireEvent.press(r.getByText('FOLLOWING')); });
    return r;
  };

  it('a list still unread: the reel is read, not quiet', async () => {
    mockSocial = { ...mockSocial, followingKnown: 'unread' };
    const r = await following();
    expect(r.queryByText('Your orbit is quiet.')).toBeNull();
    expect(r.queryByText('Transmission Interrupted')).toBeNull();
    expect(r.getByText('SPOOLING')).toBeTruthy();
  });

  it('a list that could not be read: the house\'s failure, whose TRY AGAIN reads the list again', async () => {
    const hydrate = jest.spyOn(require('@/src/stores/domain/socialSlice'), 'hydrateFollowing').mockResolvedValue(undefined);
    mockSocial = { ...mockSocial, followingKnown: 'failed' };
    const r = await following();
    expect(r.queryByText('Your orbit is quiet.')).toBeNull();
    await act(async () => { await fireEvent.press(r.getByLabelText('Try again')); });
    expect(hydrate).toHaveBeenCalledTimes(1);
    hydrate.mockRestore();
  });

  it('a list read, of nobody: the orbit is quiet', async () => {
    const r = await following();
    expect(r.getByText('Your orbit is quiet.')).toBeTruthy();
  });
});

const screenSaid = () => mockTrace.mock.calls.filter(([e]) => String(e).startsWith('screen.')).map(([e, d]) => `${e} ${d.name}`);

it('a feed it could not read is not "the projection booth is dark"', async () => {
  mockFeeds.community = failed();
  mockTrace.mockClear();
  const r = await mount();
  // And the E2E is told the reel failed: never that it was ready.
  expect(screenSaid()).toEqual(['screen.failed reel']);
  expect(r.queryByText('The projection booth is dark.')).toBeNull();
  expect(r.getAllByText('Transmission Interrupted').length).toBeGreaterThan(0);
  await act(async () => { await fireEvent.press(r.getAllByLabelText('Try again')[0]); });
  expect(mockFeeds.community.refetch).toHaveBeenCalledTimes(1);
});

it('stacks it could not read are not "the archive awaits its first curator"', async () => {
  mockFeeds.stacks = failed();
  const r = await mount();
  // (The stacks sit behind the logs until their tab is chosen: hidden, not absent.)
  const all = { includeHiddenElements: true };
  expect(r.queryByText('The archive awaits its first curator.', all)).toBeNull();
  expect(r.getByText('Transmission Interrupted', all)).toBeTruthy();
  await act(async () => { await fireEvent.press(r.getAllByLabelText('Stacks tab')[0]); });
  await act(async () => { await fireEvent.press(r.getByLabelText('Try again', all)); });
  expect(mockFeeds.stacks.refetch).toHaveBeenCalledTimes(1);
});

it('feeds that ARRIVED empty say so, as they always did', async () => {
  mockTrace.mockClear();
  const r = await mount();
  expect(screenSaid()).toEqual(['screen.ready reel']);
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

/**
 * The film tray (Sealed E2E run 38790116312): an animated style that never reached its
 * view. Once their crossfade is over, the two sections are drawn with plain styles, so a
 * member always sees the section their touches go to.
 */
it('once the crossfade is over, each section is drawn shown or hidden as its touches are', async () => {
  const r = await mount();
  const all = { includeHiddenElements: true };
  const layer = (s: 'logs' | 'stacks') => r.getByTestId(`reels-${s}-layer`, all);
  const drawn = (s: 'logs' | 'stacks') => {
    const own = (layer(s).props.style as unknown[]).flat();
    return own.includes(SHOWN) ? 'shown' : own.includes(HIDDEN) ? 'hidden' : 'crossfading';
  };
  const settle = () => act(async () => { await new Promise((done) => setTimeout(done, CROSSFADE_MS + ARRIVAL_GRACE_MS + 50)); });
  await settle();
  expect([drawn('logs'), layer('logs').props.pointerEvents, drawn('stacks'), layer('stacks').props.pointerEvents])
    .toEqual(['shown', 'auto', 'hidden', 'none']);
  await act(async () => { await fireEvent.press(r.getAllByLabelText('Stacks tab')[0]!); });
  expect([drawn('logs'), drawn('stacks'), layer('stacks').props.pointerEvents]).toEqual(['crossfading', 'crossfading', 'auto']);
  await settle();
  expect([drawn('logs'), layer('logs').props.pointerEvents, drawn('stacks'), layer('stacks').props.pointerEvents])
    .toEqual(['hidden', 'none', 'shown', 'auto']);
});

/**
 * The Reel's light, calmed (WORKLIST P0.110): it stacked a lamp, a wash, a projector beam
 * swinging and flickering over the feed, a sheen sweeping the curate button and two pulses,
 * and read as noise. It is one lamp over the room's floor; nothing on it breathes, sweeps or
 * flickers. Every layer the room draws under its two sections is named here, so a layer that
 * comes back unnamed fails.
 */
it('is lit by one lamp over its floor, and nothing on it moves on a loop', async () => {
  const looped = jest.requireMock('react-native-reanimated').withRepeat as jest.Mock;
  looped.mockClear();
  const log = { id: 1, user_id: 'u9', username: 'wren', role: 'cinephile', film_id: 238, film_title: 'Casablanca',
    rating: 4, review: 'Here.', poster_path: '/c.jpg', year: 1942, created_at: '2026-10-01T00:00:00Z', status: 'watched' };
  const stack = { id: '1a2b3c4d', title: 'Noir at Night', description: '', curator: 'wren', curatorId: 'u9',
    createdAt: '2026-09-01T00:00:00Z', films: [], count: 7, certifyCount: 2, isRanked: false };
  mockFeeds.community = query({ data: { pages: [[log]] } });
  mockFeeds.stacks = query({ data: { pages: [[stack]] } });
  const r = await mount();
  // The stacks' header holds the curate button and the chips: drawn, so its motion is counted too.
  const stacksHeader = mockListProps.stacks?.ListHeaderComponent;
  if (!stacksHeader) throw new Error('the stacks were not drawn');
  render(stacksHeader).unmount();

  type Node = { props?: Record<string, any>; children?: unknown[] | null };
  const { StyleSheet } = jest.requireActual('react-native');
  const find = (n: unknown): Node | undefined => {
    if (!n || typeof n !== 'object') return undefined;
    const node = n as Node;
    if ((node.children ?? []).some((c) => (c as Node)?.props?.testID === 'reels-logs-layer')) return node;
    for (const c of node.children ?? []) { const hit = find(c); if (hit) return hit; }
    return undefined;
  };
  const room = find(r.toJSON());
  if (!room) throw new Error('the Reel was not drawn');
  // (The screen's ready mark is drawn at no size, out of the layout: it paints nothing.)
  const painted = (room.children as Node[]).filter((c) => {
    const s = StyleSheet.flatten(c.props?.style) ?? {};
    return !(s.width === 0 && s.height === 0);
  });
  expect(painted.map((c) => c.props?.testID ?? 'a layer with no name'))
    .toEqual(['room-light', 'reel-floor', 'reels-logs-layer', 'reels-stacks-layer']);
  expect(looped).not.toHaveBeenCalled();
});
