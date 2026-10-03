import { useFilmStore } from '../src/stores/films';
import { useAuthStore } from '../src/stores/auth';

// Mock MMKV
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    getString: jest.fn(),
    getNumber: jest.fn(),
    getBoolean: jest.fn(),
    contains: jest.fn(),
    delete: jest.fn(),
    clearAll: jest.fn(),
  })),
}));

// Mock Supabase
jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
  },
}));

describe('FilmStore Offline State & Indices', () => {
  beforeEach(() => {
    useFilmStore.setState({
      logs: [],
      watchlist: [],
      lists: [],
      interactions: [],
      physicalArchive: [],
      _loggedIndex: {},
      _watchlistIndex: {},
      _endorsedIndex: {},
      _listEndorsedIndex: {},
      _addLogMutex: false,
    });
  });

  // These two used to write an index with setState and read it straight back,
  // so the store's own index code never ran. The rebuild of every index from
  // the records the phone kept is tested through a real rehydrate in
  // stores/filmStore.test.ts; these drive the actions that keep the watchlist's
  // index in step while the app runs.
  afterEach(() => { useAuthStore.setState({ user: null }); });

  it('saving a film marks it in the watchlist index at once', async () => {
    useAuthStore.setState({ user: { id: 'u1', username: 'kane' } as never });
    await useFilmStore.getState().addToWatchlist({ id: 100, title: 'Sunrise', poster_path: null } as never);
    const state = useFilmStore.getState();
    expect(state.watchlist.map((w) => w.id)).toEqual([100]);
    expect(state._watchlistIndex[100]).toBe(true);
    expect(state._watchlistIndex[200]).toBeUndefined();
  });

  it('taking a film off the watchlist unmarks it, and leaves the others marked', async () => {
    useAuthStore.setState({ user: { id: 'u1', username: 'kane' } as never });
    await useFilmStore.getState().addToWatchlist({ id: 100, title: 'Sunrise', poster_path: null } as never);
    await useFilmStore.getState().addToWatchlist({ id: 200, title: 'Ikiru', poster_path: null } as never);
    await useFilmStore.getState().removeFromWatchlist(100);
    const state = useFilmStore.getState();
    expect(state.watchlist.map((w) => w.id)).toEqual([200]);
    expect(state._watchlistIndex[100]).toBeUndefined();
    expect(state._watchlistIndex[200]).toBe(true);
  });
});
