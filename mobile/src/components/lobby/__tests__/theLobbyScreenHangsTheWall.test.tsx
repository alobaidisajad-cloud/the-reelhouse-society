/**
 * theLobbyScreenHangsTheWall.test.tsx — the Lobby tab: a member sees the wall,
 * a visitor sees the front door, and a pull asks the house again.
 * ─────────────────────────────────────────────────────────────────────────────
 *   A MEMBER'S LOBBY is the wall, and opening it starts the member's own reads
 *   (their logs, their certifications). Their notices and the live channel are
 *   the session's (AppBootstrapper): the tab never opens or closes them.
 *   A PULL always asks for the wall (the house's own page); a pull that
 *   reaches nothing says so ONCE and keeps the wall it had; a one-sheet the
 *   catalogue could not finish is asked for again.
 *   A VISITOR gets the front door, and the wall is never asked for: get_lobby
 *   is granted to members only, and asking would be a refusal on every open.
 */
import React, { act } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { REFRESH_FAILED } from '@/src/components/EmptyStates';
import { PROGRAMME_KEY, WALL_KEY, featureKey } from '../wallRead';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), navigate: jest.fn() }),
  // The app travels through `nav`, which drives the module's router.
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
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

  it('starts the member’s own reads when it opens — and leaves the notices and the live channel to the session', async () => {
    const { r } = await mount();
    expect(mockFetchLogs).toHaveBeenCalled();
    expect(mockFetchEndorsements).toHaveBeenCalled();
    // The channel is one for the whole app: a Lobby that closed it on leaving
    // (its crash screen unmounts it) closed it for every screen until the next launch.
    expect(mockNotices.setupRealtime).not.toHaveBeenCalled();
    expect(mockNotices.fetchNotifications).not.toHaveBeenCalled();
    r.unmount();
    expect(mockStopLive).not.toHaveBeenCalled();
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

  it('a one-sheet the catalogue could not finish is asked for again by a pull; a whole one is kept', async () => {
    const { tmdb } = jest.requireMock('@/src/lib/tmdb');
    tmdb.trending.mockResolvedValueOnce({ results: [{ id: 935, title: 'Dr. Strangelove', poster_path: '/s.jpg' }] });
    // the catalogue's detail cannot be reached while the Lobby opens
    tmdb.detail.mockRejectedValue(new Error('unreachable'));
    try {
      const { client } = await mount();
      expect(client.getQueryData(featureKey(935))).toMatchObject({ partial: true, director: null });
      // then it can: a pull asks for the rest
      tmdb.detail.mockResolvedValue({ id: 935, title: 'Dr. Strangelove', runtime: 95, credits: { crew: [{ job: 'Director', name: 'Stanley Kubrick' }] } });
      const before = tmdb.detail.mock.calls.length;
      await pull();
      expect(tmdb.detail.mock.calls.length).toBeGreaterThan(before);
      expect(client.getQueryData(featureKey(935))).toMatchObject({ partial: false, director: 'Stanley Kubrick', runtime: 95 });
      // whole now: the next pull leaves it be
      const whole = tmdb.detail.mock.calls.length;
      await pull();
      expect(tmdb.detail.mock.calls.length).toBe(whole);
    } finally {
      tmdb.detail.mockResolvedValue(null);
    }
  });

  it('a pull whose own read fails outright says so too, not nothing', async () => {
    await mount();
    mockFetchLogs.mockImplementationOnce(async () => { throw new Error('the archive read failed'); });
    await pull();
    expect(toast().error).toHaveBeenCalledWith(REFRESH_FAILED);
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

  it('is asked for the programme and its feature at the front door, so a member who signs in finds the bill up', async () => {
    mockSignedIn = false;
    const { tmdb } = jest.requireMock('@/src/lib/tmdb');
    tmdb.trending.mockResolvedValueOnce({ results: [{ id: 935, title: 'Dr. Strangelove' }, { id: 62, title: 'Seven Samurai' }] });
    const { client } = await mount();
    expect(client.getQueryData(PROGRAMME_KEY)).toEqual(expect.objectContaining({ feature: expect.objectContaining({ id: 935 }) }));
    expect(client.getQueryState(featureKey(935))?.status).toBe('success');
    expect(tmdb.keyArt).toHaveBeenCalledWith(935);
    expect(wallAsks()).toBe(0);
  });

  it('ALREADY A MEMBER? opens the sign-in form, whichever was open last', async () => {
    mockSignedIn = false;
    const { r } = await mount();
    await act(async () => { fireEvent.press(r.getByText('ALREADY A MEMBER?')); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/login', params: { action: 'login' } });
  });

  it('SEEK ADMISSION opens the sign-up form, not the sign-in one', async () => {
    mockSignedIn = false;
    const { r } = await mount();
    await fireEvent.press(r.getByLabelText('Seek admission — request membership'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/login', params: { action: 'signup' } });
  });
});
