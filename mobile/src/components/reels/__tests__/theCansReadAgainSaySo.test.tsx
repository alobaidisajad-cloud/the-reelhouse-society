/**
 * theCansReadAgainSaySo.test.tsx — review round 12.
 *
 * The Reel's stacks keep the last answer on screen while new words (or FOLLOWING) are asked.
 * They were drawn as the answer to the new words: pressable, with no mark that anything was being
 * asked, and an empty last answer said "No stacks match your search." before the house had
 * answered the new one. Now the cans held over are drawn as being read again (dimmed, not
 * pressed, not heard, "READING…" in the box), an empty one is the reading frame, and no next
 * page of the last answer is asked under the new words.
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import type { StackData } from '@/src/components/reels/types';

jest.mock('expo-router', () => ({
  ...require('@/test-utils/expoRouterMock').expoRouterMock(),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));
jest.mock('expo-router/react-navigation', () => ({ ...require('@/test-utils/navigationMock').navigationMock(), useScrollToTop: jest.fn(), useIsFocused: () => true }));
jest.mock('@/src/utils/e2eTrace', () => ({ E2E_BUILD: false, e2eTrace: jest.fn() }));
jest.mock('@shopify/flash-list', () => require('@/mockups/tabs/flashListMock').makeFlashListMock());
const mockAuth = { isAuthenticated: true, user: { id: 'me', username: 'kane', role: 'archivist', tier: 'archivist', preferences: {} } };
jest.mock('@/src/stores/auth', () => {
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(mockAuth) : mockAuth);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => mockAuth;
  return { useAuthStore };
});
const mockSocial = { following: [], followers: [], followingKnown: 'held' };
jest.mock('@/src/stores/followStore', () => {
  const useSocialStore = (sel?: (x: unknown) => unknown) => (sel ? sel(mockSocial) : mockSocial);
  (useSocialStore as unknown as { getState: () => unknown }).getState = () => mockSocial;
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
jest.mock('@/src/components/reels/ReelsFeedList', () => ({ ReelsFeedList: () => null }));
/** The stack list's props, as the screen last drew it. */
const mockStackProps: { current: Record<string, any> } = { current: {} };
jest.mock('@/src/components/reels/ReelsStackList', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  const draw = (C: unknown) => (!C ? null : mockReact.isValidElement(C) ? C : mockReact.createElement(C));
  return {
    ReelsStackList: (props: Record<string, any>) => {
      mockStackProps.current = props;
      return mockReact.createElement(View, null, props.stacks.length ? null : draw(props.ListEmptyComponent));
    },
  };
});

// eslint-disable-next-line import/first
import ReelScreen from '@/app/(tabs)/reels';

const can = (n: number): StackData => ({
  id: `s${n}`, title: `Noir ${n}`, description: '', curator: 'kane', curatorId: 'u1', createdAt: '2026-11-10T10:00:00Z',
  films: [], count: 0, certifyCount: 0, isRanked: false,
});
const query = (over: Record<string, unknown> = {}) => ({
  data: { pages: [[]] }, isLoading: false, isError: false, refetch: jest.fn(async () => ({ isError: false })),
  fetchNextPage: jest.fn(), hasNextPage: false, isFetchingNextPage: false, isPlaceholderData: false, ...over,
});

async function mount() {
  let r!: ReturnType<typeof render>;
  const client = testQueryClient({ queries: { enabled: false } });
  await act(async () => { r = render(<QueryClientProvider client={client}><ReelScreen /></QueryClientProvider>); });
  return r;
}

beforeEach(() => {
  mockFeeds = { community: query(), following: query(), stacks: query() };
});

describe('the last answer, held while new words are asked', () => {
  beforeEach(() => {
    mockFeeds.stacks = query({ data: { pages: [[can(1), can(2)]] }, isPlaceholderData: true, hasNextPage: true });
  });

  it('is drawn as being read again: its cans not pressed, not heard', async () => {
    await mount();
    expect(mockStackProps.current.rereading).toBe(true);
  });

  it('says so in the box, without moving the cans', async () => {
    await mount();
    const head = render(mockStackProps.current.ListHeaderComponent);
    expect(head.getByText('READING…')).toBeTruthy();
    expect(head.getByLabelText('Reading the cans')).toBeTruthy();
    head.unmount();
  });

  it('asks no next page of the last answer under the new words', async () => {
    await mount();
    expect(mockStackProps.current.onEndReached).toBeUndefined();
    expect(mockStackProps.current.footer).toBeNull();
  });
});

it('an empty last answer, held while new words are asked, is the reading frame, never "no match"', async () => {
  mockFeeds.stacks = query({ data: { pages: [[]] }, isPlaceholderData: true });
  await mount();
  const empty = render(mockStackProps.current.ListEmptyComponent);
  expect(empty.getByLabelText('Reading the stacks')).toBeTruthy();
  expect(empty.queryByText('The archive awaits its first curator.')).toBeNull();
  empty.unmount();
});

it('the answer to the words in the box is drawn as it is, and reads on at its foot', async () => {
  mockFeeds.stacks = query({ data: { pages: [[can(1), can(2)]] }, hasNextPage: true });
  await mount();
  expect(mockStackProps.current.rereading).toBe(false);
  const head = render(mockStackProps.current.ListHeaderComponent);
  expect(head.queryByText('READING…')).toBeNull();
  head.unmount();
  await act(async () => { mockStackProps.current.onEndReached(); });
  expect(mockFeeds.stacks.fetchNextPage).toHaveBeenCalledTimes(1);
});

describe('the stack list, while its cans are read again', () => {
  const { ReelsStackList } = jest.requireActual('@/src/components/reels/ReelsStackList');
  // Reanimated as the test world holds it (jest.setup.ts): its worklets are native.
  const { useSharedValue } = require('react-native-reanimated');

  function Drawn({ rereading }: { rereading: boolean }) {
    const y = useSharedValue(0);
    const tab = useSharedValue('stacks');
    return (
      <ReelsStackList
        stacks={[can(1)]} rereading={rereading} refreshing={false} onRefresh={() => {}} topPad={0}
        stacksScrollY={y} activeTabSV={tab} ListHeaderComponent={<></>} ListEmptyComponent={<></>}
        onCurate={() => {}} contentContainerStyle={{}} listRef={{ current: null }} footer={null}
      />
    );
  }

  it('dims each can, takes no press and is not heard', async () => {
    const r = await render(<Drawn rereading />);
    const held = r.getByTestId('reel-stack', { includeHiddenElements: true });
    expect(held.props.pointerEvents).toBe('none');
    expect(held.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(held.props.accessibilityElementsHidden).toBe(true);
    expect(held.props.style).toMatchObject({ opacity: 0.4 });
  });

  it('the answer itself is pressed and heard as ever', async () => {
    const r = await render(<Drawn rereading={false} />);
    const can1 = r.getByTestId('reel-stack');
    expect(can1.props.pointerEvents).toBe('auto');
    expect(can1.props.accessibilityElementsHidden).toBe(false);
  });
});
