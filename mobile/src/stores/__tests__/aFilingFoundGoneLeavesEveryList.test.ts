/**
 * aFilingFoundGoneLeavesEveryList.test.ts — stores/dispatch.ts: a filing the reader finds the house no
 * longer gives (withheld, withdrawn, its author blocking the member since) left the paper, and stayed
 * on every list holding its own copy (a member's room, a film's archive, a series), opened again and
 * again into "no longer here". It is marked gone, and every such list draws through
 * asTheHouseNowHolds, which also lays the member's own withdrawals and amendments over each copy. A
 * list's read asked after the mark that gives the filing again (a verdict overturned) takes the mark
 * away; one asked before it does not.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { asTheHouseNowHolds, goneMoment, useDispatch } from '../dispatch';
import { parseFilingRows } from '../dispatchTypes';

const AUTHOR = '55555555-5555-4555-8555-555555555555';
const POST = '00000000-0000-4000-9000-000000000001';
const OTHER = '00000000-0000-4000-9000-000000000002';
const profile = { id: AUTHOR, username: 'mara', avatar_url: null, member_no: 7, tier: 'auteur', role: null, is_founding: false };
const row = (id: string, title: string) => ({
  id, kind: 'take', user_id: AUTHOR, author_username: 'mara', title, body: 'Words.', is_published: true,
  certify_count: 0, comment_count: 0, created_at: '2026-08-28T21:00:00Z', profiles: profile,
});

let mockHouse = supabaseFake({ rows: { dispatch_posts: [], profiles: [profile], dispatch_certifications: [], dispatch_saves: [], dispatch_votes: [] } });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'kane' } }) } }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('../offlineQueueStore', () => ({ useOfflineQueueStore: { getState: () => ({ queued: [] }), setState: () => {}, subscribe: () => () => {} } }));
jest.mock('../../components/lobby/wallRead', () => ({ wallMayHaveChanged: () => {} }));
jest.mock('../../lib/sentry', () => ({ captureError: jest.fn() }));

/** A list's own copy of two filings, as a room reads them. */
const copy = parseFilingRows([row(POST, 'Gone soon'), row(OTHER, 'Stays')]).filings;

beforeEach(() => {
  mockHouse = supabaseFake({ rows: { dispatch_posts: [], profiles: [profile], dispatch_certifications: [], dispatch_saves: [], dispatch_votes: [] } });
  useDispatch.setState({ filings: [], opened: {}, acted: {}, gone: {} } as never);
});

it('a filing the reader finds gone leaves a list holding its own copy', async () => {
  expect(copy).toHaveLength(2);
  expect(asTheHouseNowHolds(copy, useDispatch.getState()).map((f) => f.id)).toEqual([POST, OTHER]);
  await useDispatch.getState().hydrate(POST);
  expect(asTheHouseNowHolds(copy, useDispatch.getState()).map((f) => f.id)).toEqual([OTHER]);
});

it('the member\'s own amendment is laid over a list\'s copy', () => {
  useDispatch.setState({ acted: { [OTHER]: { ...copy[1]!, title: 'Amended here' } } } as never);
  expect(asTheHouseNowHolds(copy, useDispatch.getState()).find((f) => f.id === OTHER)?.title).toBe('Amended here');
});

it('a list\'s read asked after the mark, giving the filing again, takes the mark away; one asked before does not', async () => {
  const before = goneMoment();
  await useDispatch.getState().hydrate(POST);
  useDispatch.getState().givenAgain([POST], before);
  expect(asTheHouseNowHolds(copy, useDispatch.getState()).map((f) => f.id)).toEqual([OTHER]);
  const after = goneMoment();
  useDispatch.getState().givenAgain([POST], after);
  expect(asTheHouseNowHolds(copy, useDispatch.getState()).map((f) => f.id)).toEqual([POST, OTHER]);
});

it('the reader finding it again (a verdict overturned) takes the mark away too', async () => {
  await useDispatch.getState().hydrate(POST);
  expect(useDispatch.getState().gone[POST]).toBeDefined();
  mockHouse.rows('dispatch_posts').push(row(POST, 'Given back'));
  await useDispatch.getState().hydrate(POST);
  expect(useDispatch.getState().gone[POST]).toBeUndefined();
});
