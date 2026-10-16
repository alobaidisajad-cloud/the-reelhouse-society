/**
 * aQueuedFilingIsCutToEachColumn.test.ts — utils/mutationExecutor.ts, the Dispatch replays: a
 * filing is written with each of its words cut to its own column's length (a dossier's body to an
 * excerpt's, any other kind's to a body's), and a ballot's every option title cut while what is not
 * an option is left as it was. An amendment cuts the body by the kind it was lent, the tighter cap
 * when it was lent none. An amendment, an edited critique or a taken answer that changed no row is
 * refused, named by its act; a failure the house gave is raised as it came. A critique is cut to a
 * critique's length. A mark on a critique is brought to the state the member left it in, never
 * with nobody signed in. A report reaches the moderators with its details cleaned and cut.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { executeMutation } from '../mutationExecutor';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const POST = '12121212-1212-4212-8212-121212121212';
const CRITIQUE = '34343434-3434-4434-8434-343434343434';
const ANSWER = '56565656-5656-4656-8656-565656565656';
const CERT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type Row = Record<string, unknown>;

const rpcs: [string, Row][] = [];
const RPC = { submit_report: (args: Row) => { rpcs.push(['submit_report', args]); return CERT; } };

let mockHouse = supabaseFake({ rpc: RPC });
let mockSession: Row | null = null;
jest.mock('@/src/lib/supabase', () => ({
  get supabase() { return { ...mockHouse.client, auth: { getSession: async () => ({ data: { session: mockSession } }) } }; },
}));
jest.mock('@/src/components/lobby/wallRead', () => ({ wallMayHaveChanged: jest.fn() }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: null }) } }));

const replay = (type: string, payload: Row) =>
  executeMutation({ id: 'q1', type: type as never, payload, timestamp: 0 }, {});

const asked = () => mockHouse.asked.map(({ table, op, columns, filters, one, values }) => ({ table, op, columns, filters, one, values }));

const x = (n: number, c = 'x') => c.repeat(n);

beforeEach(() => {
  rpcs.length = 0;
  mockSession = { access_token: 'jwt', user: { id: ME } };
  mockHouse = supabaseFake({ rows: { dispatch_posts: [] }, rpc: RPC });
});

describe('a filing made offline', () => {
  it('is written under its stand-in\'s id with each of its words cut to its own column', async () => {
    const out = await replay('add_filing', {
      _tempId: POST, kind: 'take', user_id: ME,
      title: x(201), body: x(2001), full_content: x(25001), source: x(101), source_url: x(2049),
      spoiler_label: x(81), series_title: x(201), subject_title: x(301), subject_sub: x(301),
      subject_image: x(2049), subject_backdrop: x(2049),
    });
    expect(out).toStrictEqual({ newId: POST, fakeId: POST });
    expect(asked()).toStrictEqual([{
      table: 'dispatch_posts', op: 'insert', columns: ['id'], filters: [], one: 'maybeSingle',
      values: [{
        id: POST, kind: 'take', user_id: ME, author_username: '',
        title: x(200), body: x(2000), full_content: x(25000), source: x(100), source_url: x(2048),
        spoiler_label: x(80), series_title: x(200), subject_title: x(300), subject_sub: x(300),
        subject_image: x(2048), subject_backdrop: x(2048),
      }],
    }]);
  });

  it('cuts a dossier\'s body to an excerpt\'s length', async () => {
    await replay('add_filing', { _tempId: POST, kind: 'dossier', user_id: ME, body: x(501) });
    expect(mockHouse.rows('dispatch_posts')[0]?.body).toBe(x(500));
  });

  it('leaves any other kind\'s body its full length', async () => {
    await replay('add_filing', { _tempId: POST, kind: 'take', user_id: ME, body: x(1000) });
    expect(mockHouse.rows('dispatch_posts')[0]?.body).toBe(x(1000));
  });

  it('cuts each ballot option\'s title, and leaves what is not an option, or names no title, as it was', async () => {
    await replay('add_filing', {
      _tempId: POST, kind: 'ballot', user_id: ME, body: 'Which?',
      options: [null, 'Vertigo', 7, { title: ` ${x(201, 'o')}`, film_id: 5 }, { film_id: 6 }],
    });
    expect(mockHouse.rows('dispatch_posts')[0]?.options).toStrictEqual([null, 'Vertigo', 7, { title: x(200, 'o'), film_id: 5 }, { film_id: 6 }]);
  });
});

describe('an amendment', () => {
  const held = () => ({ dispatch_posts: [{ id: POST, kind: 'take', user_id: ME, author_username: 'orson', body: 'Old' }] });

  it('cuts the body by the kind it was lent, writes only what it names, and stamps both times as one', async () => {
    mockHouse = supabaseFake({ rows: held() });
    await replay('update_filing', { id: POST, user_id: ME, kind: 'take', updates: { title: x(201), body: x(1000) } });
    expect(asked()).toStrictEqual([{
      table: 'dispatch_posts', op: 'update', columns: ['id'], filters: [['eq', 'id', POST], ['eq', 'user_id', ME]], one: null,
      values: [{ title: x(200), body: x(1000), updated_at: expect.any(String), edited_at: expect.any(String) }],
    }]);
    const [patch] = asked()[0]?.values ?? [];
    expect(patch?.edited_at).toBe(patch?.updated_at);
  });

  it('cuts the body to an excerpt\'s length when it was lent no kind', async () => {
    mockHouse = supabaseFake({ rows: held() });
    await replay('update_filing', { id: POST, user_id: ME, updates: { body: x(501) } });
    expect(mockHouse.rows('dispatch_posts')[0]?.body).toBe(x(500));
  });

  it.each([
    ['update_filing', { id: POST, user_id: OTHER, kind: 'take', updates: { body: 'b' } }, 'dispatch_posts'],
    ['update_critique', { id: CRITIQUE, user_id: OTHER, body: 'b' }, 'dispatch_comments'],
    ['take_answer', { post_id: POST, user_id: OTHER, answer_id: ANSWER }, 'dispatch_posts'],
  ])('%s that changed no row is refused, named by its act', async (type, payload, table) => {
    mockHouse = supabaseFake({ rows: { ...held(), dispatch_comments: [{ id: CRITIQUE, post_id: POST, user_id: ME, author_username: 'orson', body: 'Old' }] } });
    await expect(replay(type, payload)).rejects.toThrow(new Error(`${type}: the house refused it — the filing is withheld, ended, or not yours`));
    expect(asked()[0]).toEqual(expect.objectContaining({ table, op: 'update', columns: ['id'] }));
  });

  it.each([
    ['update_filing', { id: POST, user_id: ME, kind: 'take', updates: { body: 'b' } }, 'dispatch_posts'],
    ['update_critique', { id: CRITIQUE, user_id: ME, body: 'b' }, 'dispatch_comments'],
    ['take_answer', { post_id: POST, user_id: ME, answer_id: ANSWER }, 'dispatch_posts'],
  ])('%s raises the failure the house gave, as it came', async (type, payload, table) => {
    const failure = { code: '57014', message: 'canceling statement due to statement timeout' };
    mockHouse = supabaseFake({ fail: { [table]: failure } });
    await expect(replay(type, payload)).rejects.toBe(failure);
  });

  it('takes an answer on the seeker\'s own filing, by its id', async () => {
    mockHouse = supabaseFake({ rows: held() });
    await replay('take_answer', { post_id: POST, user_id: ME, answer_id: ANSWER });
    expect(asked()).toStrictEqual([{
      table: 'dispatch_posts', op: 'update', columns: ['id'], filters: [['eq', 'id', POST], ['eq', 'user_id', ME]], one: null, values: [{ answer_id: ANSWER }],
    }]);
  });
});

describe('a critique', () => {
  it('is filed under its stand-in\'s id, cut to a critique\'s length', async () => {
    mockHouse = supabaseFake({ rows: { dispatch_comments: [] } });
    const out = await replay('add_critique', { _tempId: CRITIQUE, post_id: POST, user_id: ME, author_username: 'orson', body: ` ${x(2001)}` });
    expect(out).toStrictEqual({ newId: CRITIQUE, fakeId: CRITIQUE });
    expect(asked()).toStrictEqual([{
      table: 'dispatch_comments', op: 'insert', columns: ['id'], filters: [], one: 'maybeSingle',
      values: [{ id: CRITIQUE, post_id: POST, user_id: ME, author_username: 'orson', body: x(2000) }],
    }]);
  });

  it('is edited cut to a critique\'s length, the author\'s own alone', async () => {
    mockHouse = supabaseFake({ rows: { dispatch_comments: [{ id: CRITIQUE, post_id: POST, user_id: ME, author_username: 'orson', body: 'Old' }] } });
    await replay('update_critique', { id: CRITIQUE, user_id: ME, body: x(2001) });
    expect(asked()).toStrictEqual([{
      table: 'dispatch_comments', op: 'update', columns: ['id'], filters: [['eq', 'id', CRITIQUE], ['eq', 'user_id', ME]], one: null,
      values: [{ body: x(2000), edited_at: expect.any(String) }],
    }]);
  });
});

describe('a mark on a filing or a critique', () => {
  const marks = (row: Row) => ({ dispatch_certifications: [{ id: CERT, user_id: ME, ...row }, { id: ANSWER, user_id: OTHER, ...row }] });

  it.each([
    ['nobody is signed in', null],
    ['the session names no member', { access_token: 'jwt' }],
  ])('is left as it is when %s', async (_when, session) => {
    mockSession = session;
    await expect(replay('certify_critique', { comment_id: CRITIQUE, desired_state: true })).resolves.toStrictEqual({});
    await expect(replay('certify_filing', { post_id: POST, desired_state: true })).resolves.toStrictEqual({});
    expect(mockHouse.asked).toEqual([]);
  });

  it('on a filing, reads the member\'s own mark of it first', async () => {
    mockHouse = supabaseFake({ rows: marks({ post_id: POST }) });
    await replay('certify_filing', { post_id: POST, desired_state: true });
    expect(asked()).toStrictEqual([{
      table: 'dispatch_certifications', op: 'select', columns: ['id'], filters: [['eq', 'post_id', POST], ['eq', 'user_id', ME]], one: 'maybeSingle', values: null,
    }]);
  });

  it('on a critique, reads the member\'s own mark of it, and writes nothing when it is already as wanted', async () => {
    mockHouse = supabaseFake({ rows: marks({ comment_id: CRITIQUE }) });
    await replay('certify_critique', { comment_id: CRITIQUE, desired_state: true });
    expect(asked()).toStrictEqual([{
      table: 'dispatch_certifications', op: 'select', columns: ['id'], filters: [['eq', 'comment_id', CRITIQUE], ['eq', 'user_id', ME]], one: 'maybeSingle', values: null,
    }]);
  });

  it('on a critique, is made when wanted and missing', async () => {
    mockHouse = supabaseFake({ rows: { dispatch_certifications: [] } });
    await replay('certify_critique', { comment_id: CRITIQUE, desired_state: true });
    expect(asked()[1]).toStrictEqual({ table: 'dispatch_certifications', op: 'insert', columns: [], filters: [], one: null, values: [{ user_id: ME, comment_id: CRITIQUE }] });
  });

  it('on a critique, is taken back when unwanted, the member\'s own alone', async () => {
    mockHouse = supabaseFake({ rows: marks({ comment_id: CRITIQUE }) });
    await replay('certify_critique', { comment_id: CRITIQUE, desired_state: false });
    expect(asked().slice(1)).toStrictEqual([{
      table: 'dispatch_certifications', op: 'delete', columns: [], filters: [['eq', 'comment_id', CRITIQUE], ['eq', 'user_id', ME]], one: null, values: null,
    }]);
    expect(mockHouse.rows('dispatch_certifications')).toEqual([{ id: ANSWER, user_id: OTHER, comment_id: CRITIQUE }]);
  });
});

describe('a report', () => {
  const report = { reporter_id: ME, content_id: POST, content_type: 'filing', reason: 'spam', target_user_id: OTHER };

  it('reaches the moderators with its details cleaned and cut', async () => {
    await expect(replay('submit_report', { ...report, details: ` ${x(501, 'd')}` })).resolves.toStrictEqual({});
    expect(rpcs).toStrictEqual([['submit_report', {
      p_reporter_id: ME, p_content_id: POST, p_content_type: 'filing', p_reason: 'spam', p_details: x(500, 'd'), p_target_user_id: OTHER,
    }]]);
  });

  it('reaches them with no details when it carried none as words', async () => {
    await replay('submit_report', { ...report, details: 42 });
    expect(rpcs[0]?.[1]?.p_details).toBeNull();
  });
});
