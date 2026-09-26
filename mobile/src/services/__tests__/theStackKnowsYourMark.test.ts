/**
 * The stack's page asks whether THIS member certified it.
 * ─────────────────────────────────────────────────────────────────────────────
 * The heart on a stack's page came from the index filled at sign-in with the
 * member's newest 500 certifications — an older one drew empty, and tapping it
 * certified the stack a second time. The page's payload now carries the
 * server's answer (`certified`), asked beside the page's other requests.
 */
const mockAsked: { table: string; filters: [string, unknown][] }[] = [];
let mockMine: { count: number | null; error: unknown } = { count: 1, error: null };
let mockUser: { id: string } | null = { id: 'member-1' };

jest.mock('@/src/stores/auth', () => ({
  useAuthStore: { getState: () => ({ user: mockUser }) },
}));
jest.mock('@/src/lib/supabase', () => {
  const chainFor = (table: string) => {
    const asked = { table, filters: [] as [string, unknown][] };
    mockAsked.push(asked);
    const chain: Record<string, unknown> = {};
    for (const k of ['select', 'order', 'limit']) chain[k] = () => chain;
    chain.eq = (c: string, v: unknown) => { asked.filters.push([c, v]); return chain; };
    chain.maybeSingle = () => Promise.resolve({ data: { id: 's1', title: 'Noir', description: '', user_id: 'u1', is_private: false, is_ranked: false, created_at: '2026-01-01', profiles: { username: 'ana' } }, error: null });
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve(
      table === 'interactions' ? mockMine : { data: [], count: 0, error: null },
    ).then(res);
    return chain;
  };
  return { supabase: { from: chainFor, rpc: () => Promise.resolve({ data: 3, error: null }) } };
});
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

// eslint-disable-next-line import/first
import { StackService } from '@/src/services/StackService';

beforeEach(() => { mockAsked.length = 0; mockMine = { count: 1, error: null }; mockUser = { id: 'member-1' }; });

it('asks about this member, this stack, and certifications only', async () => {
  const payload = await StackService.getStackFullPayload('s1');
  expect(payload.certified).toBe(true);
  const q = mockAsked.find((a) => a.table === 'interactions');
  expect(q?.filters).toEqual([['user_id', 'member-1'], ['target_list_id', 's1'], ['type', 'endorse_list']]);
});

it('says false when the member has not certified it', async () => {
  mockMine = { count: 0, error: null };
  expect((await StackService.getStackFullPayload('s1')).certified).toBe(false);
});

it('says nothing — never false — when the question failed', async () => {
  mockMine = { count: null, error: { message: 'timeout' } };
  expect((await StackService.getStackFullPayload('s1')).certified).toBeNull();
});

it('does not ask at all for a visitor', async () => {
  mockUser = null;
  const payload = await StackService.getStackFullPayload('s1');
  expect(payload.certified).toBeNull();
  expect(mockAsked.some((a) => a.table === 'interactions')).toBe(false);
});
