/**
 * theBestFilmsAreReadFromTheWholeRecord.test.ts — HIGHEST RATED, as the server reads it.
 * ─────────────────────────────────────────────────────────────────────────────
 * The member page picked its six highest-rated films from the logs that had
 * loaded, so a long record showed the best of its latest pages. The read now
 * asks the database: rated 4 and up, highest first, the more recent among
 * equals, six of them, over every log the viewer may see.
 */
import { ProfileDataService } from '../ProfileDataService';
import { PUBLIC_LOG_COLUMNS } from '@/src/utils/mappers';

const mockCalls: [string, unknown[]][] = [];
let mockAnswer: { data: unknown; error: unknown } = { data: [], error: null };

jest.mock('@/src/lib/supabase', () => {
  // Records every call in the chain; awaiting it gives the answer.
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'order', 'limit']) {
    chain[m] = (...args: unknown[]) => { mockCalls.push([m, args]); return chain; };
  }
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(mockAnswer).then(resolve);
  return { supabase: { from: (table: string) => { mockCalls.push(['from', [table]]); return chain; } } };
});

beforeEach(() => { mockCalls.length = 0; mockAnswer = { data: [], error: null }; });

describe('fetchHighestRated', () => {
  it('asks for six, rated 4 and up, highest first and the more recent among equals', async () => {
    await ProfileDataService.fetchHighestRated({ id: 'u2' });
    expect(mockCalls).toEqual([
      ['from', ['logs']],
      ['select', [PUBLIC_LOG_COLUMNS]],
      ['eq', ['user_id', 'u2']],
      ['gte', ['rating', 4]],
      ['order', ['rating', { ascending: false }]],
      ['order', ['watched_date', { ascending: false, nullsFirst: false }]],
      ['order', ['id', { ascending: false }]],
      ['limit', [6]],
    ]);
  });

  it('a failed read throws, so the room says so instead of showing none', async () => {
    mockAnswer = { data: null, error: { message: 'unreachable' } };
    await expect(ProfileDataService.fetchHighestRated({ id: 'u2' })).rejects.toEqual({ message: 'unreachable' });
  });
});
