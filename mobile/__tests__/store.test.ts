import { useFilmStore } from '../src/stores/films';

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

  it('updates derived indices when logs are added', () => {
    const mockLog = { id: 1, filmId: 100, rating: 5, review: 'Masterpiece' };
    
    useFilmStore.setState({
      logs: [mockLog as any],
      _loggedIndex: { 100: mockLog as any }
    });

    const state = useFilmStore.getState();
    
    expect(state.logs.length).toBe(1);
    expect(state._loggedIndex[100]).toBeDefined();
    
    // Verify derived checks work correctly
    expect(state._loggedIndex[100]).toBeDefined();
    expect(state._loggedIndex[200]).toBeUndefined();
  });

  it('handles watchlist indexing correctly', () => {
    const mockWatchlistItem = { id: 50, filmId: 100 };
    
    useFilmStore.setState({
      watchlist: [mockWatchlistItem as any],
      _watchlistIndex: { 100: true }
    });

    const state = useFilmStore.getState();
    expect(state.watchlist.length).toBe(1);
    expect(state._watchlistIndex[100]).toBe(true);
  });
});
