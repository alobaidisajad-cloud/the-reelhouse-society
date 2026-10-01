/**
 * aCountNotReadIsNotZero.test.ts — the profile's counts, when a count cannot be read.
 * ─────────────────────────────────────────────────────────────────────────────
 * supabase-js resolves a failed count as `{ count: null, error }`. Read as `?? 0`
 * it became a member with no films: the profile drew the loaded window in its
 * place, ranked the member by it, and on their own profile cached the zeros as
 * exact, to seed the next cold start. An unread count is undefined, and keeps
 * the number already on screen.
 */
import { ProfileDataService } from '../ProfileDataService';
import { profileReducer } from '@/src/hooks/useProfileData';

type Answer = { count: number | null; error: { message: string } | null };
const mockAnswers: Record<string, Answer> = {};

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: null, error: { message: 'function unavailable' } }),
    from: (table: string) => {
      let key = table;
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.or = () => { key = `${table}+rated`; return chain; };
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(mockAnswers[key]).then(res);
      return chain;
    },
  },
}));
jest.mock('@sentry/react-native', () => ({ captureException: jest.fn(), addBreadcrumb: jest.fn() }));

const MEMBER = { id: 'u1', tier: 'archivist', role: 'archivist', is_founding: false } as never;
const read = (count: number): Answer => ({ count, error: null });
const failed: Answer = { count: null, error: { message: 'Failed to fetch' } };

beforeEach(() => {
  Object.assign(mockAnswers, {
    logs: read(815), 'logs+rated': read(402), watchlists: read(96), physical_archive: read(12), lists: read(7),
  });
});

describe('a count the house could not give', () => {
  it('is undefined, not zero, and the counts that were read stand', async () => {
    mockAnswers.logs = failed;
    const counts = await ProfileDataService.fetchCounts(MEMBER, true);
    expect(counts.logs).toBeUndefined();
    expect(counts).toEqual(expect.objectContaining({ ledger: 402, watchlist: 96, vault: 12, lists: 7 }));
  });

  it('keeps the number already on screen', () => {
    const before = { counts: { logs: 815, ledger: 400, watchlist: 90, vault: 12, lists: 7 } } as never;
    const after = profileReducer(before, { type: 'SET_COUNTS', payload: { logs: undefined, ledger: 402 } });
    expect(after.counts).toEqual(expect.objectContaining({ logs: 815, ledger: 402, watchlist: 90 }));
  });

  it('keeps it when the whole profile arrives too', () => {
    const before = { counts: { logs: 815, ledger: 400, watchlist: 90, vault: 12, lists: 7 }, activeFilters: {}, tabDataLoaded: {} } as never;
    const after = profileReducer(before, {
      type: 'USER_DATA_LOADED', user: { id: 'u1' } as never, serverStreak: null,
      counts: { logs: undefined, ledger: undefined, watchlist: 91, vault: undefined, lists: undefined },
    });
    expect(after.counts).toEqual(expect.objectContaining({ logs: 815, ledger: 400, watchlist: 91 }));
  });
});
