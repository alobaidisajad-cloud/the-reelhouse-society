/**
 * aFilingAnswerIsLaidInItsTurn.test.ts — the Dispatch never lays an older answer over a newer state.
 * ─────────────────────────────────────────────────────────────────────────────
 * Each read here is asked twice, or under an act, and the answers are let go in the order that went
 * wrong: the older last. A filing read again on opening landed its first answer over the second, and
 * over the member's own END; a ballot's running count went back to an earlier one; a filing's critiques
 * read again were replaced by the older list, and a next page asked of the old list was laid on the
 * new; a certification taken back while the marks were read was drawn made again.
 */
import { heldClient } from '@/test-utils/heldClient';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useDispatch } from '../dispatch';

const ME = '33333333-3333-4333-8333-333333333333';
const AUTHOR = '55555555-5555-4555-8555-555555555555';
const TAKE = '00000000-0000-4000-9000-000000000001';
const BALLOT = '00000000-0000-4000-9000-000000000002';
const C1 = '00000000-0000-4000-9000-0000000000c1';
const C2 = '00000000-0000-4000-9000-0000000000c2';
const C0 = '00000000-0000-4000-9000-0000000000c0';

const take = {
  id: TAKE, kind: 'take', user_id: AUTHOR, author_username: 'mara', title: null, body: 'The first words.',
  is_published: true, certify_count: 1, comment_count: 1, created_at: '2026-11-15T10:00:00Z',
};
const ballot = {
  id: BALLOT, kind: 'ballot', user_id: AUTHOR, author_username: 'mara', title: 'Which Ozu?', body: 'Which Ozu?',
  options: [{ film_id: 18148, title: 'Tokyo Story' }, { film_id: 20532, title: 'Late Spring' }], closes_at: '2099-01-01T00:00:00Z',
  is_published: true, certify_count: 0, comment_count: 0, created_at: '2026-11-15T10:00:00Z',
};
const profile = { id: AUTHOR, username: 'mara', avatar_url: null, member_no: 7, tier: 'auteur', role: null, is_founding: false };
const critique = (id: string, at: string) => ({
  id, post_id: TAKE, user_id: AUTHOR, author_username: 'mara', body: `Critique ${id.slice(-2)}.`, certify_count: 0, created_at: at,
});

/** The running count the house gives, as it stands when asked. */
let mockTally = 1;
const fresh = () => supabaseFake({
  rows: {
    dispatch_posts: [{ ...take }, { ...ballot }], profiles: [profile],
    dispatch_comments: [critique(C1, '2026-11-15T11:00:00Z')],
    dispatch_certifications: [{ id: '88888888-8888-4888-8888-888888888881', post_id: TAKE, user_id: ME }],
    dispatch_saves: [], dispatch_votes: [],
  },
  rpc: { ballot_tally: () => ({ total: mockTally, counts: { 0: mockTally } }), end_filing: () => null },
});
let mockHouse = fresh();
let mockHeld = heldClient(mockHouse.client, { rpcs: ['ballot_tally'] });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHeld.client; } }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'kane' } }) } }));
jest.mock('@/src/stores/blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

const row = (table: string, id: string) => mockHouse.rows(table).find((r) => r.id === id) as Record<string, unknown>;
const opened = () => useDispatch.getState().opened[TAKE];
/** Until the read just asked has been worked out by the house (the house as it stood when asked). */
const asked = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

beforeEach(() => {
  mockTally = 1;
  mockHouse = fresh();
  mockHeld = heldClient(mockHouse.client, { rpcs: ['ballot_tally'] });
  useDispatch.setState({
    filings: [], opened: {}, myVotes: {}, tallies: {}, certifiedIds: new Set(), savedIds: new Set(),
    marksKnown: { certified: new Set(), saved: new Set(), voted: new Set() },
    critiques: {}, critiquesOrder: {}, critiquesLoading: {}, critiquesLoadingMore: {}, critiquesHasMore: {},
    critiquesRead: {}, critiquesFailed: {}, certifiedCritiqueIds: new Set(), critiqueMarksKnown: new Set(),
  } as never);
});

describe('a filing read again', () => {
  it('lays the newer read when the older lands last, and answers the older call with it', async () => {
    const first = useDispatch.getState().hydrate(TAKE);
    await asked();
    row('dispatch_posts', TAKE).body = 'The words as amended.';
    const second = useDispatch.getState().hydrate(TAKE);
    await mockHeld.release('dispatch_posts', 1);
    await mockHeld.release('dispatch_posts', 0);
    await mockHeld.releaseAll();
    expect(opened()?.body).toBe('The words as amended.');
    expect(((await first) as { body: string }).body).toBe('The words as amended.');
    expect(((await second) as { body: string }).body).toBe('The words as amended.');
  });

  it('lays nothing over the member\'s own END made while it was out, and reads it again after', async () => {
    useDispatch.setState({ opened: { [TAKE]: { id: TAKE, kind: 'take', authorId: ME, body: 'The first words.' } } } as never);
    const read = useDispatch.getState().hydrate(TAKE);
    void useDispatch.getState().end(TAKE);
    expect(opened()?.endedAt).toBeTruthy();
    row('dispatch_posts', TAKE).body = '';
    row('dispatch_posts', TAKE).ended_at = '2026-11-15T12:00:00Z';
    await mockHeld.release('dispatch_posts', 0);
    // The read asked before the END lands nowhere: the filing stays ended.
    expect(opened()?.endedAt).toBeTruthy();
    expect(opened()?.body).toBe('');
    await mockHeld.releaseAll();
    expect(((await read) as { endedAt: string | null }).endedAt).toBeTruthy();
    expect(opened()?.endedAt).toBeTruthy();
  });
});

it('a ballot\'s running count asked earlier never lands over one asked later', async () => {
  void useDispatch.getState().readTally(BALLOT);
  await asked();
  mockTally = 2;
  void useDispatch.getState().readTally(BALLOT);
  await mockHeld.release('ballot_tally', 1);
  await mockHeld.release('ballot_tally', 0);
  expect(useDispatch.getState().tallies[BALLOT]?.total).toBe(2);
});

describe('a filing\'s critiques', () => {
  it('read again keep the newer list when the older lands last', async () => {
    void useDispatch.getState().fetchCritiques(TAKE, 'NEWEST');
    await asked();
    mockHouse.rows('dispatch_comments').push(critique(C2, '2026-11-15T12:00:00Z'));
    void useDispatch.getState().fetchCritiques(TAKE, 'NEWEST');
    await mockHeld.release('dispatch_comments', 1);
    await mockHeld.release('dispatch_comments', 0);
    await mockHeld.releaseAll();
    expect(useDispatch.getState().critiques[TAKE]?.map((c) => c.id)).toEqual([C2, C1]);
    expect(useDispatch.getState().critiquesLoading[TAKE]).toBe(false);
  });

  it('a next page asked of the list before it was read again is not laid on the new one', async () => {
    useDispatch.setState({
      critiques: { [TAKE]: [{ id: C1, postId: TAKE }] }, critiquesOrder: { [TAKE]: 'NEWEST' },
      critiquesHasMore: { [TAKE]: true }, critiquesNext: { [TAKE]: { order: 'NEWEST', after: { at: '2026-11-15T11:00:00Z', id: C1 } } },
    } as never);
    mockHouse.rows('dispatch_comments').push(critique(C0, '2026-11-15T10:30:00Z'));
    void useDispatch.getState().loadMoreCritiques(TAKE);
    await asked();
    mockHouse.rows('dispatch_comments').push(critique(C2, '2026-11-15T12:00:00Z'));
    void useDispatch.getState().fetchCritiques(TAKE, 'NEWEST');
    await mockHeld.release('dispatch_comments', 1);
    await mockHeld.release('dispatch_comments', 0);
    await mockHeld.releaseAll();
    // The list read again is the three, read whole; the old next page (C0, from the old list's row 1)
    // laid on it would stand under the new list's cursor.
    expect(useDispatch.getState().critiques[TAKE]?.map((c) => c.id)).toEqual([C2, C1, C0]);
    expect(useDispatch.getState().critiquesNext[TAKE]).toEqual({ order: 'NEWEST', after: { at: '2026-11-15T10:30:00Z', id: C0 } });
    expect(useDispatch.getState().critiquesLoadingMore[TAKE]).toBe(false);
  });
});

it('a certification taken back while the member\'s marks were read stays taken back', async () => {
  useDispatch.setState({ filings: [{ id: TAKE, kind: 'take', certifyCount: 1 }], certifiedIds: new Set([TAKE]) } as never);
  void useDispatch.getState().loadMarks([{ id: TAKE } as never]);
  useDispatch.getState().certify(TAKE, false);
  expect(useDispatch.getState().certifiedIds.has(TAKE)).toBe(false);
  await mockHeld.release('dispatch_certifications', 0);
  expect(useDispatch.getState().certifiedIds.has(TAKE)).toBe(false);
  await mockHeld.releaseAll();
  expect(useDispatch.getState().certifiedIds.has(TAKE)).toBe(false);
});
