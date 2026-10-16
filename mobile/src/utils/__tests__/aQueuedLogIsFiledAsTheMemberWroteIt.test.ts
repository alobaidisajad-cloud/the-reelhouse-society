/**
 * aQueuedLogIsFiledAsTheMemberWroteIt.test.ts — utils/mutationExecutor.ts, the replays of a log
 * and of what hangs on it: `add_log` and `mark_watched` file the log under the id the phone gave
 * it, its words cleaned each by its own cap, and nothing it never said, nor the decade and genres
 * an older build's log carried (a log has neither column); a log another device filed
 * first becomes a rewatch of that one (a log already filed under the same id is left alone), and
 * any other failure is raised. `update_log` writes only what the edit names. `remove_log` deletes
 * the member's own log alone. A comment on a log is filed under its own id, signed with the
 * member's handle, and removed only by its author. A viewing's note is cleaned, and a note that is
 * not words is written empty.
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { executeMutation } from '../mutationExecutor';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const LOG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const THEIR_LOG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VIEWING = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
const COMMENT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

type Row = Record<string, unknown>;
type Failure = { code: string; message: string };

/** What the insert into logs answers: the row, or a failure. */
let mockInsert: Failure | null = null;
/** The logs a read finds. */
let mockLogs: Row[] = [];
/** Each rpc as it was called. */
const rpcs: [string, Row][] = [];
/** Each upsert's options (the fake does not keep them): written down as they pass. */
const upserts: { table: string; options: unknown }[] = [];

const build = (rows: Record<string, Row[]> = {}) => {
  const house = supabaseFake({
    rows,
    answer: {
      logs: (ask: Ask) => {
        if (ask.op === 'insert') return mockInsert ?? ask.values ?? [];
        if (ask.op === 'select') return mockLogs.filter((r) => ask.filters.every(([, c, v]) => r[c] === v));
        return [];
      },
    },
    rpc: {
      log_viewing_add: (args: Row) => { rpcs.push(['log_viewing_add', args]); return args.p_viewing_id; },
      viewing_note_set: (args: Row) => { rpcs.push(['viewing_note_set', args]); return null; },
    },
  });
  const from = house.client.from;
  house.client.from = (table: string) => {
    const q = from(table);
    const upsert = q.upsert;
    q.upsert = (values, options) => { upserts.push({ table, options }); return upsert(values, options); };
    return q;
  };
  return house;
};

let mockHouse = build();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/components/lobby/wallRead', () => ({ wallMayHaveChanged: jest.fn() }));
let mockUser: Row | null = null;
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: mockUser }) } }));

const replay = (type: string, payload: Row) =>
  executeMutation({ id: 'q1', type: type as never, payload, timestamp: 0 }, {});

/** What each query asked, in the parts these tests read. */
const asked = () => mockHouse.asked.map(({ table, op, columns, filters, one, values }) => ({ table, op, columns, filters, one, values }));

const LOGGED = { id: LOG, viewing_id: VIEWING, user_id: ME, film_id: 11, film_title: 'Sunrise', rating: 4, watched_date: '2026-10-01' };
/** The log another device filed first, under another id. */
const THEIRS = { id: THEIR_LOG, user_id: ME, film_id: 11, film_title: 'Sunrise', watched_date: '2026-09-01', view_count: 1 };

beforeEach(() => {
  mockInsert = null;
  mockLogs = [];
  mockUser = null;
  rpcs.length = 0;
  upserts.length = 0;
  mockHouse = build();
});

describe('a log filed offline', () => {
  it('is filed under the id the phone gave it, and the queue is told which id its stand-in became', async () => {
    const out = await replay('add_log', { ...LOGGED, _fakeId: 'temp-log', _tempId: 'temp-other' });
    expect(out).toStrictEqual({ newId: LOG, fakeId: 'temp-log' });
    expect(asked()).toStrictEqual([
      { table: 'logs', op: 'insert', columns: ['id'], filters: [], one: 'maybeSingle', values: [LOGGED] },
    ]);
  });

  it('reports nothing to rename when the phone kept no stand-in', async () => {
    await expect(replay('mark_watched', LOGGED)).resolves.toStrictEqual({});
  });

  it('writes the log\'s words cleaned, each to its own cap, and a companion of only spaces as no one', async () => {
    await replay('mark_watched', {
      ...LOGGED,
      review: `  ${'r'.repeat(5001)}`,
      private_notes: 'n'.repeat(1001),
      pull_quote: 'p'.repeat(121),
      watched_with: '      ',
    });
    const [row] = asked()[0]?.values ?? [];
    expect(row).toStrictEqual({
      ...LOGGED,
      review: 'r'.repeat(5000),
      private_notes: 'n'.repeat(1000),
      pull_quote: 'p'.repeat(120),
      watched_with: null,
    });
  });

  it('writes who it was watched with as the member wrote it', async () => {
    await replay('add_log', { ...LOGGED, watched_with: 'Ann' });
    expect(asked()[0]?.values?.[0]?.watched_with).toBe('Ann');
  });

  it('files an older build\'s log that carried a decade and genres without them, never refused for them', async () => {
    const out = await replay('add_log', { ...LOGGED, decade: '1970s', genres: ['Drama'], _fakeId: 'temp-log' });
    expect(out).toStrictEqual({ newId: LOG, fakeId: 'temp-log' });
    expect(asked()[0]?.values).toStrictEqual([LOGGED]);
  });

  it('leaves out every field the log never said, so the house fills its own', async () => {
    await replay('add_log', LOGGED);
    expect(Object.keys(asked()[0]?.values?.[0] ?? {}).sort()).toEqual(['film_id', 'film_title', 'id', 'rating', 'user_id', 'viewing_id', 'watched_date']);
  });
});

describe('a log another device filed first', () => {
  it.each([
    ['its code', { code: '23505', message: 'conflict' }],
    ['the word "duplicate", in any case', { code: 'XX000', message: 'Duplicate key value' }],
    ['the word "unique", in any case', { code: 'XX000', message: 'UNIQUE constraint broken' }],
  ])('is known by %s, and this log becomes a rewatch of that one', async (_how, failure) => {
    mockInsert = failure;
    mockLogs = [THEIRS];
    const out = await replay('add_log', { ...LOGGED, _fakeId: 'temp-log' });
    expect(out).toStrictEqual({ newId: THEIR_LOG, fakeId: 'temp-log' });
    expect(rpcs).toEqual([['log_viewing_add', {
      p_log_id: THEIR_LOG, p_viewing_id: VIEWING, p_fields: { film_title: 'Sunrise', rating: 4, watched_date: '2026-10-01' },
    }]]);
  });

  it('reads that log by the member and the film, its id alone', async () => {
    mockInsert = { code: '23505', message: 'conflict' };
    mockLogs = [THEIRS];
    await replay('add_log', LOGGED);
    expect(asked()[1]).toStrictEqual({
      table: 'logs', op: 'select', columns: ['id'], filters: [['eq', 'user_id', ME], ['eq', 'film_id', 11]], one: 'maybeSingle', values: null,
    });
  });

  it('reports nothing to rename for a rewatch the phone kept no stand-in for', async () => {
    mockInsert = { code: '23505', message: 'conflict' };
    mockLogs = [THEIRS];
    await expect(replay('add_log', LOGGED)).resolves.toStrictEqual({});
    expect(rpcs).toHaveLength(1);
  });

  it('files the rewatch under the log\'s own id when the log named no viewing', async () => {
    mockInsert = { code: '23505', message: 'conflict' };
    mockLogs = [THEIRS];
    const { viewing_id: _v, ...noViewing } = LOGGED;
    await replay('add_log', noViewing);
    expect(rpcs[0]?.[1]).toEqual(expect.objectContaining({ p_log_id: THEIR_LOG, p_viewing_id: LOG }));
  });

  it('leaves a log already filed under the same id alone, and names it for the stand-in', async () => {
    mockInsert = { code: '23505', message: 'conflict' };
    mockLogs = [{ ...THEIRS, id: LOG }];
    await expect(replay('add_log', { ...LOGGED, _fakeId: 'temp-log' })).resolves.toStrictEqual({ newId: LOG, fakeId: 'temp-log' });
    expect(rpcs).toEqual([]);
  });

  it('leaves a log already filed under the same id alone, with nothing to rename when there is no stand-in', async () => {
    mockInsert = { code: '23505', message: 'conflict' };
    mockLogs = [{ ...THEIRS, id: LOG }];
    await expect(replay('add_log', LOGGED)).resolves.toStrictEqual({});
    expect(rpcs).toEqual([]);
  });

  it('reports done when the log that won is not found, and files no rewatch', async () => {
    mockInsert = { code: '23505', message: 'conflict' };
    mockLogs = [];
    await expect(replay('add_log', { ...LOGGED, _fakeId: 'temp-log' })).resolves.toStrictEqual({});
    expect(rpcs).toEqual([]);
  });

  it('raises any other failure as it came, and reads nothing', async () => {
    const refused = { code: '42501', message: 'permission denied for table logs' };
    mockInsert = refused;
    mockLogs = [THEIRS];
    await expect(replay('add_log', { ...LOGGED, _fakeId: 'temp-log' })).rejects.toBe(refused);
    expect(asked().map((a) => a.op)).toEqual(['insert']);
    expect(rpcs).toEqual([]);
  });
});

describe('a log edited or removed offline', () => {
  it('writes only what the edit names', async () => {
    mockHouse = build({ logs: [] });
    await replay('update_log', { id: LOG, updates: { rating: 4 } });
    expect(asked()).toStrictEqual([
      { table: 'logs', op: 'update', columns: [], filters: [['eq', 'id', LOG]], one: null, values: [{ rating: 4 }] },
    ]);
  });

  it('removes the member\'s own log, by its id and its owner', async () => {
    mockHouse = supabaseFake({ rows: { logs: [{ ...THEIRS, id: LOG, user_id: ME }] } });
    await replay('remove_log', { log_id: LOG, user_id: ME });
    expect(asked()).toStrictEqual([
      { table: 'logs', op: 'delete', columns: [], filters: [['eq', 'id', LOG], ['eq', 'user_id', ME]], one: null, values: null },
    ]);
    expect(mockHouse.rows('logs')).toEqual([]);
  });

  it('leaves another member\'s log of that id where it is', async () => {
    mockHouse = supabaseFake({ rows: { logs: [{ ...THEIRS, id: LOG, user_id: OTHER }] } });
    await replay('remove_log', { log_id: LOG, user_id: ME });
    expect(mockHouse.rows('logs')).toHaveLength(1);
  });

  it('removes by the id alone when an older payload names no owner', async () => {
    mockHouse = supabaseFake({ rows: { logs: [{ ...THEIRS, id: LOG }] } });
    await replay('remove_log', { log_id: LOG });
    expect(asked()[0]?.filters).toEqual([['eq', 'id', LOG]]);
    expect(mockHouse.rows('logs')).toEqual([]);
  });
});

describe('a comment on a log', () => {
  const comment = { id: COMMENT, log_id: LOG, user_id: ME, body: '  A quiet triumph.  ' };

  it('is filed under its own id, cleaned, signed with the handle it was queued with', async () => {
    mockHouse = build({ log_comments: [] });
    mockUser = { id: ME, username: 'orson' };
    await expect(replay('add_log_comment', { ...comment, username: 'kane' })).resolves.toStrictEqual({});
    expect(asked()).toStrictEqual([{
      table: 'log_comments', op: 'upsert', columns: ['id'], filters: [], one: 'maybeSingle',
      values: [{ id: COMMENT, log_id: LOG, user_id: ME, username: 'kane', body: 'A quiet triumph.' }],
    }]);
    expect(upserts).toEqual([{ table: 'log_comments', options: { onConflict: 'id' } }]);
  });

  it('is cut to a comment\'s length', async () => {
    mockHouse = build({ log_comments: [] });
    await replay('add_log_comment', { ...comment, username: 'kane', body: 'b'.repeat(2001) });
    expect(mockHouse.rows('log_comments')[0]?.body).toBe('b'.repeat(2000));
  });

  it('is signed with the signed-in member\'s handle when the queue kept none', async () => {
    mockHouse = build({ log_comments: [] });
    mockUser = { id: ME, username: 'orson' };
    await replay('add_log_comment', comment);
    expect(mockHouse.rows('log_comments')[0]?.username).toBe('orson');
  });

  it.each([
    ['nobody is signed in', null],
    ['the member has no handle', { id: ME }],
  ])('is signed "anonymous" when %s', async (_when, user) => {
    mockHouse = build({ log_comments: [] });
    mockUser = user;
    await replay('add_log_comment', comment);
    expect(mockHouse.rows('log_comments')[0]?.username).toBe('anonymous');
  });

  it('is removed by its id and its author alone', async () => {
    const theirs = { id: COMMENT, log_id: LOG, user_id: OTHER, username: 'kane', body: 'b' };
    mockHouse = supabaseFake({ rows: { log_comments: [theirs] } });
    await replay('remove_log_comment', { comment_id: COMMENT, user_id: ME });
    expect(asked()).toStrictEqual([
      { table: 'log_comments', op: 'delete', columns: [], filters: [['eq', 'id', COMMENT], ['eq', 'user_id', ME]], one: null, values: null },
    ]);
    expect(mockHouse.rows('log_comments')).toEqual([theirs]);
    await replay('remove_log_comment', { comment_id: COMMENT, user_id: OTHER });
    expect(mockHouse.rows('log_comments')).toEqual([]);
  });
});

describe('a viewing\'s note', () => {
  it('is written cleaned and cut to a note\'s length', async () => {
    await replay('set_viewing_note', { log_id: LOG, viewing_id: VIEWING, notes: ` ${'n'.repeat(1001)}` });
    expect(rpcs).toEqual([['viewing_note_set', { p_log_id: LOG, p_viewing_id: VIEWING, p_notes: 'n'.repeat(1000) }]]);
  });

  it.each([
    ['no note', {}],
    ['a note that is not words', { notes: 42 }],
  ])('is written empty when the queue holds %s', async (_what, note) => {
    await replay('set_viewing_note', { log_id: LOG, viewing_id: VIEWING, ...note });
    expect(rpcs).toEqual([['viewing_note_set', { p_log_id: LOG, p_viewing_id: VIEWING, p_notes: '' }]]);
  });
});
