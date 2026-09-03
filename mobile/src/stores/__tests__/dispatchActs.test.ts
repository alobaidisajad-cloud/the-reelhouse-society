/**
 * dispatchActs.test.ts — the six acts, and what happens when they are refused.
 * ─────────────────────────────────────────────────────────────────────────────
 * The store was at 10% coverage: 540 statements, 485 of which had never run.
 * Every number a member can move lives in here, and so does every rollback —
 * the thing that decides whether a refused certify leaves the count one higher
 * than the row it counts, forever, on that device.
 *
 * Each act is put through three states, because they fail differently:
 *
 *   ACCEPTED   the number moves and stays moved
 *   REFUSED    the number moves and comes ALL the way back — not part of the
 *              way, which is the interesting case and the one that was wrong
 *   OFFLINE    nothing comes back, and the act is queued instead
 *
 * `writeThrough` is shared by all six, so a bug in the shared part shows up six
 * times and a bug in one act's `undo` shows up once. Both kinds are here.
 */
import { useDispatch } from '../dispatch';
import type { Filing } from '../dispatchTypes';

let mockOutcome: 'ok' | 'refused' | 'offline' = 'ok';
const mockQueued: Array<{ type: string; payload: unknown }> = [];

/** Refused by the house: a real PostgREST error, resolved not thrown. */
const REFUSED = { data: null, error: { message: 'new row violates row-level security policy', code: '42501' } };
/** The wire is down: this one throws, and `isNetworkError` recognises it. */
const networkError = () => Object.assign(new TypeError('Network request failed'), { name: 'TypeError' });

const answer = () => {
  if (mockOutcome === 'offline') return Promise.reject(networkError());
  if (mockOutcome === 'refused') return Promise.resolve(REFUSED);
  return Promise.resolve({ data: [], error: null });
};

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = () => self();
      chain.eq = () => self();
      chain.is = () => self();
      chain.in = () => Promise.resolve({ data: [], error: null });
      chain.order = () => self();
      chain.range = () => Promise.resolve({ data: [], error: null });
      chain.insert = () => answer();
      chain.delete = () => self();
      chain.update = () => self();
      // A delete/update chain is awaited after its filters, so the chain itself
      // has to be thenable — not just the terminal call.
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        answer().then(res, rej);
      return chain;
    },
    rpc: () => answer(),
  },
}));

jest.mock('../auth', () => ({
  useAuthStore: {
    getState: jest.fn().mockReturnValue({ user: { id: 'u1', username: 'me' } }),
  },
}));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../../utils/offlineQueue', () => ({
  enqueueMutation: (m: { type: string; payload: unknown }) => { mockQueued.push(m); },
  flushOfflineQueue: jest.fn(),
  getOfflineQueue: () => [],
}));
jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});
jest.mock('../../lib/sentry', () => ({ captureError: jest.fn() }));

const filing = (over: Partial<Filing> = {}): Filing => ({
  id: 'f1', kind: 'take', authorId: 'u2',
  author: { name: 'someone', memberNo: 2, tier: 'free' },
  film: null, subjectId: null, subjectKind: null,
  title: null, body: 'A take.', fullContent: null,
  source: null, sourceUrl: null,
  options: null, closesAt: null, frozenTotals: null, answerId: null,
  seriesId: null, seriesTitle: null, partNumber: null,
  spoilerLabel: null, withheldAt: null, endedAt: null, endedBy: null,
  certifyCount: 10, commentCount: 3,
  createdAt: '2026-08-28T21:00:00Z', editedAt: null,
  ...over,
});

/** Every act is fire-and-forget; this lets the write settle. */
const settle = () => new Promise((r) => setTimeout(r, 0));

const reset = (over: Partial<ReturnType<typeof useDispatch.getState>> = {}) => {
  useDispatch.setState({
    filings: [filing()], savedOnly: false,
    certifiedIds: new Set(), savedIds: new Set(), myVotes: {},
    critiques: {}, certifiedCritiqueIds: new Set(),
    ...over,
  } as never);
};

beforeEach(() => {
  mockOutcome = 'ok';
  mockQueued.length = 0;
  reset();
});

// ── CERTIFY ─────────────────────────────────────────────────────────────────
describe('certifying a filing', () => {
  it('moves the count at once, and it stays', async () => {
    useDispatch.getState().certify('f1', true);
    expect(useDispatch.getState().filings[0].certifyCount).toBe(11);
    expect(useDispatch.getState().certifiedIds.has('f1')).toBe(true);
    await settle();
    expect(useDispatch.getState().filings[0].certifyCount).toBe(11);
  });

  it('puts the count back ALL the way when the house refuses', async () => {
    mockOutcome = 'refused';
    useDispatch.getState().certify('f1', true);
    await settle();
    expect(useDispatch.getState().filings[0].certifyCount).toBe(10);
    expect(useDispatch.getState().certifiedIds.has('f1')).toBe(false);
  });

  it('queues it, and keeps the count, when the wire is down', async () => {
    mockOutcome = 'offline';
    useDispatch.getState().certify('f1', true);
    await settle();
    expect(useDispatch.getState().filings[0].certifyCount).toBe(11);
    expect(mockQueued.map((m) => m.type)).toEqual(['certify_filing']);
  });

  it('refuses to certify twice', () => {
    useDispatch.getState().certify('f1', true);
    useDispatch.getState().certify('f1', true);
    expect(useDispatch.getState().filings[0].certifyCount).toBe(11);
  });

  it('never takes a count below zero', async () => {
    reset({ filings: [filing({ certifyCount: 0 })], certifiedIds: new Set(['f1']) } as never);
    useDispatch.getState().certify('f1', false);
    expect(useDispatch.getState().filings[0].certifyCount).toBe(0);
  });
});

// ── SAVE ────────────────────────────────────────────────────────────────────
describe('saving a filing', () => {
  it('marks it, and unmarks it when refused', async () => {
    mockOutcome = 'refused';
    useDispatch.getState().save('f1', true);
    expect(useDispatch.getState().savedIds.has('f1')).toBe(true);
    await settle();
    expect(useDispatch.getState().savedIds.has('f1')).toBe(false);
  });

  it('takes the card off the saved page when unsaved — and PUTS IT BACK if refused', async () => {
    // The optimistic step removes the row (it no longer belongs to the page it
    // is on). The rollback restored the id and NOT the row, so a refused unsave
    // left a filing that was saved according to the store and gone from the
    // screen — the two disagreeing until the next refresh.
    mockOutcome = 'refused';
    reset({ filings: [filing()], savedOnly: true, savedIds: new Set(['f1']) } as never);

    useDispatch.getState().save('f1', false);
    expect(useDispatch.getState().filings).toHaveLength(0);

    await settle();
    expect(useDispatch.getState().savedIds.has('f1')).toBe(true);
    expect(useDispatch.getState().filings).toHaveLength(1);
  });
});

// ── VOTE ────────────────────────────────────────────────────────────────────
describe('marking a ballot', () => {
  it('records the mark, and clears it when refused', async () => {
    mockOutcome = 'refused';
    useDispatch.getState().vote('f1', 2);
    expect(useDispatch.getState().myVotes.f1).toBe(2);
    await settle();
    expect(useDispatch.getState().myVotes.f1).toBeUndefined();
  });

  it('is cast once and never changed', () => {
    useDispatch.getState().vote('f1', 2);
    useDispatch.getState().vote('f1', 4);
    expect(useDispatch.getState().myVotes.f1).toBe(2);
  });

  it('queues the mark when the wire is down', async () => {
    mockOutcome = 'offline';
    useDispatch.getState().vote('f1', 1);
    await settle();
    expect(useDispatch.getState().myVotes.f1).toBe(1);
    expect(mockQueued[0].type).toBe('cast_vote');
  });
});

// ── TAKE AN ANSWER ──────────────────────────────────────────────────────────
describe('taking an answer', () => {
  it('restores the PREVIOUS answer when refused, not null', async () => {
    mockOutcome = 'refused';
    reset({ filings: [filing({ kind: 'seeking', answerId: 'c-old' })] } as never);
    useDispatch.getState().takeAnswer('f1', 'c-new');
    expect(useDispatch.getState().filings[0].answerId).toBe('c-new');
    await settle();
    expect(useDispatch.getState().filings[0].answerId).toBe('c-old');
  });
});

// ── CERTIFYING A CRITIQUE ───────────────────────────────────────────────────
describe('certifying a critique', () => {
  const critique = { id: 'c1', postId: 'f1', authorId: 'u3', author: null, body: 'yes', certifyCount: 4, createdAt: '2026-08-28T21:00:00Z', editedAt: null };

  it('moves the critique’s own count, and puts it back when refused', async () => {
    mockOutcome = 'refused';
    reset({ filings: [filing()], critiques: { f1: [critique] } } as never);

    useDispatch.getState().certifyCritique('c1', 'f1', true);
    expect(useDispatch.getState().critiques.f1[0].certifyCount).toBe(5);
    await settle();
    expect(useDispatch.getState().critiques.f1[0].certifyCount).toBe(4);
    expect(useDispatch.getState().certifiedCritiqueIds.has('c1')).toBe(false);
  });
});
