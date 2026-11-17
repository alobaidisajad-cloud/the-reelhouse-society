/**
 * theCorridorWaitsForTheHousesAnswer.test.tsx — review round 9
 * ─────────────────────────────────────────────────────────────────────────────
 * The corridor's search asks the house for salons past the ones already here. While that search
 * was on its way, the corridor already said "No salon matches that.", and the salon the house
 * then found appeared under it; when the search failed, the same line stood under "The house
 * could not be searched", saying there was no match where nothing had been asked. Now the line
 * waits for the house's answer to these words, and is said once the house answered with nothing.
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
import { useLoungeStore, type LoungeRoom } from '@/src/stores/lounge';

const { useAuthStore, mockMember } = jest.requireMock('@/src/stores/auth') as {
  useAuthStore: ReturnType<typeof create> & { setState: (s: object) => void };
  mockMember: (id: string) => object;
};

const ROOM = {
  id: 'l0', name: 'The Nitrate Circle', description: 'Silent era, every Thursday.', is_private: false,
  creator_id: 'm0', created_at: '2026-06-01T00:00:00Z', member_count: 42,
};
const NO_MATCH = 'No salon matches that.';
const COULD_NOT_SEARCH = 'The house could not be searched. These are the salons already here.';

/** The house's search, held until the test answers it: its hits, or null when it could not be searched. */
let answerSearch: (hits: LoungeRoom[] | null) => void = () => {};
const searchLounges = jest.fn(() => new Promise<LoungeRoom[] | null>((resolve) => { answerSearch = resolve; }));

beforeEach(() => {
  searchLounges.mockClear();
  useAuthStore.setState({ user: mockMember('me'), isAuthenticated: true });
  useLoungeStore.setState({
    lounges: [ROOM], loungesFailed: false, loungesLoading: false, loungesRead: true,
    fetchLounges: jest.fn(async () => {}), searchLounges,
  } as never);
});

/** The tab, with words typed that match no salon here, and the moment after the last keystroke passed. */
async function typed(words: string) {
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<LoungeScreen />); });
  await act(async () => { await fireEvent.changeText(r.getByLabelText('Search salons'), words); });
  return r;
}
const pastTheWait = () => act(async () => { await new Promise((done) => setTimeout(done, 350)); });

it('says "No salon matches that." only once the house answered the search with nothing', async () => {
  const r = await typed('zzzz');
  // Typed, the house not yet asked: no verdict.
  expect(r.queryByText(NO_MATCH)).toBeNull();
  await pastTheWait();
  // Asked, the answer on its way: still none.
  expect(searchLounges).toHaveBeenCalledWith('zzzz');
  expect(r.queryByText(NO_MATCH)).toBeNull();
  await act(async () => { answerSearch([]); });
  expect(r.getByText(NO_MATCH)).toBeTruthy();
});

it('a salon the house finds is shown without "No salon matches that." said over it first', async () => {
  const r = await typed('vault');
  expect(r.queryByText(NO_MATCH)).toBeNull();
  await pastTheWait();
  const found = { ...ROOM, id: 'l9', name: 'The Vault Society', description: 'Lost films, found.', creator_id: 'm9' };
  await act(async () => { answerSearch([found]); });
  expect(r.getByLabelText(/^Take a seat: The Vault Society,/)).toBeTruthy();
  expect(r.queryByText(NO_MATCH)).toBeNull();
});

it('under "The house could not be searched", "No salon matches that." is not said', async () => {
  const r = await typed('zzzz');
  await pastTheWait();
  await act(async () => { answerSearch(null); });
  expect(r.getByText(COULD_NOT_SEARCH)).toBeTruthy();
  expect(r.queryByText(NO_MATCH)).toBeNull();
});

it('new words typed after an answer wait for their own answer', async () => {
  const r = await typed('zzzz');
  await pastTheWait();
  await act(async () => { answerSearch([]); });
  expect(r.getByText(NO_MATCH)).toBeTruthy();
  await act(async () => { await fireEvent.changeText(r.getByLabelText('Search salons'), 'zzzzq'); });
  expect(r.queryByText(NO_MATCH)).toBeNull();
});
