/**
 * aNoticeIsDismissedWithoutSight.test.tsx — review round 12
 * ─────────────────────────────────────────────────────────────────────────────
 * A member using VoiceOver could not dismiss one notice: each notice (and each grouped one) is
 * a row read as one stop, and iOS never goes inside it to the × drawn there. Nothing else on the
 * board dismisses a single notice. The row now offers Dismiss as its own action.
 */
import React, { act } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { actsOffered, stopAround } from '@/test-utils/voiceOver';

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

const notice = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: 'n1', user_id: 'me', type: 'follow', message: 'now follows you.',
  from_username: 'orson', read: false, created_at: new Date().toISOString(), ...over,
} as AppNotification);

const dismiss = jest.fn();
const dismissGroup = jest.fn();

beforeEach(() => {
  dismiss.mockClear();
  dismissGroup.mockClear();
  useNotificationStore.setState({
    notifications: [], fetchFailed: false, moreFailed: false, loading: false, _fetching: false,
    dismiss, dismissGroup,
  });
});

async function board(notifications: AppNotification[]) {
  useNotificationStore.setState({ notifications });
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<NotificationsModal />); });
  return r;
}

describe('a member using VoiceOver on the notices', () => {
  it('can dismiss one notice: its row, where VoiceOver stops, offers Dismiss', async () => {
    const r = await board([notice()]);
    const row = r.getByLabelText(/^Unread\. @orson now follows you\., /);
    // The × is inside the row, which iOS reads as one stop: it is offered there instead.
    expect(stopAround(r.getByLabelText('Dismiss notice'))?.props.accessibilityLabel).toBe(row.props.accessibilityLabel);
    expect(actsOffered(row)).toEqual(['Dismiss']);
    await act(async () => { await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'dismiss' } }); });
    expect(dismiss).toHaveBeenCalledWith('n1');
  });

  it('can dismiss a grouped notice the same way, every notice in the group', async () => {
    const ids = ['c1', 'c2', 'c3'];
    const r = await board(ids.map((id, i) => notice({
      id, type: 'endorse', message: 'certified your log of Vertigo.', from_username: `member${i}`,
      group_key: 'endorse:log:00000000-0000-4000-8000-0000000000aa', title: 'Vertigo', film_id: 9,
    })));
    const grouped = r.getByLabelText('Dismiss grouped notice');
    const row = stopAround(grouped);
    expect(row).not.toBeNull();
    expect(actsOffered(row!)).toEqual(['Dismiss']);
    await act(async () => { await fireEvent(row!, 'accessibilityAction', { nativeEvent: { actionName: 'dismiss' } }); });
    expect(dismissGroup).toHaveBeenCalledWith(expect.arrayContaining(ids));
  });
});
