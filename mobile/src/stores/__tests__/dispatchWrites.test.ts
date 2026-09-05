/**
 * dispatchWrites.test.ts — filing, amending, ending, and the critiques.
 * ─────────────────────────────────────────────────────────────────────────────
 * The other half of the store's dark: `file`, `amend`, `end`, `addCritique`,
 * `amendCritique`, `removeCritique`, and the cleaning every one of them goes
 * through. These are the paths where a member's words reach the database, so
 * "nothing has ever run this" is the least acceptable place for it to be true.
 *
 * Three things are asserted about each: what the member SEES immediately, what
 * is SENT, and what happens when the house refuses — because the optimistic
 * update and the rollback are two halves of one decision and only the first
 * half is visible while things are going well.
 */
import { useDispatch } from '../dispatch';
import type { Filing } from '../dispatchTypes';
import { MAX_LENGTHS } from '../../utils/sanitizeInput';

/**
 * `silent` is the third way a write fails, and the only one that looks like a
 * success: RLS refusing a ROW is not an error — PostgREST answers 200 with an
 * empty array. That is the whole reason these updates ask for `.select('id')`.
 */
let mockOutcome: 'ok' | 'refused' | 'offline' | 'silent' = 'ok';
const mockSent: Array<{ table: string; op: string; row: unknown }> = [];
const mockQueued: Array<{ type: string; payload: Record<string, unknown> }> = [];
const mockRpc: Array<{ fn: string; args: unknown }> = [];

const REFUSED = { data: null, error: { message: 'refused', code: '42501' } };
const networkError = () => Object.assign(new TypeError('Network request failed'), { name: 'TypeError' });
const answer = () => {
  if (mockOutcome === 'offline') return Promise.reject(networkError());
  if (mockOutcome === 'refused') return Promise.resolve(REFUSED);
  return Promise.resolve({ data: [], error: null });
};

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      /** Set by `update`, so `then` can answer with a row rather than nothing. */
      let updated = false;
      chain.select = () => self();
      chain.eq = () => self();
      chain.is = () => self();
      chain.order = () => self();
      chain.in = () => Promise.resolve({ data: [], error: null });
      chain.range = () => { const r = Promise.resolve({ data: [], error: null }); return Object.assign(r, { abortSignal: () => r }); };
      chain.limit = () => { const r = Promise.resolve({ data: [], error: null }); return Object.assign(r, { abortSignal: () => r }); };
      chain.insert = (rows: unknown[]) => {
        mockSent.push({ table, op: 'insert', row: rows[0] });
        return answer();
      };
      /**
       * An UPDATE now asks for its rows back — `.select('id')` — because a row
       * RLS refuses matches nothing and that is not an error. So the mock has
       * to answer the way PostgREST does: a row when the write lands, an empty
       * array when it does not.
       *
       * Without this the mock returns `[]` for everything and every amendment
       * looks refused, which is what the first run of this change reported.
       */
      chain.update = (row: unknown) => {
        mockSent.push({ table, op: 'update', row });
        updated = true;
        return self();
      };
      chain.delete = () => { mockSent.push({ table, op: 'delete', row: null }); return self(); };
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        answer()
          .then((r: { data: unknown; error: unknown }) =>
            // A landed UPDATE returns the row it changed; a refusal returns
            // none. `answer()` decides which by the test's `mockOutcome`.
            // `silent` is the refusal that answers like a success, so it must
            // NOT be handed the row back — that substitution is what makes an
            // accepted update distinguishable from a refused one at all.
            (updated && !r.error && mockOutcome !== 'silent'
              ? { data: [{ id: 'row' }], error: null }
              : r))
          .then(res, rej);
      return chain;
    },
    rpc: (fn: string, args: unknown) => { mockRpc.push({ fn, args }); return answer(); },
  },
}));

jest.mock('../auth', () => ({
  useAuthStore: {
    getState: jest.fn().mockReturnValue({ user: { id: 'u1', username: 'me' } }),
  },
}));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../../utils/offlineQueue', () => ({
  enqueueMutation: (m: { type: string; payload: Record<string, unknown> }) => { mockQueued.push(m); },
  flushOfflineQueue: jest.fn(),
  getOfflineQueue: () => [],
}));
jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});
jest.mock('../../lib/sentry', () => ({ captureError: jest.fn() }));

const filing = (over: Partial<Filing> = {}): Filing => ({
  id: 'f1', kind: 'take', authorId: 'u1',
  author: { name: 'me', memberNo: 1, tier: 'free' },
  film: null, subjectId: null, subjectKind: null,
  title: null, body: 'A take.', fullContent: null,
  source: null, sourceUrl: null,
  options: null, closesAt: null, frozenTotals: null, answerId: null,
  seriesId: null, seriesTitle: null, partNumber: null,
  spoilerLabel: null, withheldAt: null, endedAt: null, endedBy: null,
  certifyCount: 4, commentCount: 2,
  createdAt: '2026-08-28T21:00:00Z', editedAt: null,
  ...over,
});

const reset = (over: Record<string, unknown> = {}) => {
  useDispatch.setState({
    filings: [filing()], opened: {}, section: 'ALL', sort: 'LATEST', savedOnly: false,
    loading: false, loadingMore: false, hasMore: false, newCount: 0, droppedRows: 0,
    certifiedIds: new Set(), savedIds: new Set(), myVotes: {},
    critiques: {}, critiquesLoading: {}, critiquesLoadingMore: {},
    critiquesHasMore: {}, critiquesOrder: {}, certifiedCritiqueIds: new Set(),
    ...over,
  } as never);
};

const sentTo = (table: string, op: string) => mockSent.filter((s) => s.table === table && s.op === op);

beforeEach(() => {
  mockOutcome = 'ok';
  mockSent.length = 0; mockQueued.length = 0; mockRpc.length = 0;
  reset();
});

// ── FILING ──────────────────────────────────────────────────────────────────
describe('filing something new', () => {
  it('puts it on the page at once and sends the row', async () => {
    await useDispatch.getState().file({ kind: 'take', body: 'Ozu sat down.' });
    const row = sentTo('dispatch_posts', 'insert')[0].row as Record<string, unknown>;
    expect(row.kind).toBe('take');
    expect(row.body).toBe('Ozu sat down.');
    expect(row.is_published).toBe(true);
    expect(row.user_id).toBe('u1');
    expect(useDispatch.getState().filings[0].body).toBe('Ozu sat down.');
  });

  it('shows a filing on the page it belongs to, and not on one it does not', async () => {
    // Filing a wire while reading TAKES must not drop a wire into the takes
    // column. The row is real either way; the next fetch of its own department
    // will show it.
    reset({ section: 'TAKES', filings: [] });
    await useDispatch.getState().file({ kind: 'wire', body: 'News.', source: 'Sight & Sound' });
    expect(useDispatch.getState().filings).toHaveLength(0);

    reset({ section: 'TAKES', filings: [] });
    await useDispatch.getState().file({ kind: 'take', body: 'A take.' });
    expect(useDispatch.getState().filings).toHaveLength(1);
  });

  it('caps every field at what its column will take', async () => {
    const huge = 'x'.repeat(30000);
    await useDispatch.getState().file({
      kind: 'dossier', title: huge, body: huge, fullContent: huge, spoilerLabel: huge,
    });
    const row = sentTo('dispatch_posts', 'insert')[0].row as Record<string, string>;
    expect(row.title.length).toBeLessThanOrEqual(MAX_LENGTHS.filingTitle);
    // A dossier's BODY is its excerpt, and the column's fence for it is tighter
    // than for every other kind.
    expect(row.body.length).toBeLessThanOrEqual(MAX_LENGTHS.filingExcerpt);
    expect(row.full_content.length).toBeLessThanOrEqual(MAX_LENGTHS.filingEssay);
    expect(row.spoiler_label.length).toBeLessThanOrEqual(MAX_LENGTHS.spoilerLabel);
  });

  it('sends the same values it drew, not a second opinion', async () => {
    // One choke point: what is shown, what is sent and what is queued all read
    // the same cleaned draft, so an offline filing cannot differ from the one
    // on screen.
    mockOutcome = 'offline';
    const long = 'y'.repeat(3000);
    await useDispatch.getState().file({ kind: 'take', body: long });
    const shown = useDispatch.getState().filings[0].body;
    const queued = (mockQueued[0].payload as { body: string }).body;
    expect(queued).toBe(shown);
    expect(shown.length).toBeLessThanOrEqual(MAX_LENGTHS.filingBody);
  });

  it('takes it back off the page when the house refuses, and says so', async () => {
    // It THROWS rather than returning null: the desk that called it is the one
    // that must tell the member, and a silent null would let the desk navigate
    // away as though the filing had landed.
    mockOutcome = 'refused';
    reset({ filings: [] });
    await expect(useDispatch.getState().file({ kind: 'take', body: 'A take.' })).rejects.toBeTruthy();
    expect(useDispatch.getState().filings).toHaveLength(0);
  });

  it('keeps it, and queues it, when the wire is down', async () => {
    mockOutcome = 'offline';
    reset({ filings: [] });
    const res = await useDispatch.getState().file({ kind: 'take', body: 'A take.' });
    expect(res?.offline).toBe(true);
    expect(useDispatch.getState().filings).toHaveLength(1);
    expect(mockQueued[0].type).toBe('add_filing');
    // The temp id travels with it, so the queue can map it to the real row.
    expect(mockQueued[0].payload._tempId).toBeTruthy();
  });

  it('refuses to file for nobody', async () => {
    const auth = require('../auth').useAuthStore;
    auth.getState.mockReturnValueOnce({ user: null });
    expect(await useDispatch.getState().file({ kind: 'take', body: 'A take.' })).toBeNull();
    expect(mockSent).toHaveLength(0);
  });
});

// ── AMENDING ────────────────────────────────────────────────────────────────
describe('amending a filing', () => {
  it('sends only the fields that changed', async () => {
    await useDispatch.getState().amend('f1', { body: 'A better take.' });
    const row = sentTo('dispatch_posts', 'update')[0].row as Record<string, unknown>;
    expect(row.body).toBe('A better take.');
    expect(row).not.toHaveProperty('title');
    // Both stamps, every time — `edited_at` is what the card prints as EDITED.
    expect(row.edited_at).toBeTruthy();
    expect(row.updated_at).toBeTruthy();
  });

  it('marks it edited on the page immediately', async () => {
    await useDispatch.getState().amend('f1', { body: 'A better take.' });
    expect(useDispatch.getState().filings[0].editedAt).toBeTruthy();
    expect(useDispatch.getState().filings[0].body).toBe('A better take.');
  });

  it('puts the whole filing back when refused', async () => {
    mockOutcome = 'refused';
    await expect(useDispatch.getState().amend('f1', { body: 'A better take.' })).rejects.toBeTruthy();
    expect(useDispatch.getState().filings[0].body).toBe('A take.');
    expect(useDispatch.getState().filings[0].editedAt).toBeNull();
  });

  it('queues the amendment when the wire is down', async () => {
    mockOutcome = 'offline';
    const res = await useDispatch.getState().amend('f1', { body: 'A better take.' });
    expect((res as { offline: boolean }).offline).toBe(true);
    expect(mockQueued[0].type).toBe('update_filing');
  });
});

// ── ENDING ──────────────────────────────────────────────────────────────────
describe('ending a filing', () => {
  it('is a server call, and never sends the erasure itself', async () => {
    await useDispatch.getState().end('f1');
    expect(mockRpc[0].fn).toBe('end_filing');
    expect(mockRpc[0].args).toEqual({ p_post: 'f1', p_by: 'author' });
    // An erasure written by the client is an erasure a client can get wrong.
    expect(sentTo('dispatch_posts', 'update')).toHaveLength(0);
  });

  it('empties the words on the page but keeps the row', async () => {
    await useDispatch.getState().end('f1');
    const f = useDispatch.getState().filings[0];
    // The row stays so the critiques written underneath it stay — which is the
    // entire reason ending is not deleting.
    expect(useDispatch.getState().filings).toHaveLength(1);
    expect(f.body).toBe('');
    expect(f.title).toBeNull();
    expect(f.endedBy).toBe('author');
    expect(f.commentCount).toBe(2);
  });

  it('brings the words back when refused', async () => {
    mockOutcome = 'refused';
    await expect(useDispatch.getState().end('f1')).rejects.toBeTruthy();
    expect(useDispatch.getState().filings[0].body).toBe('A take.');
    expect(useDispatch.getState().filings[0].endedAt).toBeNull();
  });
});

// ── CRITIQUES ───────────────────────────────────────────────────────────────
describe('writing a critique', () => {
  it('appears at once, counts up, and is sent', async () => {
    await useDispatch.getState().addCritique('f1', 'That is the argument.');
    expect(useDispatch.getState().critiques.f1).toHaveLength(1);
    expect(useDispatch.getState().filings[0].commentCount).toBe(3);
    const row = sentTo('dispatch_comments', 'insert')[0].row as Record<string, unknown>;
    expect(row.post_id).toBe('f1');
    expect(row.body).toBe('That is the argument.');
  });

  it('comes off again, count and all, when refused', async () => {
    mockOutcome = 'refused';
    await expect(useDispatch.getState().addCritique('f1', 'No.')).rejects.toBeTruthy();
    expect(useDispatch.getState().critiques.f1 ?? []).toHaveLength(0);
    expect(useDispatch.getState().filings[0].commentCount).toBe(2);
  });

  it('caps the critique at its column', async () => {
    await useDispatch.getState().addCritique('f1', 'z'.repeat(5000));
    const row = sentTo('dispatch_comments', 'insert')[0].row as Record<string, string>;
    expect(row.body.length).toBeLessThanOrEqual(MAX_LENGTHS.critique);
  });

  it('refuses an empty one before anything is sent', async () => {
    await useDispatch.getState().addCritique('f1', '   ');
    expect(mockSent).toHaveLength(0);
    expect(useDispatch.getState().filings[0].commentCount).toBe(2);
  });
});

describe('amending and withdrawing a critique', () => {
  const critique = {
    id: 'c1', postId: 'f1', authorId: 'u1', author: { name: 'me', memberNo: 1, tier: 'free' as const },
    body: 'First thought.', certifyCount: 0, createdAt: '2026-08-28T21:00:00Z', editedAt: null,
  };

  it('rewrites it, and puts the old words back when refused', async () => {
    reset({ critiques: { f1: [critique] } });
    await useDispatch.getState().amendCritique('c1', 'f1', 'Second thought.');
    expect(useDispatch.getState().critiques.f1[0].body).toBe('Second thought.');

    mockOutcome = 'refused';
    reset({ critiques: { f1: [critique] } });
    await expect(useDispatch.getState().amendCritique('c1', 'f1', 'Second thought.'))
      .rejects.toBeTruthy();
    expect(useDispatch.getState().critiques.f1[0].body).toBe('First thought.');
  });

  it('withdraws it and counts down', async () => {
    reset({ critiques: { f1: [critique] } });
    await useDispatch.getState().removeCritique('c1', 'f1');
    expect(useDispatch.getState().critiques.f1).toHaveLength(0);
    expect(useDispatch.getState().filings[0].commentCount).toBe(1);
  });

  it('puts a withdrawn critique back WHERE IT WAS, not at the top', async () => {
    // A critique that jumps position because the network failed is the app
    // rewriting the argument's order.
    const second = { ...critique, id: 'c2', body: 'Second.' };
    const third = { ...critique, id: 'c3', body: 'Third.' };
    mockOutcome = 'refused';
    reset({ critiques: { f1: [critique, second, third] } });

    await expect(useDispatch.getState().removeCritique('c2', 'f1')).rejects.toBeTruthy();
    expect(useDispatch.getState().critiques.f1.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    expect(useDispatch.getState().filings[0].commentCount).toBe(2);
  });
});

// ── THE REFUSAL THAT LOOKS LIKE A SUCCESS ───────────────────────────────────
/**
 * Three updates ask for `.select('id')` — `amend`, `amendCritique`, and
 * `takeAnswer` — because a row RLS refuses matches nothing, and matching
 * nothing is a 200 with an empty array rather than an error. Two of the three
 * had a test standing over that empty array. `takeAnswer` did not: its only
 * refusal test used a PostgREST *error*, which is caught one line earlier by
 * `if (error) throw error`, so the guard underneath had never once run.
 *
 * Deleting that line would have left every one of the suite's other tests green
 * while the reader marked an answer the house never accepted — visible on the
 * page, gone on the next fetch, and never explained to the member who chose it.
 */
describe('an update the house refuses in silence', () => {
  /** Fire-and-forget, like the other five acts. */
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('puts the previous answer back when the row matched nothing', async () => {
    mockOutcome = 'silent';
    reset({ filings: [filing({ kind: 'seeking', answerId: 'c-old' })] });

    useDispatch.getState().takeAnswer('f1', 'c-new');
    // The member sees it taken at once — that half was always right.
    expect(useDispatch.getState().filings[0].answerId).toBe('c-new');

    await settle();
    // And it comes ALL the way back, to the previous answer rather than null.
    expect(useDispatch.getState().filings[0].answerId).toBe('c-old');
  });

  it('still sends the update, and still asks for the row back', async () => {
    mockOutcome = 'silent';
    reset({ filings: [filing({ kind: 'seeking', answerId: null })] });

    useDispatch.getState().takeAnswer('f1', 'c-new');
    await settle();

    const row = sentTo('dispatch_posts', 'update')[0].row as Record<string, unknown>;
    expect(row.answer_id).toBe('c-new');
    expect(useDispatch.getState().filings[0].answerId).toBeNull();
  });
});
