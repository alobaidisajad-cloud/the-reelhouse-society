/**
 * dispatchGuards.test.ts — the last dark corners of the store.
 * ─────────────────────────────────────────────────────────────────────────────
 * What is left after the reads and the writes: `hydrate`, the viewer's own
 * marks, every conditional field in the two row builders, the offline branch of
 * each critique operation, and the session guard.
 *
 * The session guard is the one that matters most and shows least. Every act
 * rolls back after an `await`, and if the member signed out during that await
 * the store has already been cleared by the logout reset — so the rollback
 * would write the PREVIOUS member's state back into it, and a store change
 * triggers a disk write, which can re-create the persisted copy the reset
 * exists to delete. It is a data-leak path with no visible symptom.
 */
import { useDispatch } from '../dispatch';
import type { Filing } from '../dispatchTypes';

let mockOutcome: 'ok' | 'refused' | 'offline' = 'ok';
let mockRow: Record<string, unknown> | null = null;
let mockViewer: Record<string, unknown[]> = {};
const mockSent: Array<{ table: string; op: string; row: unknown }> = [];
const mockQueued: Array<{ type: string; payload: Record<string, unknown> }> = [];

/** Who `getState()` reports. A test can change it MID-FLIGHT. */
let mockUser: { id: string; username: string } | null = { id: 'u1', username: 'me' };

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
      let selected = '';
      chain.select = (c: string) => { selected = c ?? ''; return self(); };
      chain.eq = () => self();
      chain.is = () => self();
      chain.order = () => self();
      chain.in = () => Promise.resolve({ data: mockViewer[table] ?? [], error: null });
      const builder = (data: unknown) => {
        const r = Promise.resolve({ data, error: null });
        const b = Object.assign(r, { abortSignal: () => b });
        return b;
      };
      chain.maybeSingle = () => builder(mockRow);
      chain.limit = () => builder([]);
      chain.range = () => builder([]);
      chain.insert = (rows: unknown[]) => { mockSent.push({ table, op: 'insert', row: rows[0] }); return answer(); };
      chain.update = (row: unknown) => { mockSent.push({ table, op: 'update', row }); return self(); };
      chain.delete = () => { mockSent.push({ table, op: 'delete', row: null }); return self(); };
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => answer().then(res, rej);
      void selected;
      return chain;
    },
    rpc: () => answer(),
  },
}));

jest.mock('../auth', () => ({
  useAuthStore: { getState: () => ({ user: mockUser }) },
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

const row = (over: Record<string, unknown> = {}) => ({
  id: 'f1', kind: 'take', user_id: 'u2', author_username: 'someone',
  body: 'A take.', certify_count: 4, comment_count: 1,
  created_at: '2026-08-28T21:00:00Z', edited_at: null, profiles: null, ...over,
});

const filing = (over: Partial<Filing> = {}): Filing => ({
  id: 'f1', kind: 'take', authorId: 'u1',
  author: { name: 'me', memberNo: 1, tier: 'free' },
  film: null, subjectId: null, subjectKind: null,
  title: null, body: 'A take.', fullContent: null,
  source: null, sourceUrl: null,
  options: null, closesAt: null, frozenTotals: null, answerId: null,
  seriesId: null, seriesTitle: null, partNumber: null,
  spoilerLabel: null, withheldAt: null, endedAt: null, endedBy: null,
  certifyCount: 4, commentCount: 1,
  createdAt: '2026-08-28T21:00:00Z', editedAt: null,
  ...over,
});

const reset = (over: Record<string, unknown> = {}) => {
  useDispatch.setState({
    filings: [], opened: {}, section: 'ALL', sort: 'LATEST', savedOnly: false,
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
  mockUser = { id: 'u1', username: 'me' };
  mockRow = row();
  mockViewer = {};
  mockSent.length = 0; mockQueued.length = 0;
  reset();
});

describe('opening one filing', () => {
  it('returns it, and caches the essay onto the row already on the page', async () => {
    reset({ filings: [filing({ fullContent: null })] });
    mockRow = row({ full_content: 'The whole essay.', kind: 'dossier', title: 'A Dossier' });
    const got = await useDispatch.getState().hydrate('f1');
    expect(got?.fullContent).toBe('The whole essay.');
    // Cached on the row rather than held in the screen: a body kept in a
    // component is discarded on the next render and the essay silently falls
    // back to its 500-character opening.
    expect(useDispatch.getState().filings[0].fullContent).toBe('The whole essay.');
  });

  it('does not invent a row on the page for a filing that was not there', async () => {
    reset({ filings: [] });
    await useDispatch.getState().hydrate('f1');
    expect(useDispatch.getState().filings).toHaveLength(0);
  });

  it('returns null for a filing that is gone', async () => {
    mockRow = null;
    expect(await useDispatch.getState().hydrate('f1')).toBeNull();
  });

  it('returns null rather than a half-parsed row', async () => {
    mockRow = { id: 'f1', kind: 'not-a-kind' };
    expect(await useDispatch.getState().hydrate('f1')).toBeNull();
  });
});

describe('what this member has already done', () => {
  it('is read for the filings on the page, and only those', async () => {
    mockViewer = {
      dispatch_certifications: [{ post_id: 'f1' }],
      dispatch_saves: [{ post_id: 'f1' }],
      dispatch_votes: [{ post_id: 'f1', option_index: 2 }],
    };
    reset({ filings: [] });
    await useDispatch.getState().hydrate('f1');

    expect(useDispatch.getState().certifiedIds.has('f1')).toBe(true);
    expect(useDispatch.getState().savedIds.has('f1')).toBe(true);
    expect(useDispatch.getState().myVotes.f1).toBe(2);
  });

  it('is not read at all for a signed-out reader', async () => {
    mockUser = null;
    mockViewer = { dispatch_certifications: [{ post_id: 'f1' }] };
    await useDispatch.getState().hydrate('f1');
    expect(useDispatch.getState().certifiedIds.size).toBe(0);
  });
});

describe('the session guard', () => {
  it('does not write the previous member’s state back after a sign-out', async () => {
    // The rollback runs after an await. If the member signed out during it, the
    // store has already been cleared — and writing here would restore their
    // counts AND re-create the persisted copy the logout reset deletes.
    mockOutcome = 'refused';
    reset({ filings: [filing({ certifyCount: 10 })] });

    useDispatch.getState().certify('f1', true);
    expect(useDispatch.getState().filings[0].certifyCount).toBe(11);

    // They sign out while the write is in flight, and the store is cleared.
    mockUser = null;
    reset({ filings: [] });

    await new Promise((r) => setTimeout(r, 0));
    expect(useDispatch.getState().filings).toHaveLength(0);
  });

  it('does not roll a filing back into a DIFFERENT member’s store', async () => {
    mockOutcome = 'refused';
    reset({ filings: [filing()] });
    const p = useDispatch.getState().amend('f1', { body: 'Changed.' });

    mockUser = { id: 'u2', username: 'someone-else' };
    reset({ filings: [] });

    await p.catch(() => {});
    expect(useDispatch.getState().filings).toHaveLength(0);
  });
});

describe('the row a filing is sent as', () => {
  const sent = () => sentTo('dispatch_posts', 'insert')[0].row as Record<string, unknown>;

  it('carries a ballot’s options and its closing time', async () => {
    await useDispatch.getState().file({
      kind: 'ballot', body: 'What tonight?',
      options: [
        { film_id: 1, title: 'Tokyo Story', poster_path: '/a.jpg' },
        { film_id: 2, title: 'Late Spring', poster_path: null },
      ],
      closesAt: '2026-09-05T00:00:00Z',
    });
    const r = sent();
    expect((r.options as unknown[]).length).toBe(2);
    expect(r.closes_at).toBe('2026-09-05T00:00:00Z');
  });

  it('carries a dossier’s essay, and its place in a series', async () => {
    await useDispatch.getState().file({
      kind: 'dossier', title: 'Part Two', body: 'An excerpt.',
      fullContent: 'The essay.', seriesId: 's1', seriesTitle: 'Ozu, in four parts', partNumber: 2,
    });
    const r = sent();
    expect(r.full_content).toBe('The essay.');
    expect(r.series_id).toBe('s1');
    expect(r.series_title).toBe('Ozu, in four parts');
    expect(r.part_number).toBe(2);
  });

  it('carries a wire’s source and its link', async () => {
    await useDispatch.getState().file({
      kind: 'wire', body: 'News.', source: 'Sight & Sound', sourceUrl: 'https://example.com/x',
    });
    const r = sent();
    expect(r.source).toBe('Sight & Sound');
    expect(r.source_url).toBe('https://example.com/x');
  });

  it('carries a film as the SUBJECT, with its art', async () => {
    await useDispatch.getState().file({
      kind: 'take', body: 'A take.',
      film: { id: 42, title: 'Tokyo Story', sub: '1953', image: '/poster.jpg' },
      spoilerLabel: 'SPOILERS',
    });
    const r = sent();
    expect(r.subject_kind).toBe('film');
    expect(r.subject_id).toBe(42);
    expect(r.subject_title).toBe('Tokyo Story');
    expect(r.subject_sub).toBe('1953');
    expect(r.subject_image).toBe('/poster.jpg');
    expect(r.spoiler_label).toBe('SPOILERS');
  });

  it('omits every field the draft did not carry', async () => {
    // Not `null` for each — omitted, so the column's own default applies and a
    // NOT NULL column is never handed an explicit null.
    await useDispatch.getState().file({ kind: 'take', body: 'A take.' });
    const r = sent();
    for (const k of ['title', 'full_content', 'source', 'source_url', 'spoiler_label',
      'options', 'closes_at', 'series_id', 'subject_kind', 'subject_id']) {
      expect(r).not.toHaveProperty(k);
    }
  });
});

describe('the row an amendment is sent as', () => {
  it('carries every field that was given, including one set back to null', async () => {
    reset({ filings: [filing({ kind: 'wire', source: 'Old' })] });
    await useDispatch.getState().amend('f1', {
      title: 'A Title', body: 'Body.', fullContent: 'Essay.',
      source: 'New', sourceUrl: 'https://x', spoilerLabel: null, seriesTitle: 'A Series',
    });
    const r = sentTo('dispatch_posts', 'update')[0].row as Record<string, unknown>;
    expect(r.title).toBe('A Title');
    expect(r.full_content).toBe('Essay.');
    expect(r.source).toBe('New');
    expect(r.source_url).toBe('https://x');
    expect(r.series_title).toBe('A Series');
    // Clearing a spoiler label has to SEND the null, or the flag can never be
    // taken off once it is on.
    expect(r).toHaveProperty('spoiler_label', null);
  });
});

describe('when the wire is down', () => {
  const critique = {
    id: 'c1', postId: 'f1', authorId: 'u1', author: { name: 'me', memberNo: 1, tier: 'free' as const },
    body: 'First.', certifyCount: 0, createdAt: '2026-08-28T21:00:00Z', editedAt: null,
  };

  it('queues a critique and keeps it on the page', async () => {
    mockOutcome = 'offline';
    reset({ filings: [filing()] });
    const res = await useDispatch.getState().addCritique('f1', 'A critique.');
    expect((res as { offline: boolean }).offline).toBe(true);
    expect(useDispatch.getState().critiques.f1).toHaveLength(1);
    expect(mockQueued[0].type).toBe('add_critique');
    expect(mockQueued[0].payload._tempId).toBeTruthy();
  });

  it('queues an amendment and keeps the new words', async () => {
    mockOutcome = 'offline';
    reset({ filings: [filing()], critiques: { f1: [critique] } });
    await useDispatch.getState().amendCritique('c1', 'f1', 'Second.');
    expect(useDispatch.getState().critiques.f1[0].body).toBe('Second.');
    expect(mockQueued[0].type).toBe('update_critique');
  });

  it('queues a withdrawal and keeps it off the page', async () => {
    mockOutcome = 'offline';
    reset({ filings: [filing()], critiques: { f1: [critique] } });
    await useDispatch.getState().removeCritique('c1', 'f1');
    expect(useDispatch.getState().critiques.f1).toHaveLength(0);
    expect(mockQueued[0].type).toBe('remove_critique');
  });

  it('queues an ending and keeps the filing ended', async () => {
    mockOutcome = 'offline';
    reset({ filings: [filing()] });
    const res = await useDispatch.getState().end('f1');
    expect((res as { offline: boolean }).offline).toBe(true);
    expect(useDispatch.getState().filings[0].endedBy).toBe('author');
    expect(mockQueued[0].type).toBe('end_filing');
  });
});

describe('what the store keeps of what has been opened', () => {
  it('holds the last twelve, and drops the oldest rather than growing forever', async () => {
    // `opened` is what lets a filing reached by its own address be amended and
    // withdrawn. Unbounded it is a memory leak that grows with every tap; the
    // cap is what makes it a cache instead.
    reset();
    for (let i = 1; i <= 14; i++) {
      mockRow = row({ id: `f${i}` });
      await useDispatch.getState().hydrate(`f${i}`);
    }
    const held = Object.keys(useDispatch.getState().opened);
    expect(held).toHaveLength(12);
    // The oldest two are gone; the newest are kept.
    expect(held).not.toContain('f1');
    expect(held).not.toContain('f2');
    expect(held).toContain('f14');
  });

  it('moves a re-opened filing to the end rather than ageing it out', async () => {
    reset();
    for (let i = 1; i <= 12; i++) {
      mockRow = row({ id: `f${i}` });
      await useDispatch.getState().hydrate(`f${i}`);
    }
    // Re-open the oldest, then push one more past the cap.
    mockRow = row({ id: 'f1' });
    await useDispatch.getState().hydrate('f1');
    mockRow = row({ id: 'f13' });
    await useDispatch.getState().hydrate('f13');

    const held = Object.keys(useDispatch.getState().opened);
    expect(held).toContain('f1');
    expect(held).not.toContain('f2');
  });
});

/**
 * ── THE SESSION GUARD, WHERE IT CAN ACTUALLY BE SEEN ────────────────────────
 * Every optimistic act rolls back after an `await`. If the member signed out
 * during that await the store has already been cleared by the logout reset, so
 * an unguarded rollback writes the PREVIOUS member's state into the NEXT
 * member's session — and a store change triggers a disk write, which can
 * re-create the persisted copy the reset exists to delete.
 *
 * ⚠️ THE FIRST VERSION OF THIS BLOCK PROVED NOTHING. It ran five acts in the
 * direction where the rollback DELETES from a set — and deleting from a store
 * that has just been emptied is a no-op, so removing every guard in the store
 * left all five green. A test that cannot see the thing it is about is worse
 * than no test, because it reads as coverage.
 *
 * The direction that can be seen is the one where the rollback ADDS. Undoing a
 * mark restores it; and undoing a SAVE on the kept page puts the whole filing
 * back onto the list, which is the leak at its plainest: another member's
 * writing reappearing on a page that is not theirs.
 *
 * `vote` and `takeAnswer` are deliberately absent. Their rollbacks only touch a
 * vote and a filing that an emptied store no longer holds, so there is nothing
 * they could write into the next session — the guard there is belt and braces,
 * and pretending otherwise would be another test that cannot fail.
 *
 * ── AND THE PROTECTION IS DOUBLED, WHICH TOOK FOUR MUTATIONS TO ESTABLISH ───
 * `writeThrough` checks the session before calling `undo`, AND each `undo`
 * checks again inside itself. Removing either layer alone changes nothing,
 * because the other one holds — so the first three mutations all came back
 * green and looked exactly like a test that proves nothing.
 *
 * It only shows when BOTH go, and then all three of these fail. The fourth
 * mutation also had to cover the second SPELLING: `certifyCritique` writes its
 * guard positively, `if (memberUnchanged(...)) move(...)`, so a blanket removal
 * of `if (!memberUnchanged(...)) return;` walked straight past it and left that
 * test looking weak when it was the mutation that was incomplete.
 *
 * The lesson is not about this guard. A mutation that leaves a second layer
 * standing has not tested anything, and it is indistinguishable from a guard
 * that works.
 */
describe('the session guard, where a rollback would ADD something', () => {
  const armed = () => {
    mockOutcome = 'refused';
    reset({
      filings: [filing({ certifyCount: 10 })],
      certifiedIds: new Set(['f1']),
      savedIds: new Set(['f1']),
      certifiedCritiqueIds: new Set(['c1']),
      critiques: {
        f1: [{
          id: 'c1', postId: 'f1', authorId: 'u2', author: null,
          body: 'A critique.', certifyCount: 3,
          createdAt: '2026-08-28T21:00:00Z', editedAt: null,
        }],
      },
    });
  };

  /** They sign out mid-flight and the logout reset empties everything. */
  const signOut = () => {
    mockUser = null;
    reset({ filings: [], certifiedIds: new Set(), savedIds: new Set(), certifiedCritiqueIds: new Set() });
  };

  it('un-certifying does not put the mark back into the next session', async () => {
    armed();
    useDispatch.getState().certify('f1', false);
    signOut();
    await new Promise((r) => setTimeout(r, 0));
    expect(useDispatch.getState().certifiedIds.size).toBe(0);
  });

  it('un-saving does not put the mark OR the filing back', async () => {
    // The strongest case: on the kept page an un-save removes the row, so the
    // rollback splices the whole filing back in. Unguarded, the previous
    // member's writing reappears on a page belonging to somebody else.
    armed();
    useDispatch.setState({ savedOnly: true } as never);
    useDispatch.getState().save('f1', false);
    signOut();
    await new Promise((r) => setTimeout(r, 0));
    expect(useDispatch.getState().savedIds.size).toBe(0);
    expect(useDispatch.getState().filings).toHaveLength(0);
  });

  it('un-certifying a critique does not put that mark back either', async () => {
    armed();
    useDispatch.getState().certifyCritique('c1', 'f1', false);
    signOut();
    await new Promise((r) => setTimeout(r, 0));
    expect(useDispatch.getState().certifiedCritiqueIds.size).toBe(0);
  });
});
