/**
 * aVerdictsNoticeOpensItWhole.test.tsx — review round 14
 * ─────────────────────────────────────────────────────────────────────────────
 * A member warned, suspended or banned read the house's reason in a notice cut at three lines, and
 * tapping it only marked it read: no screen showed the reason whole, and there was no appeal. A
 * notice of the house's now names its verdict, and opens it whole over the board (VerdictSheet),
 * from its row, from its push (the board opened at ?verdict=), and from its push with the board open.
 * And another member's words in a notice (a ballot's title, a salon's name) are struck for a member
 * who asked to hide slurs, as they are on the ballot and the salon themselves.
 */
import React, { act } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { supabaseFake } from '@/test-utils/supabaseFake';

// The board's read fails, so the notices set below stay on it as the cached board.
const mockHouse = supabaseFake({ fail: { notifications: { code: 'NETWORK', message: 'Network request failed' } } });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
const mockMe = { user: { id: 'me', username: 'kane', preferences: { hide_slurs: true } as Record<string, unknown> }, isAuthenticated: true };
jest.mock('@/src/stores/auth', () => {
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(mockMe) : mockMe);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => mockMe;
  (useAuthStore as unknown as { subscribe: () => () => void }).subscribe = () => () => {};
  return { useAuthStore };
});
jest.mock('expo-router/react-navigation', () => ({ ...require('@/test-utils/navigationMock').navigationMock(), useIsFocused: () => true }));
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
jest.mock('@/src/hooks/useFollowRequests', () => ({ refreshFollowRequestCount: jest.fn() }));
jest.mock('@/src/components/profile/FollowRequestsPanel', () => () => null);
// The verdict sheet itself is under test in its own file: here, which verdict the board opens.
jest.mock('@/src/components/moderation/VerdictSheet', () => {
  const { Text: T } = require('react-native');
  return { VerdictSheet: ({ verdictId }: { verdictId: string | null }) => (verdictId ? <T testID="verdict-sheet">{verdictId}</T> : null) };
});

// eslint-disable-next-line import/first
import { useNotificationStore, type AppNotification } from '@/src/stores/notificationStore';
// eslint-disable-next-line import/first
import { nav } from '@/src/utils/typedRouter';
// eslint-disable-next-line import/first
import { noticeRoute } from '@/src/utils/noticeRoute';
// eslint-disable-next-line import/first
import { tellThePageInFront } from '@/src/utils/pageInFront';
// eslint-disable-next-line import/first
import NotificationsModal from '../notifications-modal';

const VERDICT = '33333333-3333-4333-8333-333333333333';
const LONG_REASON = 'Your review of a member’s log named them in words the house does not allow, and repeated them after a warning. '.repeat(3).trim();
const notice = (over: Partial<AppNotification>): AppNotification => ({
  id: 'n', user_id: 'me', type: 'moderation', message: 'x', read: false, created_at: new Date().toISOString(), ...over,
} as AppNotification);

beforeEach(() => {
  useNotificationStore.setState({ notifications: [], fetchFailed: false, moreFailed: false, loading: false, _fetching: false });
  jest.mocked(nav.back).mockClear();
  const { useLocalSearchParams } = require('expo-router');
  jest.mocked(useLocalSearchParams).mockReturnValue({});
});

it('a notice of a verdict leads to the board, the verdict named, from its push too', () => {
  expect(noticeRoute({ group_key: undefined, film_id: undefined, from_username: undefined, verdict_id: VERDICT }))
    .toBe(`/notifications-modal?verdict=${VERDICT}`);
  // A notice that names no verdict leads where it always did.
  expect(noticeRoute({ group_key: undefined, film_id: undefined, from_username: undefined })).toBeNull();
});

it('tapping a verdict’s notice opens the verdict whole over the board, and says it does', async () => {
  useNotificationStore.setState({
    notifications: [notice({ id: 'verdict', verdict_id: VERDICT, message: `After reviewing a report, the house has paused your membership for 24 hours. Reason: ${LONG_REASON}` })],
  });
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<NotificationsModal />); });
  expect(r.queryByTestId('verdict-sheet')).toBeNull();
  const row = r.getByLabelText(/paused your membership for 24 hours.*read in full$/);
  expect(r.getByText('READ IN FULL ›')).toBeTruthy();
  await act(async () => { await fireEvent.press(row); });
  expect(r.getByTestId('verdict-sheet').props.children).toBe(VERDICT);
  // Opened over the board: the board stays.
  expect(nav.back).not.toHaveBeenCalled();
  await r.unmount();
});

it('the board opened by a verdict’s push opens that verdict', async () => {
  const { useLocalSearchParams } = require('expo-router');
  jest.mocked(useLocalSearchParams).mockReturnValue({ verdict: VERDICT });
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<NotificationsModal />); });
  await act(async () => { await new Promise((ok) => setImmediate(ok)); });
  expect(r.getByTestId('verdict-sheet').props.children).toBe(VERDICT);
  await r.unmount();
});

it('a verdict’s push with the board in front opens the verdict on it', async () => {
  const openSociety = require('@/src/utils/openSociety');
  const where = jest.spyOn(openSociety, 'currentPathname').mockReturnValue('/notifications-modal');
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<NotificationsModal />); });
  await act(async () => { tellThePageInFront(`/notifications-modal?verdict=${VERDICT}`); });
  expect(r.getByTestId('verdict-sheet').props.children).toBe(VERDICT);
  where.mockRestore();
  await r.unmount();
});

it('another member’s words in a notice are struck for a member who hides slurs, and said struck', async () => {
  useNotificationStore.setState({
    notifications: [notice({ id: 'closed', type: 'ballot', read: true, message: 'The ballot “Every retard in the stalls” you voted in has closed.' })],
  });
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<NotificationsModal />); });
  expect(r.queryByText(/retard/)).toBeNull();
  // The row says it struck (the words themselves say so too).
  expect(r.getAllByLabelText(/^The ballot “Every struck in the stalls” you voted in has closed\., /).length).toBe(1);
  await r.unmount();
});
