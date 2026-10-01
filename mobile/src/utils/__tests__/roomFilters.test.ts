/**
 * roomFilters.test.ts — one answer to "is this room narrowed?", naming every
 * filter each room has.
 *
 * The reducer asked it of the archive by its status chip alone, so a refresh
 * reseeded a searched archive with the whole one; "load more" asked it of the
 * watchlist without its decade and of the shelf without its sort or search.
 */
import { isNarrowed, ROOMS } from '../roomFilters';
import { profileReducer, initialState, type ProfileUser } from '@/src/hooks/useProfileData';

describe('a room is narrowed by any one of its filters', () => {
  it.each([
    ['archive', { status: 'abandoned' }],
    ['archive', { search: 'noir' }],
    ['ledger', { search: 'noir' }],
    ['ledger', { rating: 5 }],
    ['ledger', { rating: 'high' }],
    ['watchlist', { search: 'noir' }],
    ['watchlist', { sort: 'az' }],
    ['watchlist', { decade: 1970 }],
    ['physical', { filter: 'VHS' }],
    ['physical', { sort: 'za' }],
    ['physical', { search: 'criterion' }],
    ['lists', { sort: 'az' }],
    ['lists', { search: 'noir' }],
  ] as const)('%s by %j', (room, filters) => {
    expect(isNarrowed(room, filters as never)).toBe(true);
  });

  it.each(ROOMS)('and %s by none of them, or none at all', (room) => {
    expect(isNarrowed(room, undefined)).toBe(false);
    expect(isNarrowed(room, {} as never)).toBe(false);
    expect(isNarrowed(room, { status: 'all', search: '   ', rating: 'all', sort: 'default', decade: null, filter: null } as never)).toBe(false);
  });

  it('the hook’s own starting filters narrow nothing', () => {
    for (const room of ROOMS) {
      expect(isNarrowed(room, (initialState.activeFilters as Record<string, unknown>)[room] as never)).toBe(false);
    }
  });
});

describe('a refresh never reseeds a narrowed room', () => {
  const user = { id: 'u1', username: 'tomas', is_social_private: false } as ProfileUser;
  const unfiltered = [{ id: 'all-1' }, { id: 'all-2' }] as never[];

  it('a searched archive keeps its search’s rows', () => {
    const searched = [{ id: 'noir-1' }] as never[];
    const state = { ...initialState, archiveLogs: searched, activeFilters: { ...initialState.activeFilters, archive: { status: 'all', search: 'noir' } } };
    const next = profileReducer(state, { type: 'USER_DATA_LOADED', user, counts: {}, serverStreak: null, logs: unfiltered, logsCursor: null });
    expect(next.archiveLogs).toBe(searched);
    expect(next.mainLogs).toBe(unfiltered);
  });

  it('an unfiltered one is reseeded', () => {
    const next = profileReducer(initialState, { type: 'USER_DATA_LOADED', user, counts: {}, serverStreak: null, logs: unfiltered, logsCursor: null });
    expect(next.archiveLogs).toBe(unfiltered);
  });
});
