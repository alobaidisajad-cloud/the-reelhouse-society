/**
 * aRunIsNeverCountedFromAPart.test.ts — with no word from the house on the run, it is counted over
 * the records held here only when they are the member's whole record (round 13).
 *
 * The Projector walked the member's whole history, up to ten serial pages of a thousand records
 * before the room drew, only to count the run when the house's summary had not answered. The walk
 * is gone: the room draws on the house's three summaries. Without the summary, the run is counted
 * over the records held when they are all of them, and is otherwise unknown (nothing drawn), never
 * a run counted short from the first page.
 */
import { renderHook } from '@testing-library/react-native';
import { runOverHeld, useProfileComputed } from '../profileComputed';

const base = {
  isSelf: false, myLogs: [], myWatchlist: [], myVault: [], myLists: [],
  mainLogs: [], archiveLogs: [], ledgerLogs: [], watchlist: [], vault: [], lists: [],
  counts: { logs: 0, ledger: 0, watchlist: 0, vault: 0, lists: 0 },
  isArchivistPlus: true, targetUser: { id: 'u9' }, username: 'vesper', serverStreak: null,
  archiveSieve: 'all', archiveSearch: '', listsSearch: '', physicalSearch: '',
  ledgerSearch: '', ledgerRatingFilter: 'all' as const, watchlistDecade: null,
  watchlistSearch: '', watchlistSort: 'default' as const, physicalFilter: null,
  physicalSort: 'default' as const, listsSort: 'default' as const,
};

const realNow = Date.now.bind(Date);
/** The phone's clock set to `local` (the member's own wall clock) and running on from there. */
const on = (local: string) => {
  const from = realNow();
  return jest.spyOn(Date, 'now').mockImplementation(() => new Date(local).getTime() + (realNow() - from));
};
afterEach(() => jest.restoreAllMocks());

/** Three nights in a row, the last of them yesterday. */
const NIGHTS = ['2026-11-15', '2026-11-14', '2026-11-13'].map((day, i) => ({ id: `l${i}`, filmId: i + 1, watchedDate: day }));

const streakOf = async (over: Record<string, unknown>) =>
  (await renderHook(() => useProfileComputed({ ...base, ...over } as never))).result.current.streak;

describe('the run, when the house has not said it', () => {
  it('is counted over the records held when they are the whole record', async () => {
    on('2026-11-16T20:00:00');
    expect(await streakOf({ mainLogs: NIGHTS, recordCounted: 3 })).toBe(3);
  });

  it('is unknown when no count of the record answered: never a run counted from what is held', async () => {
    on('2026-11-16T20:00:00');
    expect(await streakOf({ mainLogs: NIGHTS, recordCounted: null })).toBeNull();
  });

  it('is unknown when only part of the record is held: never a run counted short from the first page', async () => {
    on('2026-11-16T20:00:00');
    expect(await streakOf({ mainLogs: NIGHTS, recordCounted: 400 })).toBeNull();
  });

  it("the house's own count, when it gave one, is the run", async () => {
    on('2026-11-16T20:00:00');
    expect(await streakOf({ mainLogs: NIGHTS, recordCounted: 400, serverStreak: 12 })).toBe(12);
  });
});

describe('runOverHeld', () => {
  const now = new Date('2026-11-16T20:00:00');
  it('counts the run over a whole record, and says nothing of a part', () => {
    expect(runOverHeld(NIGHTS, 3, now)).toBe(3);
    expect(runOverHeld(NIGHTS, 2, now)).toBe(3);
    expect(runOverHeld(NIGHTS, 4, now)).toBeNull();
    expect(runOverHeld([], 0, now)).toBe(0);
    expect(runOverHeld(NIGHTS, null, now)).toBeNull();
  });
});
