/**
 * theSalonsSayWhenTheyCouldNotBeRead.test.tsx — the Lounge, when its salons
 * could not be read.
 *
 * It said "The Velvet Seats Await … [ ESTABLISH SALON ]" and "No open salons at
 * this time. BE THE FIRST TO OPEN ONE" to a member with no signal — under a
 * toast repeated every thirty seconds by the poll. Now: the house's failed
 * state, once, and TRY AGAIN; a pull that reached nothing over salons already
 * drawn says so, and leaves them.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('@/src/stores/auth', () => {
  const build = () => ({ user: { id: 'me', username: 'kane', role: 'archivist', tier: 'archivist', preferences: {} }, isAuthenticated: true });
  const useAuthStore = (sel?: (s: unknown) => unknown) => (sel ? sel(build()) : build());
  (useAuthStore as any).getState = () => build();
  return { useAuthStore };
});
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}), useFocusEffect: () => {},
}));
jest.mock('@react-navigation/native', () => ({ useScrollToTop: jest.fn(), useIsFocused: () => true }));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  useNetInfo: () => ({ isConnected: true }),
  default: { addEventListener: () => () => {} },
}));
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
jest.mock('@shopify/flash-list', () => require('@/mockups/tabs/flashListMock').makeFlashListMock());
jest.mock('@/src/utils/reelToast', () => {
  const t = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: t };
});
/** The list's own props, as the screen last drew them (the pull lives there). */
let mockListProps: Record<string, any> = {};
jest.mock('@/src/components/layout/CinematicFlashList', () => {
  const mockReact = require('react');
  const List = require('@/mockups/tabs/flashListMock').makeFlashListMock().FlashList;
  return {
    CinematicFlashList: mockReact.forwardRef((props: Record<string, any>, ref: unknown) => {
      mockListProps = props;
      return mockReact.createElement(List, { ...props, ref });
    }),
  };
});

// eslint-disable-next-line import/first
import LoungeScreen from '@/app/(tabs)/lounge';
// eslint-disable-next-line import/first
import { useLoungeStore } from '@/src/stores/lounge';

const ROOM = {
  id: 'l0', name: 'The Nitrate Circle', description: 'Silent era, every Thursday.', is_private: false,
  creator_id: 'm0', created_at: '2026-06-01T00:00:00Z', member_count: 42, unread_count: 0, is_member: true,
};
const toast = () => jest.requireMock('@/src/utils/reelToast').default;
const fetchLounges = jest.fn(async () => {});

async function mount() {
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<LoungeScreen />); });
  return r;
}

beforeEach(() => {
  fetchLounges.mockReset().mockResolvedValue(undefined);
  toast().error.mockClear();
});

it('salons it could not read are not "the velvet seats await" — said once, and asked again', async () => {
  useLoungeStore.setState({ lounges: [], loungesFailed: true, loading: false, fetchLounges } as never);
  const r = await mount();
  expect(r.getAllByText('Transmission Interrupted')).toHaveLength(1);
  expect(r.queryByText('The Velvet Seats Await')).toBeNull();
  expect(r.queryByText('No open salons at this time.')).toBeNull();
  await act(async () => { fireEvent.press(r.getByLabelText('Try again')); });
  expect(fetchLounges).toHaveBeenCalledTimes(1);
});

it('salons that arrived empty still invite the first one', async () => {
  useLoungeStore.setState({ lounges: [], loungesFailed: false, loading: false, fetchLounges } as never);
  const r = await mount();
  expect(r.getByText('The Velvet Seats Await')).toBeTruthy();
  expect(r.queryByText('Transmission Interrupted')).toBeNull();
});

it('a pull that reaches nothing keeps the salons and says so', async () => {
  fetchLounges.mockImplementation(async () => { useLoungeStore.setState({ loungesFailed: true }); });
  useLoungeStore.setState({ lounges: [ROOM], loungesFailed: false, loading: false, fetchLounges } as never);
  const r = await mount();
  await act(async () => { await mockListProps.refreshControl.props.onRefresh(); });
  expect(toast().error).toHaveBeenCalledWith('Could not refresh — check your connection.');
  expect(r.queryByText('Transmission Interrupted')).toBeNull();
  expect(r.getAllByText('The Nitrate Circle').length).toBeGreaterThan(0);
});
