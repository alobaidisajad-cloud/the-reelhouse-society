/**
 * anOlderPaperReadIsNotLaidOver.test.ts — the paper's reads, each laid only while still the one asked.
 * ─────────────────────────────────────────────────────────────────────────────
 * Each of these reads answered with what the house held when it was ASKED, and laid it whenever it
 * LANDED: a filing read again (a notice, the reader's pull) whose older answer came last put back the
 * older filing; a ballot's count did the same; a read of the member's marks asked before they took a
 * certification back drew the heart again, as did a read of a critique's mark. Now each thing's read
 * is numbered (the latest asked wins), and the member's own act on a thing since a read was asked, or
 * waiting in the queue, outranks that read's answer about it (the acts ledger, markCounts). The house
 * is the shared fake, its answers held back and let go in the order each case needs.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useDispatch } from '../dispatch';
import { resetMarkCounts } from '../markCounts';

const ME = '33333333-3333-4333-8333-333333333333';
const AUTHOR = '55555555-5555-4555-8555-555555555555';
const POST = '00000000-0000-4000-9000-000000000001';
const CRITIQUE = '00000000-0000-4000-9000-0000000000c1';
const profile = { id: AUTHOR, username: 'mara', avatar_url: null, member_no: 7, tier: 'auteur', role: null, is_founding: false };
const post = (body: string) => ({
  id: POST, kind: 'take', user_id: AUTHOR, author_username: 'mara', body, is_published: true,
  certify_count: 4, comment_count: 1, created_at: '2026-08-28T21:00:00Z',
});
const critique = { id: CRITIQUE, post_id: POST, user_id: AUTHOR, author_username: 'mara', body: 'A critique.', certify_count: 0, created_at: '2026-08-28T22:00:00Z' };
const house = (over: { certified?: boolean; critiqueCertified?: boolean; tally?: () => unknown } = {}) => supabaseFake({
  rows: {
    dispatch_posts: [post('As first filed.')], profiles: [profile], dispatch_comments: [critique],
    dispatch_certifications: [
      ...(over.certified ? [{ id: '00000000-0000-4000-9000-0000000000a1', user_id: ME, post_id: POST }] : []),
      ...(over.critiqueCertified ? [{ id: '00000000-0000-4000-9000-0000000000a2', user_id: ME, comment_id: CRITIQUE }] : []),
    ],
    dispatch_saves: [], dispatch_votes: [],
  },
  rpc: { ballot_tally: () => (over.tally ? over.tally() : null) },
});

let mockHouse = house();
let mockQueue: { type: string; payload: Record<string, unknown> }[] = [];
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'kane' } }) } }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('../offlineQueueStore', () => ({ useOfflineQueueStore: { getState: () => ({ queued: mockQueue }) } }));
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: () => true, flushOfflineQueue: () => {} }));
jest.mock('../../services/KeptEdits', () => ({ keepFilingEdit: () => Promise.resolve('kept') }));
jest.mock('../../components/lobby/wallRead', () => ({ wallMayHaveChanged: () => {} }));
jest.mock('../../lib/sentry', () => ({ captureError: jest.fn() }));

const settle = async () => { for (let i = 0; i < 6; i += 1) await new Promise((res) => setTimeout(res, 0)); };
/** The answers held so far let go (a read is asked a moment after its call), oldest or newest first. */
const release = async (order: 'oldest' | 'newest' = 'oldest') => { await settle(); mockHouse.release(order); await settle(); };
const postsRow = () => mockHouse.rows('dispatch_posts')[0] as Record<string, unknown>;

beforeEach(() => {
  mockHouse = house();
  mockQueue = [];
  resetMarkCounts();
  useDispatch.setState({
    filings: [], opened: {}, acted: {}, certifiedIds: new Set(), savedIds: new Set(), myVotes: {}, tallies: {},
    marksKnown: { certified: new Set(), saved: new Set(), voted: new Set() },
    critiques: {}, critiquesLoading: {}, critiquesLoadingMore: {}, critiquesHasMore: {}, critiquesAfter: {}, critiquesOrder: {},
    certifiedCritiqueIds: new Set(), critiqueMarksKnown: new Set(),
  } as never);
});

it('of two reads of a filing, the older answering last is not laid over the newer', async () => {
  mockHouse.hold();
  const older = useDispatch.getState().hydrate(POST);
  await settle();
  postsRow().body = 'Amended on another phone.';
  const newer = useDispatch.getState().hydrate(POST);
  await release('newest');
  await Promise.all([older, newer]);
  expect(useDispatch.getState().opened[POST]?.body).toBe('Amended on another phone.');
});

it('a filing read asked before the member amends it does not put the old words back', async () => {
  await useDispatch.getState().hydrate(POST);
  mockHouse.hold();
  const read = useDispatch.getState().hydrate(POST);
  await settle();
  await useDispatch.getState().amend(POST, { body: 'Amended here.' });
  await release();
  await read;
  expect(useDispatch.getState().opened[POST]?.body).toBe('Amended here.');
});

it('of two reads of a ballot’s count, the older answering last is not laid over the newer', async () => {
  let tally: unknown = { total: 1, counts: { 0: 1 } };
  mockHouse = house({ tally: () => tally });
  mockHouse.hold();
  const older = useDispatch.getState().readTally(POST);
  await settle();
  tally = { total: 2, counts: { 0: 1, 1: 1 } };
  const newer = useDispatch.getState().readTally(POST);
  await release('newest');
  await Promise.all([older, newer]);
  expect(useDispatch.getState().tallies[POST]).toEqual({ total: 2, counts: { 0: 1, 1: 1 } });
});

it('a read of the member’s marks asked before they take a certification back does not draw the heart again', async () => {
  mockHouse = house({ certified: true });
  await useDispatch.getState().hydrate(POST);
  await settle();
  expect(useDispatch.getState().certifiedIds.has(POST)).toBe(true);

  mockHouse.hold();
  const read = useDispatch.getState().loadMarks([useDispatch.getState().opened[POST]!]);
  await settle();
  useDispatch.getState().certify(POST, false);
  await release();
  await read;
  await settle();
  expect(useDispatch.getState().certifiedIds.has(POST)).toBe(false);
});

it('a mark the house no longer holds, with no act of the member’s since, is read as off', async () => {
  useDispatch.setState({ certifiedIds: new Set([POST]) } as never);
  await useDispatch.getState().hydrate(POST);
  await settle();
  expect(useDispatch.getState().certifiedIds.has(POST)).toBe(false);
});

it('a certification taken back and waiting in the queue is not undone by a read the house answers before it', async () => {
  mockHouse = house({ certified: true });
  mockQueue = [{ type: 'certify_filing', payload: { post_id: POST, desired_state: false } }];
  await useDispatch.getState().hydrate(POST);
  await settle();
  expect(useDispatch.getState().certifiedIds.has(POST)).toBe(false);
});

it('a critique’s mark read before the member takes its certification back does not draw the heart again', async () => {
  mockHouse = house({ critiqueCertified: true });
  useDispatch.setState({ certifiedCritiqueIds: new Set([CRITIQUE]), critiqueMarksKnown: new Set([CRITIQUE]) } as never);
  const read = useDispatch.getState().fetchCritiques(POST, 'NEWEST');
  // The page answers at once; the read of its marks, asked as it lands, is held.
  await Promise.resolve();
  mockHouse.hold();
  await settle();
  expect([mockHouse.held(), mockHouse.asked[mockHouse.asked.length - 1]?.table]).toEqual([1, 'dispatch_certifications']);
  expect(useDispatch.getState().critiques[POST]?.map((c) => c.id)).toEqual([CRITIQUE]);
  useDispatch.getState().certifyCritique(CRITIQUE, POST, false);
  await release();
  await read;
  await settle();
  expect(useDispatch.getState().certifiedCritiqueIds.has(CRITIQUE)).toBe(false);
});
