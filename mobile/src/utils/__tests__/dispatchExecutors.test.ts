/**
 * dispatchExecutors.test.ts — what the Dispatch actually WRITES when the wire
 * comes back.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every act on the Dispatch can be performed with no signal: file, amend, end,
 * critique, certify, vote, answer, save. Each one is queued and replayed later
 * by a handler in `mutationExecutor`. Istanbul's function hit counts said what
 * no summary did — **0 of those 12 handlers had ever been executed by a test**,
 * and neither had `cleanFiling`, the whitelist every filing passes through.
 *
 * They were not unguarded. `dispatchMutationRegistry` and `dispatchOfflineParity`
 * both read this file AS TEXT — deliberately, and with a stated reason: importing
 * it drags in supabase, sentry and the whole store graph. That catches a type
 * missing from a registry and a field missing from a list. It cannot catch a
 * handler that throws, that builds the wrong row at runtime, that sends a column
 * a member must never set, or that loses the id-remap which is the only thing
 * stopping a retry from filing a SECOND copy.
 *
 * So this drives them. The supabase client is replaced with a recorder, and each
 * test asserts the row that would have gone to the database — table, shape, and
 * the ownership filter that makes RLS able to refuse it.
 *
 * `sanitizeInput` is deliberately NOT mocked: the caps are part of what these
 * handlers promise, and a mocked sanitiser would turn that promise into a
 * formality — the exact defect `input-trust-boundary` records.
 */
import { executeMutation } from '../mutationExecutor';
import { MAX_LENGTHS } from '../sanitizeInput';

// ── the recorder ────────────────────────────────────────────────────────────
// `mock`-prefixed so the jest.mock factory may close over them; jest rejects
// out-of-scope names otherwise, and the error it gives does not say so clearly.
interface Recorded {
  table: string;
  op?: 'insert' | 'update' | 'delete';
  rows?: Record<string, unknown>[];
  patch?: Record<string, unknown>;
  filters: Record<string, unknown>;
  select?: string;
}
const mockCalls: Recorded[] = [];
const mockRpc: { name: string; args: unknown }[] = [];
/** What an AWAITED chain resolves `data` to. `throwIfRefused` needs a non-empty array. */
let mockRows: unknown[] | null = [{ id: 'row' }];
/** What `.maybeSingle()` resolves `data` to. */
let mockSingle: unknown = { id: 'server-id' };
let mockSession: string | null = 'me';

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: mockSession ? { user: { id: mockSession } } : null },
      })),
    },
    rpc: jest.fn(async (name: string, args: unknown) => {
      mockRpc.push({ name, args });
      return { data: null, error: null };
    }),
    from: jest.fn((table: string) => {
      const rec: Recorded = { table, filters: {} };
      mockCalls.push(rec);
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.insert = (rows: Record<string, unknown>[]) => { rec.op = 'insert'; rec.rows = rows; return self(); };
      chain.update = (patch: Record<string, unknown>) => { rec.op = 'update'; rec.patch = patch; return self(); };
      chain.delete = () => { rec.op = 'delete'; return self(); };
      chain.select = (cols: string) => { rec.select = cols; return self(); };
      chain.eq = (col: string, val: unknown) => { rec.filters[col] = val; return self(); };
      chain.maybeSingle = async () => ({ data: mockSingle, error: null });
      chain.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: mockRows, error: null }).then(res);
      return chain;
    }),
  },
}));

const run = (type: string, payload: Record<string, unknown>, idMap: Record<string, string> = {}) =>
  executeMutation({ type, payload } as never, idMap);

/** The single recorded call against `table`, asserted to be the only one. */
const on = (table: string) => {
  const hits = mockCalls.filter((c) => c.table === table);
  expect(`${table} touched ${hits.length} time(s)`).toBe(`${table} touched 1 time(s)`);
  return hits[0];
};

beforeEach(() => {
  mockCalls.length = 0;
  mockRpc.length = 0;
  mockRows = [{ id: 'row' }];
  mockSingle = { id: 'server-id' };
  mockSession = 'me';
});

// ════════════════════════════════════════════════════════════════════════════
describe('filing, offline', () => {
  it('writes the filing to dispatch_posts under the id the optimistic row already has', async () => {
    const out = await run('add_filing', {
      _tempId: 'temp-1', kind: 'dossier', user_id: 'me',
      title: 'On Ozu', body: 'An excerpt.', full_content: 'The whole essay.',
      subject_kind: 'film', subject_id: 42, subject_title: 'Tokyo Story',
      subject_image: '/p.jpg', subject_backdrop: '/b.jpg',
    });

    const call = on('dispatch_posts');
    expect(call.op).toBe('insert');
    // THE ID IS THE POINT. Without it a transient failure retries and files a
    // second copy; with it the retry hits the primary key, the queue reads
    // 23505 as "it landed", and the mutation is dropped.
    expect(call.rows![0].id).toBe('temp-1');
    expect(call.rows![0]).toMatchObject({
      kind: 'dossier', user_id: 'me', title: 'On Ozu',
      subject_image: '/p.jpg', subject_backdrop: '/b.jpg',
    });
    // And the caller is told which fake id became which real one.
    expect(out).toEqual({ newId: 'server-id', fakeId: 'temp-1' });
  });

  it('sends author_username as a placeholder rather than omitting a NOT NULL column', async () => {
    await run('add_filing', { _tempId: 't', kind: 'take', user_id: 'me', body: 'x' });
    expect(on('dispatch_posts').rows![0].author_username).toBe('');
  });

  it('drops keys the payload never set instead of writing nulls over them', async () => {
    await run('add_filing', { _tempId: 't', kind: 'take', user_id: 'me', body: 'x' });
    const row = on('dispatch_posts').rows![0];
    expect(Object.prototype.hasOwnProperty.call(row, 'closes_at')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(row, 'series_id')).toBe(false);
  });

  it('THE COVER TRAVELS: a backdrop survives the offline path', async () => {
    // `dispatchOfflineParity` exists because this field list and the store's
    // can drift. This is the same promise, executed.
    await run('add_filing', {
      _tempId: 't', kind: 'dossier', user_id: 'me', subject_backdrop: '/still.jpg',
    });
    expect(on('dispatch_posts').rows![0].subject_backdrop).toBe('/still.jpg');
  });

  it('caps an over-long essay rather than letting the database refuse the row', async () => {
    await run('add_filing', {
      _tempId: 't', kind: 'dossier', user_id: 'me',
      full_content: 'x'.repeat(MAX_LENGTHS.filingEssay + 500),
    });
    const len = String(on('dispatch_posts').rows![0].full_content).length;
    expect(len).toBeLessThanOrEqual(MAX_LENGTHS.filingEssay);
  });
});

describe('amending a filing', () => {
  it('writes ONLY whitelisted columns — a counter sent by a tampered queue is dropped', async () => {
    await run('update_filing', {
      id: 'p1', user_id: 'me', kind: 'dossier',
      updates: {
        title: 'A better title',
        certify_count: 9999,          // a trigger owns this
        withheld_at: '2020-01-01',    // a moderator owns this
        user_id: 'someone-else',      // reparenting
        frozen_totals: { a: 1 },      // a ballot's result
      },
    });
    const call = on('dispatch_posts');
    expect(call.op).toBe('update');
    expect(call.patch!.title).toBe('A better title');
    for (const forbidden of ['certify_count', 'withheld_at', 'user_id', 'frozen_totals']) {
      expect(`${forbidden} written: ${forbidden in call.patch!}`).toBe(`${forbidden} written: false`);
    }
  });

  it('LENDS the kind to pick the body cap and never writes it', async () => {
    // Writing `kind` would retroactively change which CHECK constraints text
    // already written must satisfy.
    await run('update_filing', { id: 'p1', user_id: 'me', kind: 'dossier', updates: { body: 'short' } });
    expect('kind' in on('dispatch_posts').patch!).toBe(false);
  });

  it('a dossier body is capped as an EXCERPT, not as a full body', async () => {
    await run('update_filing', {
      id: 'p1', user_id: 'me', kind: 'dossier',
      updates: { body: 'x'.repeat(MAX_LENGTHS.filingBody) },
    });
    const len = String(on('dispatch_posts').patch!.body).length;
    expect(len).toBeLessThanOrEqual(MAX_LENGTHS.filingExcerpt);
  });

  it('scopes the write to the author, so RLS can refuse somebody else’s filing', async () => {
    await run('update_filing', { id: 'p1', user_id: 'me', kind: 'take', updates: { body: 'b' } });
    expect(on('dispatch_posts').filters).toEqual({ id: 'p1', user_id: 'me' });
  });

  it('stamps updated_at AND edited_at together', async () => {
    await run('update_filing', { id: 'p1', user_id: 'me', kind: 'take', updates: { body: 'b' } });
    const patch = on('dispatch_posts').patch!;
    expect(patch.updated_at).toEqual(patch.edited_at);
    expect(typeof patch.updated_at).toBe('string');
  });

  it('does nothing at all when every field was filtered out', async () => {
    await run('update_filing', { id: 'p1', user_id: 'me', kind: 'take', updates: { certify_count: 5 } });
    expect(mockCalls).toEqual([]);
  });

  it('A WITHHELD FILING REFUSES, and the replay does not report success', async () => {
    // RLS matches no row: PostgREST answers 200 with an empty body and no error.
    // Without `throwIfRefused` the queue would drop the amendment as delivered.
    mockRows = [];
    await expect(run('update_filing', {
      id: 'p1', user_id: 'me', kind: 'take', updates: { body: 'b' },
    })).rejects.toThrow(/refused/i);
  });
});

describe('ending a filing', () => {
  it('goes through the RPC and sends NO user_id to be trusted', async () => {
    await run('end_filing', { id: 'p1', user_id: 'me' });
    expect(mockRpc).toEqual([{ name: 'end_filing', args: { p_post: 'p1', p_by: 'author' } }]);
    // The RPC proves ownership itself; a client-supplied actor would be a claim.
    expect(JSON.stringify(mockRpc[0].args)).not.toContain('me');
  });
});

describe('critiques', () => {
  it('writes the critique and reports the real id back', async () => {
    const out = await run('add_critique', {
      _tempId: 'c-temp', post_id: 'p1', user_id: 'me', body: 'Eight hundred words.',
    });
    const call = on('dispatch_comments');
    expect(call.op).toBe('insert');
    expect(call.rows![0]).toMatchObject({ id: 'c-temp', post_id: 'p1', user_id: 'me' });
    expect(call.rows![0].author_username).toBe('');
    expect(out).toEqual({ newId: 'server-id', fakeId: 'c-temp' });
  });

  it('THE ID MAP: a critique queued under a filing that did not exist yet is remapped', async () => {
    // Filed offline, then critiqued offline. The filing flushes first and gets a
    // real id; this critique must follow it, or the insert fails a foreign key
    // against a row that never existed.
    await run('add_critique',
      { _tempId: 'c', post_id: 'temp-post', user_id: 'me', body: 'b' },
      { 'temp-post': 'real-post' });
    expect(on('dispatch_comments').rows![0].post_id).toBe('real-post');
  });

  it('caps the critique body', async () => {
    await run('add_critique', {
      _tempId: 'c', post_id: 'p1', user_id: 'me', body: 'x'.repeat(MAX_LENGTHS.critique + 200),
    });
    expect(String(on('dispatch_comments').rows![0].body).length)
      .toBeLessThanOrEqual(MAX_LENGTHS.critique);
  });

  it('an edit stamps edited_at and is scoped to its author', async () => {
    await run('update_critique', { id: 'c1', user_id: 'me', body: 'Rewritten.' });
    const call = on('dispatch_comments');
    expect(call.op).toBe('update');
    expect(typeof call.patch!.edited_at).toBe('string');
    expect(call.filters).toEqual({ id: 'c1', user_id: 'me' });
  });

  it('an edit that changed nothing is a refusal, not a success', async () => {
    mockRows = [];
    await expect(run('update_critique', { id: 'c1', user_id: 'me', body: 'b' }))
      .rejects.toThrow(/refused/i);
  });

  it('removing one is scoped to its author', async () => {
    await run('remove_critique', { id: 'c1', user_id: 'me' });
    const call = on('dispatch_comments');
    expect(call.op).toBe('delete');
    expect(call.filters).toEqual({ id: 'c1', user_id: 'me' });
  });
});

describe('certifying — a desired state, not a flip', () => {
  it('does NOTHING when the server already agrees', async () => {
    // The whole reason these reconcile: a queued toggle replayed after the
    // member already tapped again on another device must not undo them.
    mockSingle = { id: 'existing' };                 // already certified
    await run('certify_filing', { post_id: 'p1', desired_state: true });
    const writes = mockCalls.filter((c) => c.op);
    expect(writes).toEqual([]);
  });

  it('certifies when the server disagrees', async () => {
    mockSingle = null;
    await run('certify_filing', { post_id: 'p1', desired_state: true });
    const write = mockCalls.filter((c) => c.op === 'insert')[0];
    expect(write.table).toBe('dispatch_certifications');
    expect(write.rows![0]).toEqual({ user_id: 'me', post_id: 'p1' });
  });

  it('withdraws it when the desired state is false', async () => {
    mockSingle = { id: 'existing' };
    await run('certify_filing', { post_id: 'p1', desired_state: false });
    const write = mockCalls.filter((c) => c.op === 'delete')[0];
    expect(write.table).toBe('dispatch_certifications');
    expect(write.filters).toEqual({ post_id: 'p1', user_id: 'me' });
  });

  it('NEVER touches a counter — a trigger owns those', async () => {
    mockSingle = null;
    await run('certify_filing', { post_id: 'p1', desired_state: true });
    expect(JSON.stringify(mockCalls)).not.toContain('certify_count');
  });

  it('is a no-op with no session rather than writing a null member', async () => {
    mockSession = null;
    await run('certify_filing', { post_id: 'p1', desired_state: true });
    expect(mockCalls.filter((c) => c.op)).toEqual([]);
  });

  it('a critique certifies under comment_id, not post_id', async () => {
    mockSingle = null;
    await run('certify_critique', { comment_id: 'c1', desired_state: true });
    const write = mockCalls.filter((c) => c.op === 'insert')[0];
    expect(write.rows![0]).toEqual({ user_id: 'me', comment_id: 'c1' });
  });
});

describe('ballots, answers and saving', () => {
  it('a vote is one row and carries no deadline check of its own', async () => {
    await run('cast_vote', { post_id: 'p1', user_id: 'me', option_index: 2 });
    const call = on('dispatch_votes');
    expect(call.op).toBe('insert');
    expect(call.rows![0]).toEqual({ post_id: 'p1', user_id: 'me', option_index: 2 });
    // The deadline is RLS's job: a ballot that closed while the phone was
    // offline must be refused by the house, not by a clock that may be wrong.
    expect(JSON.stringify(call)).not.toContain('closes_at');
  });

  it('taking an answer is scoped to the seeker who asked', async () => {
    await run('take_answer', { post_id: 'p1', user_id: 'me', answer_id: 'c9' });
    const call = on('dispatch_posts');
    expect(call.patch).toEqual({ answer_id: 'c9' });
    expect(call.filters).toEqual({ id: 'p1', user_id: 'me' });
  });

  it('and a null answer_id is taking it BACK, not a missing field', async () => {
    await run('take_answer', { post_id: 'p1', user_id: 'me', answer_id: null });
    expect(on('dispatch_posts').patch).toEqual({ answer_id: null });
  });

  it('saving and unsaving are symmetrical', async () => {
    await run('save_filing', { post_id: 'p1', user_id: 'me' });
    expect(on('dispatch_saves')).toMatchObject({ op: 'insert', rows: [{ user_id: 'me', post_id: 'p1' }] });

    mockCalls.length = 0;
    await run('unsave_filing', { post_id: 'p1', user_id: 'me' });
    expect(on('dispatch_saves')).toMatchObject({ op: 'delete', filters: { post_id: 'p1', user_id: 'me' } });
  });
});

describe('every Dispatch act has a handler', () => {
  it('an unregistered type is refused loudly rather than dropped', async () => {
    await expect(run('file_a_manifesto', {})).rejects.toThrow();
  });

  it('all twelve run without throwing on a well-formed payload', async () => {
    // The blunt check that would have caught "this handler was never once
    // executed" — which was true of all twelve until this file existed.
    const payloads: [string, Record<string, unknown>][] = [
      ['add_filing', { _tempId: 't', kind: 'take', user_id: 'me', body: 'b' }],
      ['update_filing', { id: 'p', user_id: 'me', kind: 'take', updates: { body: 'b' } }],
      ['end_filing', { id: 'p' }],
      ['add_critique', { _tempId: 'c', post_id: 'p', user_id: 'me', body: 'b' }],
      ['update_critique', { id: 'c', user_id: 'me', body: 'b' }],
      ['remove_critique', { id: 'c', user_id: 'me' }],
      ['certify_filing', { post_id: 'p', desired_state: true }],
      ['certify_critique', { comment_id: 'c', desired_state: true }],
      ['cast_vote', { post_id: 'p', user_id: 'me', option_index: 0 }],
      ['take_answer', { post_id: 'p', user_id: 'me', answer_id: null }],
      ['save_filing', { post_id: 'p', user_id: 'me' }],
      ['unsave_filing', { post_id: 'p', user_id: 'me' }],
    ];
    for (const [type, payload] of payloads) {
      mockCalls.length = 0;
      mockSingle = null;              // "not certified yet", so the toggles act
      await expect(run(type, payload)).resolves.toBeDefined();
    }
  });
});
