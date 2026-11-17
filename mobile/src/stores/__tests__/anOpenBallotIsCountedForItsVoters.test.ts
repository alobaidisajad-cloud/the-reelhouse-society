/**
 * anOpenBallotIsCountedForItsVoters.test.ts — review round 11
 * ─────────────────────────────────────────────────────────────────────────────
 * A member marked an open ballot and read "0 BALLOTS CAST" under their own mark: the ballot's
 * numbers came only from the count frozen at its close. The house now gives a member who has
 * voted the running count (ballot_tally, in frozen_totals' shape); the store reads it once the
 * vote lands, and when a ballot the member voted in is opened. A count the house does not give
 * stays unknown, never a 0.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useDispatch } from '../dispatch';

const ME = '33333333-3333-4333-8333-333333333333';
const AUTHOR = '55555555-5555-4555-8555-555555555555';
const BALLOT = '00000000-0000-4000-9000-000000000001';
const COUNT = { total: 3, counts: { 0: 1, 1: 2 } };

const ballot = {
  id: BALLOT, kind: 'ballot', user_id: AUTHOR, author_username: 'mara', title: 'Which Ozu?', body: 'Which Ozu?',
  options: [{ film_id: 18148, title: 'Tokyo Story' }, { film_id: 20532, title: 'Late Spring' }], closes_at: '2099-01-01T00:00:00Z',
  is_published: true, certify_count: 0, comment_count: 0, created_at: '2026-11-15T10:00:00Z',
};
const profile = { id: AUTHOR, username: 'mara', avatar_url: null, member_no: 7, tier: 'auteur', role: null, is_founding: false };
/** Each ask of the count, by the ballot asked about. */
const mockAsked: unknown[] = [];
const house = (votes: Record<string, unknown>[], tally: unknown) => supabaseFake({
  rows: { dispatch_posts: [ballot], profiles: [profile], dispatch_certifications: [], dispatch_saves: [], dispatch_votes: votes },
  rpc: { ballot_tally: (args: { p_post: string }) => { mockAsked.push(args.p_post); return tally; } },
});

let mockHouse = house([], null);
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'kane' } }) } }));
jest.mock('@/src/stores/blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((res) => setTimeout(res, 0)); };
beforeEach(() => {
  mockAsked.length = 0;
  useDispatch.setState({ filings: [], opened: {}, myVotes: {}, tallies: {}, marksKnown: { certified: new Set(), saved: new Set(), voted: new Set() } } as never);
});

it('a vote that lands reads the running count, with the member’s own ballot in it', async () => {
  mockHouse = house([], COUNT);
  useDispatch.getState().vote(BALLOT, 1);
  await settle();
  expect(useDispatch.getState().tallies[BALLOT]).toEqual({ total: 3, counts: { 0: 1, 1: 2 } });
  expect(mockAsked).toEqual([BALLOT]);
});

it('a ballot opened that the member voted in reads its count', async () => {
  mockHouse = house([{ id: '88888888-8888-4888-8888-888888888888', post_id: BALLOT, user_id: ME, option_index: 1 }], COUNT);
  await useDispatch.getState().hydrate(BALLOT);
  await settle();
  expect(useDispatch.getState().myVotes[BALLOT]).toBe(1);
  expect(useDispatch.getState().tallies[BALLOT]).toEqual({ total: 3, counts: { 0: 1, 1: 2 } });
});

it('a ballot opened that the member has not voted in asks for no count', async () => {
  mockHouse = house([], COUNT);
  await useDispatch.getState().hydrate(BALLOT);
  await settle();
  expect(mockAsked).toEqual([]);
  expect(useDispatch.getState().tallies[BALLOT]).toBeUndefined();
});

it('a count the house does not give stays unknown, never a 0', async () => {
  mockHouse = house([], null);
  useDispatch.getState().vote(BALLOT, 0);
  await settle();
  expect(useDispatch.getState().tallies[BALLOT]).toBeUndefined();
});
