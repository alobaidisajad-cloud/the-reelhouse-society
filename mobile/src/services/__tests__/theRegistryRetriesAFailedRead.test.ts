/**
 * theRegistryRetriesAFailedRead.test.ts — a failed read of the Member Registry is
 * a failure, not an empty House.
 *
 * useNotableMembers caches the answer for ten minutes. Returned as [], a failed
 * read was cached as the answer, never retried, and the registry stayed hidden;
 * thrown, react-query retries it and caches nothing.
 */
import { MemberDiscoveryService } from '../MemberDiscoveryService';

let mockAnswer: unknown;
const mockFilters: string[] = [];

jest.mock('@/src/lib/supabase', () => {
  const q: Record<string, unknown> = {};
  const self = () => q;
  q.select = self;
  q.eq = (col: string, v: unknown) => { mockFilters.push(`${col}=${String(v)}`); return q; };
  q.not = self;
  q.order = self;
  q.limit = self;
  q.abortSignal = self;
  q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(mockAnswer).then(res, rej);
  return { supabase: { from: () => q } };
});

beforeEach(() => { mockFilters.length = 0; });

describe('the Member Registry read', () => {
  it('returns the members it read', async () => {
    mockAnswer = { data: [{ id: 'a', username: 'ada' }], error: null };
    await expect(MemberDiscoveryService.getNotableMembers()).resolves.toEqual([{ id: 'a', username: 'ada' }]);
  });

  it('throws on a failed read, so it is retried and not cached as an empty House', async () => {
    mockAnswer = { data: null, error: { message: 'TypeError: Network request failed' } };
    await expect(MemberDiscoveryService.getNotableMembers()).rejects.toMatchObject({ message: 'TypeError: Network request failed' });
  });

  it('asks only for public members: nothing on the server keeps private ones out', async () => {
    mockAnswer = { data: [], error: null };
    await MemberDiscoveryService.getNotableMembers();
    expect(mockFilters).toContain('is_social_private=false');
    expect(mockFilters).toContain('is_banned=false');
  });
});
