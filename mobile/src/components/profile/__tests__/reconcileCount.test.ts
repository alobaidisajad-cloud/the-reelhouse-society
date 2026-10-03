/**
 * reconcileCount.test.ts — #86, the two numbers that disagreed
 * ────────────────────────────────────────────────────────────
 * The WATCHLIST StatCard read `counts.watchlist` raw while the WATCHLIST pill a few
 * pixels away read `counts.watchlist || displayWatchlist.length`. On the cache-first
 * path for your own dossier every count is seeded to 0 — so the card showed
 * WATCHLIST 0 while the pill beside it showed the truth.
 *
 * These tests pin the RULE rather than either consumer, because the defect was never
 * in one of them: it was in there being two expressions at all. FILMS already used
 * `Math.max` for self while every pill used `||`, so the file had already drifted once.
 */
import { renderHook } from '@testing-library/react-native';
import { reconcileCount, useProfileComputed } from '../profileComputed';

const SELF = true;
const OTHER = false;

describe('the cold-start case that caused #86', () => {
  it('never shows zero when the device already knows better', () => {
    // The exact scenario: cache-first path seeds counts to 0, MMKV has 42 items.
    expect(reconcileCount(0, 42, SELF)).toBe(42);
  });

  it('shows the same number for a StatCard and a pill, because there is one number', async () => {
    // The screen's WATCHLIST StatCard reads `totalWatchlist`; the WATCHLIST pill
    // reads its collection card. On the cold start both must say the 42 the
    // device holds, not the seeded 0.
    const queue = Array.from({ length: 42 }, (_, i) => ({ id: i + 1, title: `Film ${i + 1}`, poster: null, year: 1950 }));
    const c = (await renderHook(() => useProfileComputed({
      isSelf: true, myLogs: [], myWatchlist: queue, myVault: [], myLists: [],
      mainLogs: [], archiveLogs: [], ledgerLogs: [], analyticsLogs: [], watchlist: [], vault: [], lists: [],
      counts: { logs: 0, ledger: 0, watchlist: 0, vault: 0, lists: 0 },
      isArchivistPlus: false, isAuteurPlus: false, targetUser: { id: 'me' }, username: 'tomas', serverStreak: null,
      archiveSieve: 'all', archiveSearch: '', listsSearch: '', physicalSearch: '',
      ledgerSearch: '', ledgerRatingFilter: 'all', watchlistDecade: null,
      watchlistSearch: '', watchlistSort: 'default', physicalFilter: null,
      physicalSort: 'default', listsSort: 'default',
    } as never))).result.current;
    expect(c.totalWatchlist).toBe(42);
    expect(c.COLLECTION_CARDS.find((card) => card.id === 'watchlist')?.count).toBe('42');
  });
});

describe('SELF — never less than what is already on the device', () => {
  it('takes the larger of server and local', () => {
    expect(reconcileCount(300, 150, SELF)).toBe(300);   // server ahead (window is 150)
    expect(reconcileCount(100, 150, SELF)).toBe(150);   // local ahead — mid-write, or paging
  });

  it('a real zero is still zero', () => {
    // A member with an empty watchlist must see 0, not a fallback.
    expect(reconcileCount(0, 0, SELF)).toBe(0);
  });
});

describe('OTHER — the server is authoritative', () => {
  it('uses the server count when it has one', () => {
    expect(reconcileCount(88, 4, OTHER)).toBe(88);
  });

  it('falls back to what was fetched, only before the count arrives', () => {
    expect(reconcileCount(0, 4, OTHER)).toBe(4);
  });

  it('does NOT let a partial page inflate a stranger above the truth', () => {
    // The reason this branch is `||` and not Math.max: for someone else's profile the
    // array is just this session's fetch, and 4 fetched rows must never outrank a
    // server count of 3.
    expect(reconcileCount(3, 4, OTHER)).toBe(3);
    expect(reconcileCount(3, 4, SELF)).toBe(4);   // ...whereas for yourself it should
  });
});

describe('malformed input cannot render NaN on a profile', () => {
  it.each([undefined, null])('a missing server count behaves as zero (%p)', (v) => {
    expect(reconcileCount(v as unknown as number, 9, SELF)).toBe(9);
    expect(reconcileCount(v as unknown as number, 9, OTHER)).toBe(9);
    expect(reconcileCount(v as unknown as number, 0, SELF)).toBe(0);
  });
});
