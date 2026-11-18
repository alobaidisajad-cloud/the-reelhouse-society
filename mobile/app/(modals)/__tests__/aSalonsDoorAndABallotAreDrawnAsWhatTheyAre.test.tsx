/**
 * aSalonsDoorAndABallotAreDrawnAsWhatTheyAre.test.tsx — review round 12
 * ─────────────────────────────────────────────────────────────────────────────
 * A member asking to enter a salon, an admission, and a ballot's close were all written as the
 * house's own word ('system'), so the board drew each with the house's grey stamp. They are kinds of
 * their own now ('salon', 'ballot'): the board stamps a salon's door with its key, in brass, and a
 * ballot's close with a ticked box, in bone, as a critique is; the house's own word keeps its stamp.
 */
import React, { act } from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { colors } from '@/src/theme/theme';

// The board's read fails, so the notices set below stay on it as the cached board.
const mockHouse = supabaseFake({ fail: { notifications: { code: 'NETWORK', message: 'Network request failed' } } });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/stores/auth', () => {
  const s = { user: { id: 'me', username: 'kane' }, isAuthenticated: true };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => s;
  (useAuthStore as unknown as { subscribe: () => () => void }).subscribe = () => () => {};
  return { useAuthStore };
});
jest.mock('expo-router/react-navigation', () => ({ ...require('@/test-utils/navigationMock').navigationMock(), useIsFocused: () => true }));
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
jest.mock('@/src/hooks/useFollowRequests', () => ({ refreshFollowRequestCount: jest.fn() }));
// The door's own panel, which is not what is under test.
jest.mock('@/src/components/profile/FollowRequestsPanel', () => () => null);

// eslint-disable-next-line import/first
import { useNotificationStore, type AppNotification } from '@/src/stores/notificationStore';
// eslint-disable-next-line import/first
import NotificationsModal from '../notifications-modal';

const SALON = '11111111-1111-4111-8111-111111111111';
const notice = (over: Partial<AppNotification>): AppNotification => ({
  id: 'n', user_id: 'me', type: 'system', message: 'x', read: true, created_at: new Date().toISOString(), ...over,
} as AppNotification);

type Node = { props: Record<string, unknown>; children: (Node | string)[] };
/** The stamp a notice's row is drawn with: the colour of its square, read from the drawn row. */
function stampOf(row: Node): string | undefined {
  const walk = (n: Node | string): string | undefined => {
    if (typeof n === 'string') return undefined;
    const style = StyleSheet.flatten(n.props.style as never) as Record<string, unknown> | undefined;
    if (style && style.width === 30 && style.height === 30 && typeof style.borderColor === 'string') return style.borderColor;
    for (const c of n.children ?? []) { const got = walk(c); if (got) return got; }
    return undefined;
  };
  return walk(row);
}

beforeEach(() => {
  useNotificationStore.setState({ notifications: [], fetchFailed: false, moreFailed: false, loading: false, _fetching: false });
});

it('a salon’s door is stamped as a salon’s, a ballot’s close as the Dispatch’s, and the house’s word as the house’s', async () => {
  useNotificationStore.setState({
    notifications: [
      notice({ id: 'asks', type: 'salon', from_username: 'orson', from_user_id: '22222222-2222-4222-8222-222222222222', related_lounge_id: SALON, message: 'is asking to enter The Back Row.' }),
      notice({ id: 'closed', type: 'ballot', message: 'The ballot “Best of 1958” you voted in has closed.' }),
      notice({ id: 'house', type: 'system', message: 'The house will close for repairs at noon.' }),
    ],
  });
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<NotificationsModal />); });
  expect(stampOf(r.getByLabelText(/is asking to enter The Back Row/) as unknown as Node)).toBe(colors.sepia);
  expect(stampOf(r.getByLabelText(/you voted in has closed/) as unknown as Node)).toBe(colors.bone);
  expect(stampOf(r.getByLabelText(/close for repairs/) as unknown as Node)).toBe(colors.fog);
  await r.unmount();
});
