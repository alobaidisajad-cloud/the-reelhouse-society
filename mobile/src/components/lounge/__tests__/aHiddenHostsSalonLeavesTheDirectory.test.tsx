/**
 * aHiddenHostsSalonLeavesTheDirectory.test.tsx — review round 8, the Lounge tab's directory.
 * ─────────────────────────────────────────────────────────────────────────────
 * A member's filings, stacks and records leave every list once they are blocked or muted; their
 * salon stood in the Lounge's directory still, its plaque their own words (reported with "Also
 * block this member", it stayed). A salon whose host is blocked or muted is not drawn among the
 * salons to join, and leaves at once when its host is hidden while the tab is shown. A salon of
 * the member's own (one they sit in) stays, whoever its host is.
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@/src/stores/auth', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  const member = { id: 'me', username: 'me', role: 'archivist', tier: 'archivist', preferences: {}, is_social_private: false };
  return { useAuthStore: mockCreate(() => ({ user: member, isAuthenticated: true })), rankAge: () => 0 };
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
// eslint-disable-next-line import/first
import { useBlockStore } from '@/src/stores/blockStore';

const salon = (id: string, name: string, host: string, mine = false) => ({
  id, name, description: 'Silent era, every Thursday.', is_private: false,
  creator_id: host, created_at: '2026-06-01T00:00:00Z', member_count: 42, mine,
});
const NITRATE = salon('l0', 'The Nitrate Circle', 'blocked-host');
const VARIETY = salon('l1', 'The Variety Hall', 'muted-host');
const MATINEE = salon('l2', 'The Matinee Club', 'later-host');
const OWN = salon('l3', 'The Back Row', 'blocked-host', true);

const hide = (blocked: string[], muted: string[]) => useBlockStore.setState({
  blocked, _blockedIndex: new Set(blocked), muted, _mutedIndex: new Set(muted),
} as never);

beforeEach(() => {
  useLoungeStore.setState({
    lounges: [NITRATE, VARIETY, MATINEE, OWN], loungesFailed: false, loungesLoading: false, loungesRead: true,
    fetchLounges: jest.fn(async () => {}), searchLounges: jest.fn(async () => []),
  } as never);
  hide(['blocked-host'], ['muted-host']);
});
afterEach(() => { hide([], []); });

/** The salons whose name is printed on the tab (a card's words sit under its one spoken label). */
const drawn = (r: ReturnType<typeof render>) => {
  const page = JSON.stringify(r.toJSON());
  return [NITRATE, VARIETY, MATINEE, OWN].map((l) => l.name).filter((name) => page.includes(JSON.stringify(name)));
};

it('a salon whose host is blocked or muted is not among the salons; the member\'s own stays', async () => {
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<LoungeScreen />); });
  expect(drawn(r)).toEqual(['The Matinee Club', 'The Back Row']);
});

it('a salon leaves at once when its host is blocked while the tab is shown, and comes back when let back', async () => {
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<LoungeScreen />); });
  expect(drawn(r)).toContain('The Matinee Club');
  await act(async () => { hide(['blocked-host', 'later-host'], ['muted-host']); });
  expect(drawn(r)).toEqual(['The Back Row']);
  await act(async () => { hide([], []); });
  expect(drawn(r)).toEqual(['The Nitrate Circle', 'The Variety Hall', 'The Matinee Club', 'The Back Row']);
});
