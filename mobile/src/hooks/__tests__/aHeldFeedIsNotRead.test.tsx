/**
 * A feed the Reel holds back is not read until it is asked (P4.53).
 *
 * The Reel opened on the house's logs and read the following feed and the stacks beside them,
 * three answers parsed while its first frame was drawn. The two it does not open on are held
 * (`asked` false) until the logs have answered or the member turns to them. Driven through the
 * real feed hooks and the real client; only the house's answers are stood in.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { useFollowingFeed, useStacksFeed } from '../useFeeds';

const mockFollowing = jest.fn();
const mockStacks = jest.fn();
jest.mock('@/src/services/FeedService', () => ({
  ...jest.requireActual('@/src/services/FeedService'),
  FeedService: {
    getFollowingFeed: (o: unknown) => mockFollowing(o),
    getStacksFeed: (...a: unknown[]) => mockStacks(...a),
  },
}));
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { id: 'me' } }),
}));
jest.mock('@/src/stores/followStore', () => {
  const s = { following: ['someone'] };
  const useSocialStore = (sel: (x: unknown) => unknown) => sel(s);
  (useSocialStore as unknown as { getState: () => unknown }).getState = () => s;
  return { useSocialStore };
});
jest.mock('@/src/stores/blockStore', () => ({
  useBlockStore: { getState: () => ({ isHidden: () => false }) },
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(testQueryClient);
  return React.createElement(QueryClientProvider, { client }, children);
}
const useBoth = (asked: boolean) => ({
  following: useFollowingFeed(undefined, asked),
  stacks: useStacksFeed('all', '', undefined, asked),
});

beforeEach(() => {
  mockFollowing.mockReset().mockResolvedValue([]);
  mockStacks.mockReset().mockResolvedValue([]);
});

it('reads neither while held, and both once asked', async () => {
  const r = await renderHook(({ asked }: { asked: boolean }) => useBoth(asked), { wrapper: Wrapper, initialProps: { asked: false } });
  expect(r.result.current.following.fetchStatus).toBe('idle');
  expect(r.result.current.stacks.fetchStatus).toBe('idle');
  expect(mockFollowing).not.toHaveBeenCalled();
  expect(mockStacks).not.toHaveBeenCalled();

  await r.rerender({ asked: true });
  await waitFor(() => expect(r.result.current.stacks.data).toBeDefined());
  expect(mockFollowing).toHaveBeenCalledTimes(1);
  expect(mockStacks).toHaveBeenCalledTimes(1);
});
