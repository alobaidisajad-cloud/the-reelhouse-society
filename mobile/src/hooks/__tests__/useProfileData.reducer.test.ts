/**
 * useProfileData.reducer.test.ts — Profile Reducer Tests
 * ────────────────────────────────────────────────────────
 * useProfileData's core complexity lives in its reducer: 22 action types,
 * cursor-based pagination, append-with-dedup, and filter-aware state
 * merging on USER_DATA_LOADED. This tests that pure reducer directly,
 * following the codebase's pattern of testing extracted logic rather than
 * rendering the hook.
 */
import { profileReducer, initialState, ProfileState, ProfileUser } from '../useProfileData';

function makeUser(overrides: Partial<ProfileUser> = {}): ProfileUser {
  return {
    id: 'u1',
    username: 'cinephile1',
    is_social_private: false,
    ...overrides,
  } as ProfileUser;
}

describe('profileReducer', () => {
  it('RESET_STATE returns a fresh copy of initialState', () => {
    const dirty: ProfileState = { ...initialState, loading: false, mainLogs: [{ id: 'l1' } as any] };
    const result = profileReducer(dirty, { type: 'RESET_STATE' });
    expect(result).toEqual(initialState);
    expect(result).not.toBe(initialState); // fresh object, not a shared reference
  });

  describe('SET_USER', () => {
    it('sets the user directly', () => {
      const user = makeUser();
      const result = profileReducer(initialState, { type: 'SET_USER', payload: user });
      expect(result.targetUser).toBe(user);
    });

    it('accepts an updater function', () => {
      const user = makeUser({ username: 'old' });
      const state = { ...initialState, targetUser: user };
      const result = profileReducer(state, {
        type: 'SET_USER',
        payload: (prev) => (prev ? { ...prev, username: 'new' } : prev),
      });
      expect(result.targetUser?.username).toBe('new');
    });
  });

  describe('SET_LOADING', () => {
    it('clears error when loading turns true', () => {
      const state = { ...initialState, error: new Error('boom') };
      const result = profileReducer(state, { type: 'SET_LOADING', payload: true });
      expect(result.loading).toBe(true);
      expect(result.error).toBeNull();
    });

    it('preserves existing error when loading turns false', () => {
      const err = new Error('boom');
      const state = { ...initialState, error: err };
      const result = profileReducer(state, { type: 'SET_LOADING', payload: false });
      expect(result.error).toBe(err);
    });
  });

  it('SET_ERROR sets the error and forces loading false', () => {
    const err = new Error('fail');
    const result = profileReducer({ ...initialState, loading: true }, { type: 'SET_ERROR', payload: err });
    expect(result.error).toBe(err);
    expect(result.loading).toBe(false);
  });

  it('SET_REFRESHING toggles refreshing', () => {
    const result = profileReducer(initialState, { type: 'SET_REFRESHING', payload: true });
    expect(result.refreshing).toBe(true);
  });

  it('SET_COUNTS replaces counts', () => {
    const counts = { logs: 5, ledger: 2, watchlist: 1, vault: 0, lists: 3 };
    const result = profileReducer(initialState, { type: 'SET_COUNTS', payload: counts });
    expect(result.counts).toEqual(counts);
  });

  it('SET_TAB_LOADED merges into existing tabDataLoaded', () => {
    const state = { ...initialState, tabDataLoaded: { archive: true } };
    const result = profileReducer(state, { type: 'SET_TAB_LOADED', tabs: { watchlist: true } });
    expect(result.tabDataLoaded).toEqual({ archive: true, watchlist: true });
  });

  it('SET_ANALYTICS replaces analyticsLogs', () => {
    const logs = [{ id: 'a1' } as any];
    const result = profileReducer(initialState, { type: 'SET_ANALYTICS', payload: logs });
    expect(result.analyticsLogs).toBe(logs);
  });

  it('SET_CALENDAR_DATA replaces calendarData', () => {
    const data = [{ watchedDate: '2026-01-01', rating: 4, status: 'watched' }];
    const result = profileReducer(initialState, { type: 'SET_CALENDAR_DATA', payload: data });
    expect(result.calendarData).toBe(data);
  });

  it('SET_SERVER_ANALYTICS replaces serverAnalytics', () => {
    const payload = { current_streak: 3 };
    const result = profileReducer(initialState, { type: 'SET_SERVER_ANALYTICS', payload });
    expect(result.serverAnalytics).toBe(payload);
  });

  describe('SET_LOGS_PAGE', () => {
    it('replaces items for a tab when append is false', () => {
      const state = { ...initialState, mainLogs: [{ id: 'old' } as any] };
      const result = profileReducer(state, {
        type: 'SET_LOGS_PAGE', tab: 'main', items: [{ id: 'new' } as any], cursor: 'c1',
      });
      expect(result.mainLogs).toEqual([{ id: 'new' }]);
      expect(result.mainLogsCursor).toBe('c1');
      expect(result.hasMoreMainLogs).toBe(true);
    });

    it('appends and dedupes by id for the archive tab', () => {
      const state = { ...initialState, archiveLogs: [{ id: '1' } as any, { id: '2' } as any] };
      const result = profileReducer(state, {
        type: 'SET_LOGS_PAGE', tab: 'archive',
        items: [{ id: '2' } as any, { id: '3' } as any],
        cursor: null, append: true,
      });
      expect(result.archiveLogs.map((l: any) => l.id)).toEqual(['1', '2', '3']);
      expect(result.hasMoreArchiveLogs).toBe(false); // cursor null -> no more
    });

    it('appends and dedupes for the ledger tab', () => {
      const state = { ...initialState, ledgerLogs: [{ id: '1' } as any] };
      const result = profileReducer(state, {
        type: 'SET_LOGS_PAGE', tab: 'ledger',
        items: [{ id: '1' } as any, { id: '2' } as any],
        cursor: 'c2', append: true,
      });
      expect(result.ledgerLogs.map((l: any) => l.id)).toEqual(['1', '2']);
      expect(result.ledgerLogsCursor).toBe('c2');
    });

    it('returns state unchanged for an unrecognized tab', () => {
      const result = profileReducer(initialState, {
        type: 'SET_LOGS_PAGE', tab: 'unknown' as any, items: [], cursor: null,
      });
      expect(result).toEqual(initialState);
    });
  });

  describe('SET_WATCHLIST_PAGE / SET_VAULT_PAGE / SET_LISTS_PAGE', () => {
    it('dedupes appended watchlist items by id', () => {
      const state = { ...initialState, watchlist: [{ id: 'w1' } as any] };
      const result = profileReducer(state, {
        type: 'SET_WATCHLIST_PAGE',
        items: [{ id: 'w1' } as any, { id: 'w2' } as any],
        cursor: 'c1', append: true,
      });
      expect(result.watchlist.map((w: any) => w.id)).toEqual(['w1', 'w2']);
    });

    it('dedupes appended vault items by id', () => {
      const state = { ...initialState, vault: [{ id: 'v1' } as any] };
      const result = profileReducer(state, {
        type: 'SET_VAULT_PAGE',
        items: [{ id: 'v1' } as any, { id: 'v2' } as any],
        cursor: null, append: true,
      });
      expect(result.vault.map((v: any) => v.id)).toEqual(['v1', 'v2']);
      expect(result.hasMoreVault).toBe(false);
    });

    it('dedupes appended list items by id', () => {
      const state = { ...initialState, lists: [{ id: 'l1' } as any] };
      const result = profileReducer(state, {
        type: 'SET_LISTS_PAGE',
        items: [{ id: 'l2' } as any],
        cursor: 'c3', append: true,
      });
      expect(result.lists.map((l: any) => l.id)).toEqual(['l1', 'l2']);
      expect(result.listsCursor).toBe('c3');
    });
  });

  it('SET_LOADING_MORE sets a single key in isLoadingMore', () => {
    const state = { ...initialState, isLoadingMore: { watchlist: true } };
    const result = profileReducer(state, { type: 'SET_LOADING_MORE', key: 'vault', value: true });
    expect(result.isLoadingMore).toEqual({ watchlist: true, vault: true });
  });

  describe('USER_DATA_LOADED', () => {
    it('seeds main/archive/ledger logs when no active filters are set', () => {
      const user = makeUser();
      const logs = [{ id: 'l1' } as any];
      const result = profileReducer(initialState, {
        type: 'USER_DATA_LOADED', user, counts: initialState.counts,
        serverStreak: 7, logs, logsCursor: 'next1',
      });
      expect(result.targetUser).toBe(user);
      expect(result.serverStreak).toBe(7);
      expect(result.mainLogs).toBe(logs);
      expect(result.archiveLogs).toBe(logs);
      expect(result.ledgerLogs).toBe(logs);
      expect(result.archiveLogsCursor).toBe('next1');
      expect(result.ledgerLogsCursor).toBe('next1');
      expect(result.hasMoreArchiveLogs).toBe(true);
      expect(result.tabDataLoaded.archive).toBe(true);
      expect(result.tabDataLoaded.ledger).toBe(true);
    });

    it('leaves archiveLogs untouched when an archive status filter is active', () => {
      const user = makeUser();
      const existingArchive = [{ id: 'kept' } as any];
      const state: ProfileState = {
        ...initialState,
        archiveLogs: existingArchive,
        archiveLogsCursor: 'oldCursor',
        activeFilters: { ...initialState.activeFilters, archive: { status: 'owned' } },
      };
      const result = profileReducer(state, {
        type: 'USER_DATA_LOADED', user, counts: initialState.counts,
        serverStreak: null, logs: [{ id: 'fresh' } as any], logsCursor: 'newCursor',
      });
      expect(result.archiveLogs).toBe(existingArchive);
      expect(result.archiveLogsCursor).toBe('oldCursor');
    });

    it('leaves ledgerLogs untouched when a search or non-default rating filter is active', () => {
      const user = makeUser();
      const existingLedger = [{ id: 'kept' } as any];
      const state: ProfileState = {
        ...initialState,
        ledgerLogs: existingLedger,
        activeFilters: { ...initialState.activeFilters, ledger: { search: 'matrix', rating: 'all' } },
      };
      const result = profileReducer(state, {
        type: 'USER_DATA_LOADED', user, counts: initialState.counts,
        serverStreak: null, logs: [{ id: 'fresh' } as any], logsCursor: 'c',
      });
      expect(result.ledgerLogs).toBe(existingLedger);
    });

    it('does not touch logs when logs/logsCursor are omitted (non-self profile root load)', () => {
      const user = makeUser();
      const existingMain = [{ id: 'm1' } as any];
      const state: ProfileState = { ...initialState, mainLogs: existingMain, mainLogsCursor: 'c0' };
      const result = profileReducer(state, {
        type: 'USER_DATA_LOADED', user, counts: initialState.counts, serverStreak: null,
      });
      expect(result.mainLogs).toBe(existingMain);
      expect(result.mainLogsCursor).toBe('c0');
    });
  });

  it('SET_ACTIVE_FILTERS replaces filters for one tab only', () => {
    const state: ProfileState = {
      ...initialState,
      activeFilters: { ...initialState.activeFilters, watchlist: { search: 'old', sort: 'default' } },
    };
    const result = profileReducer(state, {
      type: 'SET_ACTIVE_FILTERS', tab: 'watchlist', filters: { search: 'new', sort: 'az' },
    });
    expect(result.activeFilters.watchlist).toEqual({ search: 'new', sort: 'az' });
    expect(result.activeFilters.archive).toEqual(initialState.activeFilters.archive);
  });

  it('returns state unchanged for an unknown action type', () => {
    const result = profileReducer(initialState, { type: 'NOT_A_REAL_ACTION' } as any);
    expect(result).toBe(initialState);
  });
});
