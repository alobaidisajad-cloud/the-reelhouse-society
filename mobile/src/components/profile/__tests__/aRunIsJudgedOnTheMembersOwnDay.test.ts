/**
 * aRunIsJudgedOnTheMembersOwnDay.test.ts — "N NIGHTS RUNNING" stands while the member's own
 * yesterday or today is in it (review round 11).
 *
 * The house judged the run against its own day, UTC's. A member in New York who saw a film on
 * the 13th, 14th and 15th opened their file at 8pm on the 16th, after the house's midnight: no
 * run at all, though at 10am it said "3 NIGHTS RUNNING". East of UTC the other way: a run broken
 * on the member's yesterday stood until the house's day turned. The house now gives its newest
 * run whole (current_run) and the phone judges it on its own calendar.
 */
import { act, renderHook } from '@testing-library/react-native';
import { houseRunOf, runStillStanding, useProfileComputed } from '../profileComputed';

const base = {
  isSelf: false, myLogs: [], myWatchlist: [], myVault: [], myLists: [],
  mainLogs: [], archiveLogs: [], ledgerLogs: [], watchlist: [], vault: [], lists: [],
  counts: { logs: 0, ledger: 0, watchlist: 0, vault: 0, lists: 0 },
  isArchivistPlus: true, isAuteurPlus: true, targetUser: { id: 'u9' }, username: 'vesper', serverStreak: null,
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

const streakOf = async (over: Record<string, unknown>) =>
  (await renderHook(() => useProfileComputed({ ...base, ...over } as never))).result.current.streak;

describe("the run on a member's file", () => {
  it("still stands at 8pm on the member's day after its last night, whatever the house's day", async () => {
    on('2026-11-16T20:00:00');
    // What the house says after its midnight: its own day judged the run over (current_streak 0).
    const shape = { current_streak: 0, current_run: { length: 3, ends_on: '2026-11-15' } };
    expect(await streakOf({ serverStreak: 0, analyticsShape: shape })).toBe(3);
  });

  it("has ended once the member's yesterday is not in it, though the house's day still holds it", async () => {
    on('2026-11-17T07:00:00');
    // East of UTC: the house is still on the 16th and counts the run ending on the 15th.
    const shape = { current_streak: 3, current_run: { length: 3, ends_on: '2026-11-15' } };
    expect(await streakOf({ serverStreak: 3, analyticsShape: shape })).toBe(0);
  });

  it('stands on a night the member has already seen a film', async () => {
    on('2026-11-16T22:00:00');
    expect(await streakOf({ serverStreak: 0, analyticsShape: { current_run: { length: 4, ends_on: '2026-11-16' } } })).toBe(4);
  });

  it('is none for a file with no viewing at all', async () => {
    on('2026-11-16T20:00:00');
    expect(await streakOf({ serverStreak: 2, analyticsShape: { current_streak: 2, current_run: null } })).toBe(0);
  });

  it('from an older house, with no run given, is the count it gave', async () => {
    on('2026-11-16T20:00:00');
    expect(await streakOf({ serverStreak: 5, analyticsShape: { current_streak: 5 } })).toBe(5);
  });

  it("ends at the member's own midnight while the file stays open", async () => {
    jest.useFakeTimers({ doNotFake: ['performance'] });
    try {
      on('2026-11-16T23:59:50');
      const { result } = await renderHook(() => useProfileComputed({ ...base, serverStreak: 0, analyticsShape: { current_run: { length: 3, ends_on: '2026-11-15' } } } as never));
      expect(result.current.streak).toBe(3);
      jest.restoreAllMocks();
      on('2026-11-17T00:00:20');
      await act(async () => { jest.advanceTimersByTime(30_000); });
      expect(result.current.streak).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('the house run, read', () => {
  it('reads a run, a run of none, and says nothing for a house that gave none', () => {
    expect(houseRunOf({ current_run: { length: 3, ends_on: '2026-11-15' } })).toEqual({ length: 3, endsOn: '2026-11-15' });
    expect(houseRunOf({ current_run: null })).toEqual({ length: 0, endsOn: null });
    expect(houseRunOf({ current_streak: 3 })).toBeNull();
    expect(houseRunOf(null)).toBeNull();
    expect(houseRunOf({ current_run: { length: 3, ends_on: 'soon' } })).toBeNull();
  });

  it('stands from the last night to the night after it, and no later', () => {
    const run = { length: 3, endsOn: '2026-11-15' };
    expect([runStillStanding(run, '2026-11-14'), runStillStanding(run, '2026-11-15'), runStillStanding(run, '2026-11-16')]).toEqual([3, 3, 0]);
  });
});
