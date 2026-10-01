/**
 * aMarkReadThatFailedIsHeard.test.ts — a member's marks, when one read fails.
 * ─────────────────────────────────────────────────────────────────────────────
 * The page asks three things at once: what this member certified, saved and
 * voted. supabase-js RESOLVES a failure as `{ error }`, and the three answers
 * were read for their data alone, so a failed one was a page of marks quietly
 * missing that nobody heard about. The reads that answered still count; the one
 * that failed is reported.
 */
import { useDispatch } from '../dispatch';
import type { Filing } from '../dispatchTypes';

const mockCaptured: { where?: string }[] = [];
const mockAnswer: Record<string, { data: unknown[] | null; error: { message: string; code?: string } | null }> = {};

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.in = () => Promise.resolve(mockAnswer[table]);
      return chain;
    },
  },
}));
jest.mock('../auth', () => ({
  useAuthStore: { getState: jest.fn().mockReturnValue({ user: { id: 'u1', username: 'me' } }) },
}));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: jest.fn(), flushOfflineQueue: jest.fn() }));
jest.mock('../../lib/sentry', () => ({
  captureError: (_e: unknown, ctx: { where?: string }) => { mockCaptured.push(ctx); },
}));

const filing = { id: 'f1' } as Filing;

beforeEach(() => {
  mockCaptured.length = 0;
  useDispatch.setState({ certifiedIds: new Set(), savedIds: new Set(), myVotes: {} } as never);
  mockAnswer.dispatch_certifications = { data: [{ post_id: 'f1' }], error: null };
  mockAnswer.dispatch_saves = { data: null, error: { message: 'permission denied for table dispatch_saves', code: '42501' } };
  mockAnswer.dispatch_votes = { data: [{ post_id: 'f1', option_index: 2 }], error: null };
});

it('keeps the marks that were read, and reports the read that failed', async () => {
  await useDispatch.getState().loadMarks([filing]);
  const st = useDispatch.getState();
  expect(st.certifiedIds.has('f1')).toBe(true);
  expect(st.myVotes.f1).toBe(2);
  expect(st.savedIds.has('f1')).toBe(false);
  expect(mockCaptured).toEqual([expect.objectContaining({ where: 'dispatch.viewerState' })]);
});

it('says nothing when every read answered', async () => {
  mockAnswer.dispatch_saves = { data: [], error: null };
  await useDispatch.getState().loadMarks([filing]);
  expect(mockCaptured).toEqual([]);
});
