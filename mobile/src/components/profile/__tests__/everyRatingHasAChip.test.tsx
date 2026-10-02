/**
 * everyRatingHasAChip.test.tsx — every rated entry in the Ledger sits under
 * exactly one rating chip.
 *
 * A rating moves in half reels and the chips in whole ones, and each chip
 * matched its own number exactly: 82 entries in the house, rated ½, 1½, 2½, 3½
 * or 4½, were under no chip at all, and the 4+ chip's count left out every 4½
 * its own filter showed. A half now goes with the reel below it, in the room,
 * in the server's query and in the counts alike.
 */
import React, { act } from 'react';
import { render, renderHook } from '@testing-library/react-native';
import ProfileLedgerTab from '../ProfileLedgerTab';
import { useProfileComputed } from '../profileComputed';
import { ledgerRung, ledgerRungRange } from '@/src/types';
import { ProfileDataService } from '@/src/services/ProfileDataService';
import { supabase } from '@/src/lib/supabase';

jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn() }));

const HALVES = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

describe('a half goes with the reel below it', () => {
  it.each([
    [0.5, 1], [1, 1], [1.5, 1], [2, 2], [2.5, 2], [3, 3], [3.5, 3], [4, 4], [4.5, 4], [5, 5],
  ])('%s sits under chip %s', (rating, chip) => {
    expect(ledgerRung(rating)).toBe(chip);
  });

  it('and the range each chip asks the server for holds exactly its own ratings', () => {
    for (const r of HALVES) {
      const holding = [1, 2, 3, 4, 5].filter((chip) => {
        const { from, below } = ledgerRungRange(chip);
        return r >= from && r < below;
      });
      expect(holding).toEqual([ledgerRung(r)]);
    }
  });
});

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

describe('the room', () => {
  it('chip 3 shows the 3s and the 3½s, and nothing else', async () => {
    const ledgerLogs = HALVES.map((rating, i) => ({ id: `l${i}`, filmId: i, title: `Film ${i}`, rating, review: '' }));
    const c = (await renderHook(() => useProfileComputed({ ...base, ledgerLogs, ledgerRatingFilter: 3 } as never))).result.current;
    expect(c.ledgerFiltered.map((l: { rating: number }) => l.rating)).toEqual([3, 3.5]);
  });
});

describe('the server', () => {
  it('chip 3 asks for 3 up to, not including, 4', async () => {
    const calls: [string, unknown[]][] = [];
    const chain: Record<string, unknown> = new Proxy({}, {
      get: (_t, name) => name === 'then'
        ? (ok: (v: unknown) => void) => ok({ data: [], error: null })
        : (...args: unknown[]) => { calls.push([String(name), args]); return chain; },
    });
    jest.spyOn(supabase, 'from').mockReturnValue(chain as never);
    await ProfileDataService.fetchOtherUserLogs('u9', 50, undefined, undefined, { rating: 3 });
    expect(calls).toContainEqual(['gte', ['rating', 3]]);
    expect(calls).toContainEqual(['lt', ['rating', 4]]);
    expect(calls.some(([m, a]) => m === 'eq' && a[0] === 'rating')).toBe(false);
  });
});

describe('the chips', () => {
  const mount = async (over: Record<string, unknown>) => {
    const r = render(
      <ProfileLedgerTab
        logs={[{ id: 'l1', filmId: 1, title: 'Stalker', rating: 4.5, review: '' }] as never[]}
        ledgerFiltered={[]} ledgerSearch="" setLedgerSearch={jest.fn()}
        ledgerRatingFilter="all" setLedgerRatingFilter={jest.fn()}
        halfLifeMap={{}} groupByMonth={() => ({})}
        {...over}
      />,
    );
    await act(async () => { await Promise.resolve(); });
    return r;
  };

  it('4+ counts its 4½s', async () => {
    const r = await mount({ ratingCounts: [{ rating: 3.5, count: 36 }, { rating: 4, count: 74 }, { rating: 4.5, count: 27 }, { rating: 5, count: 49 }] });
    expect(r.getByLabelText('Show entries rated 4 of 5 or better')).toBeTruthy();
    expect(r.getByText(/^ *150$/)).toBeTruthy();
  });

  it('a chip says what it holds', async () => {
    const r = await mount({});
    expect(r.getByLabelText('Show entries rated 1.5 of 5 or less')).toBeTruthy();
    expect(r.getByLabelText('Show entries rated 3 or 3.5 of 5')).toBeTruthy();
    expect(r.getByLabelText('Show entries rated 5 of 5')).toBeTruthy();
  });

  it('and an empty chip says it in the same words', async () => {
    const r = await mount({ ledgerRatingFilter: 3 });
    expect(r.getByText('Nothing in the ledger is rated 3 or 3.5 of 5.')).toBeTruthy();
  });
});
