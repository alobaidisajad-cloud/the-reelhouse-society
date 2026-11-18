/**
 * aCritiqueAnnouncedOnThePageIsReadThere.test.tsx — review round 12
 * ─────────────────────────────────────────────────────────────────────────────
 * An author reading their own filing is pushed "A New Critique". Tapped, the push was marked read
 * and did nothing more (the page was in front, and round 4 stopped stacking a copy of it): the
 * critique it announced never came onto the page, and a filing has no pull to read it. Now the page
 * in front is told, and reads its filing and its critiques again, in the order chosen. Driven
 * through the real store, the real reader and the real tap; only the house is the shared fake.
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import FilingReader from '@/app/dispatch/[id]';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useDispatch } from '@/src/stores/dispatch';
import { useAuthStore } from '@/src/stores/auth';
import { useNotificationStore, type AppNotification } from '@/src/stores/notificationStore';
import { noteCurrentPath } from '@/src/utils/openSociety';
import { openNoticeFromPush } from '@/src/utils/openNoticeFromPush';
import { nav } from '@/src/utils/typedRouter';

const ME = '33333333-3333-4333-8333-333333333333';
const CRITIC = '66666666-6666-4666-8666-666666666666';
const FILING = '00000017-0000-4000-8000-000000000017';
const PEOPLE = [
  { id: CRITIC, username: 'ozu', member_no: 7, tier: 'free', role: null, is_founding: false, avatar_url: null },
  { id: ME, username: 'kane', member_no: 42, tier: 'free', role: null, is_founding: false, avatar_url: null },
];
const TAKE = {
  id: FILING, kind: 'take', user_id: ME, author_username: 'kane', body: 'Ozu never moves the camera.',
  is_published: true, certify_count: 0, comment_count: 0, created_at: '2026-11-16T21:00:00Z',
};
const CRITIQUE = {
  id: '77777777-7777-4777-8777-777777777777', post_id: FILING, user_id: CRITIC, author_username: 'ozu',
  body: 'He moves it twice, in The Only Son.', certify_count: 0, created_at: '2026-11-17T09:00:00Z',
};

const house = (critiques: Record<string, unknown>[], commentCount: number) => supabaseFake({
  rows: {
    dispatch_posts: [{ ...TAKE, comment_count: commentCount }], dispatch_comments: critiques, profiles: PEOPLE,
    lobby_editions: [], dispatch_certifications: [], dispatch_saves: [], dispatch_votes: [], notifications: [],
  },
});
let mockHouse = house([], 0);
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
jest.mock('@/src/components/moderation/ContentActionSheet', () => ({ ContentActionSheet: () => null }));
jest.mock('@/src/components/moderation/ReportSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/src/utils/offlineQueue', () => ({ enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [] }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));
jest.mock('@/src/lib/pushPrimer', () => ({ offerWord: jest.fn() }));

const MEMBER = { id: ME, username: 'kane', member_no: 42, avatar_url: null };
const settle = async () => {
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
};
const NOTICE: AppNotification = {
  id: 'n1', user_id: ME, type: 'comment', message: 'left a critique on your take.', read: false,
  created_at: '2026-11-17T09:00:01Z', group_key: `endorse:post:${FILING}`, from_username: 'ozu',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockHouse = house([], 0);
  useAuthStore.setState({ user: MEMBER } as never);
  (useLocalSearchParams as unknown as jest.Mock).mockReturnValue({ id: FILING });
  useDispatch.setState({
    filings: [], opened: {}, critiques: {}, critiquesLoading: {}, critiquesHasMore: {}, critiquesOrder: {},
    certifiedIds: new Set(), savedIds: new Set(), myVotes: {},
    marksKnown: { certified: new Set(), saved: new Set(), voted: new Set() },
    certifiedCritiqueIds: new Set(), critiqueMarksKnown: new Set(),
  } as never);
  useNotificationStore.setState({ notifications: [NOTICE], markRead: jest.fn(async () => {}) } as never);
});

it('a critique pushed while its filing is read, tapped, is read onto the page, and no copy of the page is opened', async () => {
  const r = render(<FilingReader />);
  await settle();
  expect(r.queryByText(CRITIQUE.body)).toBeNull();

  // Ozu files a critique; the author, reading the filing, taps the push that announces it.
  mockHouse = house([CRITIQUE], 1);
  noteCurrentPath(`/dispatch/${FILING}`);
  await act(async () => { await openNoticeFromPush('n1'); });
  await settle();

  expect(nav.push).not.toHaveBeenCalled();
  expect(r.getByText(CRITIQUE.body)).toBeTruthy();
  await r.unmount();
});
