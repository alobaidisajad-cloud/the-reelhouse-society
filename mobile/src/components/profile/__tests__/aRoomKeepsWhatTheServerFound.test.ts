/**
 * aRoomKeepsWhatTheServerFound.test.ts — a room's search, on the phone and at
 * the server, is one search.
 *
 * Each room filters the server's page again on the phone. Two of those copies
 * asked less than the server did, and dropped what it found: the Ledger looked
 * at titles only though the server (and the search box) reach what was
 * written, and the Watchlist did not trim, so "laura " — the space a phone
 * keyboard leaves after a suggested word — emptied the room.
 */
import { renderHook } from '@testing-library/react-native';
import { useProfileComputed } from '../profileComputed';
import { matchesSearch } from '@/src/utils/searchPattern';

const base = {
  isSelf: false, myLogs: [], myWatchlist: [], myVault: [], myLists: [],
  mainLogs: [], archiveLogs: [], ledgerLogs: [], analyticsLogs: [], watchlist: [], vault: [], lists: [],
  counts: { logs: 0, ledger: 0, watchlist: 0, vault: 0, lists: 0 },
  isArchivistPlus: true, isAuteurPlus: true, targetUser: { id: 'u9' }, username: 'vesper', serverStreak: null,
  archiveSieve: 'all', archiveSearch: '', listsSearch: '', physicalSearch: '',
  ledgerSearch: '', ledgerRatingFilter: 'all' as const, watchlistDecade: null,
  watchlistSearch: '', watchlistSort: 'default' as const, physicalFilter: null,
  physicalSort: 'default' as const, listsSort: 'default' as const,
};
const computed = async (over: Record<string, unknown>) =>
  (await renderHook(() => useProfileComputed({ ...base, ...over } as never))).result.current;

describe('what the server found for a search, the room keeps', () => {
  it('the Ledger: a word in the review, not the title', async () => {
    const found = [{ id: 'l1', filmId: 1, title: 'Stalker', rating: 4, review: '<p>A quiet noir of a pilgrimage.</p>' }];
    const c = await computed({ ledgerLogs: found, ledgerSearch: 'noir' });
    expect(c.ledgerFiltered.map((l) => l.id)).toEqual(['l1']);
  });

  it('the Watchlist: with the space a keyboard leaves', async () => {
    const found = [{ id: 1, title: 'Laura', year: 1944 }];
    const c = await computed({ watchlist: found, watchlistSearch: 'laura ' });
    expect(c.watchlistFiltered).toHaveLength(1);
  });

  it('the Archive: a comma, which the server reads as any one character', async () => {
    const found = [{ id: 'l2', filmId: 2, title: 'Girl, Interrupted', status: 'watched' }];
    const c = await computed({ archiveLogs: found, archiveSearch: 'girl, interrupted ' });
    expect(c.archiveFiltered).toHaveLength(1);
  });

  it('the shelf: the member’s own notes', async () => {
    const found = [{ id: 'v1', filmId: 3, title: 'Alien', notes: 'the one Dad gave me', formats: ['VHS'] }];
    const c = await computed({ vault: found, physicalSearch: 'dad ' });
    expect(c.physicalFiltered).toHaveLength(1);
  });

  it('the Stacks: a stack’s description', async () => {
    const found = [{ id: 's1', title: 'Rain', description: 'Noir in the wet', films: [] }];
    const c = await computed({ lists: found, listsSearch: 'noir ' });
    expect(c.displayLists).toHaveLength(1);
  });
});

describe('matchesSearch, the server’s ILIKE on the phone', () => {
  it.each([
    ['noir', 'NOIR at night', true],
    ['  noir  ', 'a noir', true],
    ['girl, interrupted', 'Girl; Interrupted', true],     // `,` stands for any one character
    ['bin (2020)', 'Bin [2020]', true],                    // and so do `(` and `)`
    ['mr. & mrs.', 'Mr. & Mrs. Smith', true],
    ['mr. & mrs.', 'Mrx & Mrs Smith', false],              // `.` is a full stop, not a wildcard
    ['what?', 'What? A film', true],
    ['what?', 'Wha', false],
    ['8½', '8½ (1963)', true],
    ['a*b', 'a and b', false],                             // `*` is literal, as the server escapes it
    ['', 'anything', true],
  ])('%j in %j: %s', (term, text, expected) => {
    expect(matchesSearch(term, text)).toBe(expected);
  });

  it('looks in every text it is given, and finds nothing in none', () => {
    expect(matchesSearch('dad', 'Alien', 'the one Dad gave me')).toBe(true);
    expect(matchesSearch('dad', null, undefined)).toBe(false);
  });
});
