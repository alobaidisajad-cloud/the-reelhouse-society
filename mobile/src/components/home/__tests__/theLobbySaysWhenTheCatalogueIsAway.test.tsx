/**
 * theLobbySaysWhenTheCatalogueIsAway.test.tsx — a Lobby read that could not be
 * answered is said to be missing, and can be asked for again.
 *
 * The catalogue failing used to reach the Lobby as an empty programme: the
 * marquee warmed its bulbs forever and the rails were simply not there. The
 * wire failing was kept for five minutes as "The screening room is dark. When a
 * member logs their first film, it will appear here." — and it said that on
 * every pull, while it waited. Now: the house's one failed state, once, in the
 * place of the first section missing; TRY AGAIN; and the page.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TmdbUnreachable } from '@/src/lib/tmdbErrors';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));
jest.mock('@react-navigation/native', () => ({ useScrollToTop: jest.fn(), useIsFocused: () => true }));
jest.mock('@shopify/flash-list', () => require('@/mockups/tabs/flashListMock').makeFlashListMock());
/**
 * The house's answer to every read: 'ok' (nothing yet), 'down', or 'waiting'
 * (never answers) — and which reads are down: the wire (logs), the Lead Story (rpc).
 */
let mockHouse: 'ok' | 'down' | 'waiting' = 'ok';
let mockDown: { logs: boolean; rpc: boolean } = { logs: true, rpc: true };
jest.mock('@/src/lib/supabase', () => {
  const chainFor = (source: 'logs' | 'rpc' | 'other') => {
    const chain: any = {};
    const self = () => chain;
    for (const k of ['select', 'eq', 'neq', 'not', 'order', 'limit', 'in', 'is', 'single', 'maybeSingle', 'gte', 'lte']) chain[k] = self;
    chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      mockHouse === 'waiting' ? new Promise(() => {})
        : Promise.resolve(mockHouse === 'down' && source !== 'other' && mockDown[source]
          ? { data: null, error: { message: 'Network request failed' } }
          : { data: [], count: 0, error: null }).then(res, rej);
    return chain;
  };
  return { supabase: {
    from: (t: string) => chainFor(t === 'logs' ? 'logs' : 'other'),
    rpc: () => chainFor('rpc'),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: jest.fn(),
  } };
});
jest.mock('@/src/stores/auth', () => {
  const s = { isAuthenticated: true, user: { id: 'me', username: 'kane', role: 'archivist', tier: 'archivist', preferences: {} } };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useAuthStore as any).getState = () => s;
  return { useAuthStore };
});
jest.mock('@/src/stores/films', () => {
  const actual = jest.requireActual('@/src/stores/films');
  actual.useFilmStore.setState({ fetchLogs: jest.fn(), fetchEndorsements: jest.fn() });
  return actual;
});
jest.mock('@/src/stores/notificationStore', () => {
  const s = { setupRealtime: jest.fn(), fetchNotifications: jest.fn(), unreadCount: 0 };
  const useNotificationStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useNotificationStore as any).getState = () => s;
  return { useNotificationStore };
});
jest.mock('@/src/lib/tmdb', () => ({
  ...jest.requireActual('@/src/lib/tmdb'),
  tmdb: { ...jest.requireActual('@/src/lib/tmdb').tmdb, trending: jest.fn(), canon: jest.fn() },
}));
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

const { tmdb: mockTmdb } = jest.requireMock('@/src/lib/tmdb');
const toast = () => jest.requireMock('@/src/utils/reelToast').default;
const FILMS = [
  { id: 1, title: 'Sunrise', poster_path: '/s.jpg', backdrop_path: null },
  { id: 2, title: 'Greed', poster_path: '/g.jpg', backdrop_path: null },
];
const CANON = [{ id: 3, title: 'Metropolis', poster_path: '/m.jpg', backdrop_path: null }];
const away = () => Promise.reject(new TmdbUnreachable('/trending/movie/week', 'Network request failed'));
const EMPTY_WIRE = 'The screening room is dark.';

/** React Query tells its screens a few turns after the read resolves, and React draws on the next act. */
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((res) => setTimeout(res, 0)); };
const flush = () => act(async () => { await settle(); });

async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let r!: ReturnType<typeof render>;
  await act(async () => {
    r = render(<QueryClientProvider client={client}><LobbyScreen /></QueryClientProvider>);
    await settle();
  });
  await flush();
  return r;
}

beforeEach(() => {
  mockHouse = 'ok';
  mockDown = { logs: true, rpc: true };
  mockTmdb.trending.mockReset();
  mockTmdb.canon.mockReset();
  toast().error.mockClear();
});

describe('the Lobby, when the catalogue cannot be reached', () => {
  it('says the programme could not be fetched, never an endless marquee', async () => {
    mockTmdb.trending.mockImplementation(away);
    mockTmdb.canon.mockImplementation(away);
    const r = await mount();
    expect(r.getByText('Transmission Interrupted')).toBeTruthy();
    // One notice, not two: it asks for every read that is missing.
    expect(r.getAllByLabelText('Try again')).toHaveLength(1);
    expect(r.queryByLabelText(/The weekly feature/)).toBeNull();
  });

  it('TRY AGAIN asks again, and the programme arrives', async () => {
    mockTmdb.trending.mockImplementationOnce(away).mockResolvedValue({ results: FILMS });
    mockTmdb.canon.mockImplementationOnce(away).mockResolvedValue({ results: CANON });
    const r = await mount();
    await act(async () => {
      fireEvent.press(r.getByLabelText('Try again'));
      await settle();
    });
    await flush();
    expect(mockTmdb.trending).toHaveBeenCalledTimes(2);
    expect(mockTmdb.canon).toHaveBeenCalledTimes(2);
    expect(r.getByLabelText('The weekly feature: Sunrise')).toBeTruthy();
    expect(r.queryByText('Transmission Interrupted')).toBeNull();
  });

  it('when only the Canon failed, says so in its place and leaves the programme', async () => {
    mockTmdb.trending.mockResolvedValue({ results: FILMS });
    mockTmdb.canon.mockImplementationOnce(away).mockResolvedValue({ results: CANON });
    const r = await mount();
    expect(r.getByLabelText('The weekly feature: Sunrise')).toBeTruthy();
    expect(r.getByText('Transmission Interrupted')).toBeTruthy();
    await act(async () => {
      fireEvent.press(r.getByLabelText('Try again'));
      await settle();
    });
    await flush();
    expect(mockTmdb.trending).toHaveBeenCalledTimes(1);
    expect(mockTmdb.canon).toHaveBeenCalledTimes(2);
    expect(r.queryByText('Transmission Interrupted')).toBeNull();
  });
});

describe('the Lobby, when the house cannot be reached', () => {
  beforeEach(() => {
    mockTmdb.trending.mockResolvedValue({ results: FILMS });
    mockTmdb.canon.mockResolvedValue({ results: CANON });
  });

  it('a wire it could not read is not "no member has logged a film"', async () => {
    mockHouse = 'down';
    const r = await mount();
    expect(r.queryByText(EMPTY_WIRE)).toBeNull();
    expect(r.getAllByText('Transmission Interrupted')).toHaveLength(1);
    expect(r.getByLabelText('The weekly feature: Sunrise')).toBeTruthy();
  });

  it('the wire alone down: said in its place, and the Lead Story is not blamed', async () => {
    mockHouse = 'down';
    mockDown = { logs: true, rpc: false };
    const r = await mount();
    expect(r.getAllByText('Transmission Interrupted')).toHaveLength(1);
    expect(r.queryByText(EMPTY_WIRE)).toBeNull();
  });

  it('the Lead Story alone down: said, and the wire still speaks for itself', async () => {
    mockHouse = 'down';
    mockDown = { logs: false, rpc: true };
    const r = await mount();
    expect(r.getAllByText('Transmission Interrupted')).toHaveLength(1);
    expect(r.getByText(EMPTY_WIRE)).toBeTruthy();
  });

  it('a wire still on its way says nothing yet', async () => {
    mockHouse = 'waiting';
    const r = await mount();
    expect(r.queryByText(EMPTY_WIRE)).toBeNull();
    expect(r.queryByText('Transmission Interrupted')).toBeNull();
  });

  it('a wire that ARRIVED empty is the only one said to be empty', async () => {
    const r = await mount();
    expect(r.getByText(EMPTY_WIRE)).toBeTruthy();
  });

  it('a pull that reaches nothing keeps the page and says so', async () => {
    const r = await mount();
    expect(r.getByText(EMPTY_WIRE)).toBeTruthy();
    mockHouse = 'down';
    await act(async () => { await mockScrollProps.refreshControl.props.onRefresh(); await settle(); });
    await flush();
    expect(toast().error).toHaveBeenCalledWith('Could not refresh — check your connection.');
    expect(r.getByText(EMPTY_WIRE)).toBeTruthy();
    expect(r.getByLabelText('The weekly feature: Sunrise')).toBeTruthy();
  });

  it('a pull asks the wire again — the live pages are always asked', async () => {
    const r = await mount();
    const { supabase } = jest.requireMock('@/src/lib/supabase');
    const from = jest.spyOn(supabase, 'from');
    await act(async () => { await mockScrollProps.refreshControl.props.onRefresh(); await settle(); });
    expect(from).toHaveBeenCalledWith('logs');
    // And the weekly programme, fresh, is not asked for again.
    expect(mockTmdb.trending).toHaveBeenCalledTimes(1);
    expect(toast().error).not.toHaveBeenCalled();
    from.mockRestore();
    expect(r.getByText(EMPTY_WIRE)).toBeTruthy();
  });
});
