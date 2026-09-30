/**
 * Taking back a critique on a stack removes the member's own, and only theirs.
 * ─────────────────────────────────────────────────────────────────────────────
 * The house's rules already refuse a stranger's row; the request names its
 * writer as well, so a row that is not theirs is never even asked for. A
 * failure is thrown, for the page to put the critique back and say so.
 */
const mockAsked: { table: string; op: string; filters: [string, unknown][] }[] = [];
let mockAnswer: { error: unknown } = { error: null };

jest.mock('@/src/stores/auth', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'member-1' } }) },
}));
jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const asked = { table, op: '', filters: [] as [string, unknown][] };
      mockAsked.push(asked);
      const chain: Record<string, unknown> = {};
      chain.delete = () => { asked.op = 'delete'; return chain; };
      chain.eq = (c: string, v: unknown) => { asked.filters.push([c, v]); return chain; };
      chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(mockAnswer).then(res, rej);
      return chain;
    },
  },
}));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

// eslint-disable-next-line import/first
import { StackService } from '@/src/services/StackService';

beforeEach(() => { mockAsked.length = 0; mockAnswer = { error: null }; });

it('deletes that critique, and only if this member wrote it', async () => {
  await StackService.deleteStackComment('c-7', 'member-1');
  expect(mockAsked).toEqual([
    { table: 'list_comments', op: 'delete', filters: [['id', 'c-7'], ['user_id', 'member-1']] },
  ]);
});

it('throws when the house could not be reached, so the page puts it back', async () => {
  mockAnswer = { error: { message: 'Network request failed' } };
  await expect(StackService.deleteStackComment('c-7', 'member-1')).rejects.toEqual({ message: 'Network request failed' });
});
