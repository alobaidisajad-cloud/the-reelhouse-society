/**
 * theSalonListIsWholeOrSaysSo.test.ts — the Lounge's list of salons, when its read fails.
 * ─────────────────────────────────────────────────────────────────────────────
 * The list was three reads merged: the newest salons, the ones joined, the ones
 * hosted. supabase-js RESOLVES a failure as `{ error }`, and the three were read
 * for their data alone, so a failed one drew a short list as the whole house — a
 * member's own salons missing, with nothing saying the read failed. They are one
 * call now (get_lounge_list, P4.53): it fails whole, and an answer missing any
 * of its pieces is a read that failed, never a short list.
 */
import { useLoungeStore } from '../lounge';

const room = (id: string) => ({ id, name: id, description: '', is_private: false, creator_id: 'u2', created_at: '2026-09-01T00:00:00Z', member_count: 2, cover_image: null });
const WHOLE = {
  memberships: [{ lounge_id: 'joined-1', last_read_at: null, status: 'approved' }],
  newest: [room('newest-1')], hosted: [], joined: [room('joined-1')],
  unread: [], pending: [], faces: [], last_words: [],
};
let mockAnswer: { data: unknown; error: unknown } = { data: WHOLE, error: null };

jest.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (fn: string) => Promise.resolve(fn === 'get_lounge_list' ? mockAnswer : { data: null, error: { message: `no ${fn}` } }),
  },
}));
jest.mock('../auth', () => ({
  useAuthStore: { getState: jest.fn().mockReturnValue({ user: { id: 'u1', username: 'me' } }) },
}));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));

beforeEach(() => {
  mockAnswer = { data: WHOLE, error: null };
  useLoungeStore.setState({ lounges: [], loungesFailed: false, loungesLoading: false } as never);
});

it('draws the whole list when the corridor answers', async () => {
  await useLoungeStore.getState().fetchLounges();
  expect(useLoungeStore.getState().lounges.map((l) => l.id).sort()).toEqual(['joined-1', 'newest-1']);
  expect(useLoungeStore.getState().loungesFailed).toBe(false);
});

it('says the list could not be read when the corridor fails', async () => {
  mockAnswer = { data: null, error: { message: 'Failed to fetch' } };
  await useLoungeStore.getState().fetchLounges();
  expect(useLoungeStore.getState().loungesFailed).toBe(true);
  expect(useLoungeStore.getState().lounges).toEqual([]);
});

it.each(['memberships', 'newest', 'hosted', 'joined', 'unread', 'pending', 'faces', 'last_words'])(
  'says the list could not be read when the answer has no %s list, never a short list',
  async (piece) => {
    mockAnswer = { data: { ...WHOLE, [piece]: null }, error: null };
    await useLoungeStore.getState().fetchLounges();
    expect(useLoungeStore.getState().loungesFailed).toBe(true);
    expect(useLoungeStore.getState().lounges).toEqual([]);
  },
);

it('says the list could not be read when the answer is not the corridor at all', async () => {
  mockAnswer = { data: [WHOLE], error: null };
  await useLoungeStore.getState().fetchLounges();
  expect(useLoungeStore.getState().loungesFailed).toBe(true);
});
