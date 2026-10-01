/**
 * theSalonListIsWholeOrSaysSo.test.ts — the Lounge's list of salons, when one read fails.
 * ─────────────────────────────────────────────────────────────────────────────
 * The list is three reads merged: the newest salons, the ones joined, the ones
 * hosted. supabase-js RESOLVES a failure as `{ error }`, and the three were read
 * for their data alone, so a failed one drew a short list as the whole house — a
 * member's own salons missing, with nothing saying the read failed.
 */
import { useLoungeStore } from '../lounge';

const mockFailing = new Set<string>();

jest.mock('../../lib/supabase', () => {
  const room = (id: string) => ({ id, name: id, description: '', is_private: false, creator_id: 'u2', created_at: '2026-09-01T00:00:00Z', member_count: 2 });
  return {
    supabase: {
      from: (table: string) => {
        let which = table;
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.in = () => { if (table === 'lounges') which = 'joined'; return chain; };
        chain.eq = (k: string) => { if (table === 'lounges' && k === 'creator_id') which = 'hosted'; return chain; };
        chain.then = (res: (v: unknown) => unknown) => {
          if (table === 'lounges' && which === 'lounges') which = 'newest';
          const answers: Record<string, unknown> = {
            lounge_members: { data: [{ lounge_id: 'joined-1', last_read_at: null, status: 'active' }], error: null },
            newest: { data: [room('newest-1')], error: null },
            joined: { data: [room('joined-1')], error: null },
            hosted: { data: [], error: null },
          };
          const answer = mockFailing.has(which) ? { data: null, error: { message: 'Failed to fetch' } } : answers[which];
          return Promise.resolve(answer).then(res);
        };
        return chain;
      },
      rpc: () => Promise.resolve({ data: [], error: null }),
    },
  };
});
jest.mock('../auth', () => ({
  useAuthStore: { getState: jest.fn().mockReturnValue({ user: { id: 'u1', username: 'me' } }) },
}));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));

beforeEach(() => {
  mockFailing.clear();
  useLoungeStore.setState({ lounges: [], loungesFailed: false, loading: false } as never);
});

it('draws the whole list when every read answers', async () => {
  await useLoungeStore.getState().fetchLounges();
  expect(useLoungeStore.getState().lounges.map((l) => l.id).sort()).toEqual(['joined-1', 'newest-1']);
  expect(useLoungeStore.getState().loungesFailed).toBe(false);
});

it.each(['newest', 'joined', 'hosted'])('says the list could not be read when the %s salons fail', async (which) => {
  mockFailing.add(which);
  await useLoungeStore.getState().fetchLounges();
  expect(useLoungeStore.getState().loungesFailed).toBe(true);
  expect(useLoungeStore.getState().lounges).toEqual([]);
});
