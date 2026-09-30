/**
 * theLobbyScreenHangsTheWall.test.tsx — the Lobby tab: a member sees the wall,
 * a visitor sees the front door, and a pull asks the house again.
 * ─────────────────────────────────────────────────────────────────────────────
 *   A MEMBER'S LOBBY is the wall, and opening it starts the member's own reads
 *   (their logs, their certifications, their notices, the live channel) —
 *   stopped again when the tab goes.
 *   A PULL always asks for the wall (the house's own page); a pull that
 *   reaches nothing says so ONCE and keeps the wall it had.
 *   A VISITOR gets the front door, and the wall is never asked for: get_lobby
 *   is granted to members only, and asking would be a refusal on every open.
 */
import React, { act } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { REFRESH_FAILED } from '@/src/components/EmptyStates';
import { WALL_KEY } from '../wallRead';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));
jest.mock('@react-navigation/native', () => ({ useScrollToTop: jest.fn(), useIsFocused: () => true }));

/** The house: answers the wall, or cannot be reached. */
let mockWallDown = false;
const mockRpc = jest.fn();
jest.mock('@/src/lib/supabase', () => {
  const answer = () => (mockWallDown
    ? { data: null, error: { message: 'Network request failed' } }
    : { data: { edition: '2026-09-30', log: null, stack: null, filings: [] }, error: null });
  const chain: any = {};
  for (const k of ['select', 'eq', 'neq', 'not', 'order', 'limit', 'in', 'is', 'single', 'maybeSingle', 'gte', 'lte']) chain[k] = () => chain;
  chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res, rej);
  return { supabase: {
    from: () => chain,
    rpc: (name: string) => { mockRpc(name); return Promise.resolve(answer()); },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: jest.fn(),
  } };
});

let mockSignedIn = true;
jest.mock('@/src/stores/auth', () => {
  const state = () => ({ isAuthenticated: mockSignedIn, user: mockSignedIn ? { id: 'me', username: 'kane', role: 'user', tier: null } : null });
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(state()) : state());
  (useAuthStore as any).getState = state;
  return { useAuthStore };
});
const mockFetchLogs = jest.fn(async () => {});
const mockFetchEndorsements = jest.fn();
jest.mock('@/src/stores/films', () => {
  const s = { fetchLogs: () => mockFetchLogs(), fetchEndorsements: () => mockFetchEndorsements() };
  const useFilmStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useFilmStore as any).getState = () => s;
  return { useFilmStore };
});
const mockStopLive = jest.fn();
const mockNotices = { setupRealtime: jest.fn(() => mockStopLive), fetchNotifications: jest.fn(), unreadCount: 0 };
jest.mock('@/src/stores/notificationStore', () => {
  const useNotificationStore = (sel?: (x: unknown) => unknown) => (sel ? sel(mockNotices) : mockNotices);
  (useNotificationStore as any).getState = () => mockNotices;
  return { useNotificationStore };
});
jest.mock('@/src/utils/reelToast', () => {
  const t = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: t };
});
/** The scroll view's own props, as the Lobby last drew them (its pull lives there). */
let mockScrollProps: Record<string, any> = {};
jest.mock('@/src/components/layout/CinematicScrollView', () => {
  const mockReact = require('react');
  const { ScrollView } = require('react-native');
  return {
    CinematicScrollView: mockReact.forwardRef((props: Record<string, any>, ref: unknown) => {
      mockScrollProps = props;
      return mockReact.createElement(ScrollView, { ref }, props.children);
    }),
  };
});

// eslint-disable-next-line import/first
import LobbyScreen from '@/app/(tabs)/index';

const toast = () => jest.requireMock('@/src/utils/reelToast').default;
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((res) => setTimeout(res, 0)); });

async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const r = render(<QueryClientProvider client={client}><LobbyScreen /></QueryClientProvider>);
  await settle();
  return { r, client };
}
const pull = async () => { await act(async () => { await mockScrollProps.refreshControl.props.onRefresh(); }); await settle(); };
const wallAsks = () => mockRpc.mock.calls.filter(([n]) => n === 'get_lobby').length;

beforeEach(() => {
  mockSignedIn = true;
  mockWallDown = false;
  mockRpc.mockClear();
  mockPush.mockClear();
  mockFetchLogs.mockClear();
  mockFetchEndorsements.mockClear();
  mockNotices.fetchNotifications.mockClear();
  mockNotices.setupRealtime.mockClear();
  mockStopLive.mockClear();
  toast().error.mockClear();
});

describe('a member’s Lobby', () => {
  it('is the wall: the room’s name, and the house asked for today’s edition', async () => {
    const { r } = await mount();
    expect(r.getByText('The Lobby')).toBeTruthy();
    expect(wallAsks()).toBe(1);
    expect(r.queryByText('✦ SEEK ADMISSION ✦')).toBeNull();
  });

  it('starts the member’s own reads when it opens, and stops the live channel when it goes', async () => {
    const { r } = await mount();
    expect(mockFetchLogs).toHaveBeenCalled();
    expect(mockFetchEndorsements).toHaveBeenCalled();
    expect(mockNotices.fetchNotifications).toHaveBeenCalled();
    expect(mockNotices.setupRealtime).toHaveBeenCalled();
    r.unmount();
    expect(mockStopLive).toHaveBeenCalled();
  });

  it('a pull asks for the wall again, even when the one it has is fresh — and says nothing when it is answered', async () => {
    await mount();
    await pull();
    expect(wallAsks()).toBe(2);
    expect(mockFetchLogs).toHaveBeenCalledTimes(2);
    expect(toast().error).not.toHaveBeenCalled();
    expect(mockScrollProps.refreshControl.props.refreshing).toBe(false);
  });

  it('a pull that reaches nothing says so once, and the wall it had stays', async () => {
    const { r, client } = await mount();
    mockWallDown = true;
    await pull();
    expect(toast().error).toHaveBeenCalledTimes(1);
    expect(toast().error).toHaveBeenCalledWith(REFRESH_FAILED);
    expect(client.getQueryData(WALL_KEY)).toMatchObject({ edition: '2026-09-30' });
    // the wall stays hung, with its one quiet line
    expect(r.getByText('No log yet.', { includeHiddenElements: true })).toBeTruthy();
    expect(r.getByText('Could not refresh —')).toBeTruthy();
    expect(mockScrollProps.refreshControl.props.refreshing).toBe(false);
  });
});

describe('a visitor', () => {
  it('gets the front door, and the wall is never asked for', async () => {
    mockSignedIn = false;
    const { r } = await mount();
    expect(r.getByText('✦ SEEK ADMISSION ✦')).toBeTruthy();
    expect(wallAsks()).toBe(0);
    expect(mockFetchLogs).not.toHaveBeenCalled();
    expect(r.queryByText('The Lobby')).toBeNull();
  });

  it('SEEK ADMISSION opens the sign-up form, not the sign-in one', async () => {
    mockSignedIn = false;
    const { r } = await mount();
    await fireEvent.press(r.getByLabelText('Seek admission — request membership'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/login', params: { action: 'signup' } });
  });
});
