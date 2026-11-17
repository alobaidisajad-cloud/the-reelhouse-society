/**
 * theSalonSearchIsTheMembersOwn.test.tsx — review round 6
 * ─────────────────────────────────────────────────────────────────────────────
 * The Lounge tab stays drawn through a sign-out, and its search with it: the next member on the
 * phone opened the corridor on the last one's words, the salons narrowed by them ("No salon matches
 * that."). When the member on the phone changes, the search is empty again; the same member keeps
 * what they typed.
 */
import React, { act } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { create } from 'zustand';

jest.mock('@/src/stores/auth', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  const member = (id: string) => ({ id, username: id, role: 'archivist', tier: 'archivist', preferences: {}, is_social_private: false });
  const useAuthStore = mockCreate(() => ({ user: member('me'), isAuthenticated: true }));
  return { useAuthStore, rankAge: () => 0, mockMember: member };
});
jest.mock('expo-router', () => ({
  ...require('@/test-utils/expoRouterMock').expoRouterMock(),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}), useFocusEffect: () => {},
}));
jest.mock('expo-router/react-navigation', () => ({ ...require('@/test-utils/navigationMock').navigationMock(), useScrollToTop: jest.fn(), useIsFocused: () => true }));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  useNetInfo: () => ({ isConnected: true }),
  default: { configure: () => {}, addEventListener: () => () => {} },
}));
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
jest.mock('@shopify/flash-list', () => require('@/mockups/tabs/flashListMock').makeFlashListMock());
jest.mock('@/src/components/layout/CinematicFlashList', () => {
  const mockReact = require('react');
  const List = require('@/mockups/tabs/flashListMock').makeFlashListMock().FlashList;
  return { CinematicFlashList: mockReact.forwardRef((props: Record<string, unknown>, ref: unknown) => mockReact.createElement(List, { ...props, ref })) };
});

// eslint-disable-next-line import/first
import LoungeScreen from '@/app/(tabs)/lounge';
// eslint-disable-next-line import/first
import { useLoungeStore } from '@/src/stores/lounge';

const { useAuthStore, mockMember } = jest.requireMock('@/src/stores/auth') as {
  useAuthStore: ReturnType<typeof create> & { setState: (s: object) => void };
  mockMember: (id: string) => object;
};

const ROOM = {
  id: 'l0', name: 'The Nitrate Circle', description: 'Silent era, every Thursday.', is_private: false,
  creator_id: 'm0', created_at: '2026-06-01T00:00:00Z', member_count: 42,
};

beforeEach(() => {
  useAuthStore.setState({ user: mockMember('me'), isAuthenticated: true });
  useLoungeStore.setState({
    lounges: [ROOM], loungesFailed: false, loungesLoading: false, loungesRead: true,
    fetchLounges: jest.fn(async () => {}), searchLounges: jest.fn(async () => []),
  } as never);
});

/** The tab, a search typed into it that matches no salon here. */
async function searched() {
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<LoungeScreen />); });
  await act(async () => { await fireEvent.changeText(r.getByLabelText('Search salons'), 'zzzz'); });
  // Said once the house answered the search with nothing: it is asked a moment after the last keystroke.
  await act(async () => { await new Promise((done) => setTimeout(done, 350)); });
  expect(r.getByText('No salon matches that.')).toBeTruthy();
  return r;
}

it('the next member on the phone opens the salons with the search empty, every salon shown', async () => {
  const r = await searched();
  await act(async () => { useAuthStore.setState({ user: mockMember('next'), isAuthenticated: true }); });
  expect(r.getByLabelText('Search salons').props.value).toBe('');
  expect(r.queryByText('No salon matches that.')).toBeNull();
  expect(r.getByLabelText(/^Take a seat: The Nitrate Circle,/)).toBeTruthy();
});

it('a member who signs out, then another who signs in, finds the search empty', async () => {
  const r = await searched();
  await act(async () => { useAuthStore.setState({ user: null, isAuthenticated: false }); });
  await act(async () => { useAuthStore.setState({ user: mockMember('next'), isAuthenticated: true }); });
  expect(r.getByLabelText('Search salons').props.value).toBe('');
  expect(r.queryByText('No salon matches that.')).toBeNull();
});
