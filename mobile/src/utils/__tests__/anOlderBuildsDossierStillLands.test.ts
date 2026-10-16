/**
 * anOlderBuildsDossierStillLands.test.ts — utils/mutationExecutor.ts, the dossier replays an
 * older build may still hold in its queue: an essay is filed with only what it carries, its title,
 * excerpt and essay each cut to their own lengths, and the queue told which id its stand-in became;
 * an edit writes only what it names, cut the same way, to the member's own essay alone; a deletion
 * takes the member's own alone. A comment is filed cleaned and cut, edited only in its words, and
 * removed only by its author. A certification is brought to the state the member left it in (sent
 * only when the house's differs), never with nobody signed in; a view is counted by the essay's id.
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { executeMutation } from '../mutationExecutor';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DOSSIER = '88888888-8888-4888-8888-888888888888';
const THEIR_DOSSIER = '99999999-9999-4999-8999-999999999999';
const COMMENT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CERT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type Row = Record<string, unknown>;

/** Each rpc as it was called. */
const rpcs: [string, Row][] = [];
const RPC = {
  toggle_dossier_certify: (args: Row) => { rpcs.push(['toggle_dossier_certify', args]); return true; },
  increment_dossier_views: (args: Row) => { rpcs.push(['increment_dossier_views', args]); return null; },
};
/** An insert the house answers with the id it gave. */
const filedAs = (id: string | null) => (ask: Ask) => (ask.op === 'insert' && id ? [{ id }] : []);

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

beforeEach(() => {
  rpcs.length = 0;
  mockSession = { access_token: 'jwt', user: { id: ME } };
  mockHouse = supabaseFake({ rpc: RPC });
});

describe('an essay', () => {
  it('is filed with what it carries, each of its words cut to its own length, and its stand-in renamed', async () => {
    mockHouse = supabaseFake({ answer: { dispatch_dossiers: filedAs(DOSSIER) } });
    const out = await replay('add_dossier', {
      _tempId: 'temp-dossier', user_id: ME, author_username: 'orson',
      title: ` ${'t'.repeat(201)}`, excerpt: 'e'.repeat(501), full_content: 'f'.repeat(25001),
      is_published: true, created_at: '2026-10-01T00:00:00Z',
    });
    expect(out).toStrictEqual({ newId: DOSSIER, fakeId: 'temp-dossier' });
    expect(asked()).toStrictEqual([{
      table: 'dispatch_dossiers', op: 'insert', columns: ['id'], filters: [], one: 'maybeSingle',
      values: [{
        user_id: ME, author_username: 'orson', title: 't'.repeat(200), excerpt: 'e'.repeat(500),
        full_content: 'f'.repeat(25000), is_published: true, created_at: '2026-10-01T00:00:00Z',
      }],
    }]);
  });

  it('is filed with only what it carries, and nothing to rename without a stand-in', async () => {
    mockHouse = supabaseFake({ answer: { dispatch_dossiers: filedAs(DOSSIER) } });
    await expect(replay('add_dossier', { user_id: ME })).resolves.toStrictEqual({});
    expect(asked()[0]?.values).toStrictEqual([{ user_id: ME }]);
  });

  const ESSAYS = () => ({ dispatch_dossiers: [
    { id: DOSSIER, user_id: ME, title: 'Old', excerpt: 'Old excerpt', full_content: 'Old essay' },
    { id: THEIR_DOSSIER, user_id: OTHER, title: 'Theirs' },
  ] });

  it('is edited in its title alone, cut to a title\'s length, the member\'s own essay alone', async () => {
    mockHouse = supabaseFake({ rows: ESSAYS() });
    await replay('update_dossier', { id: DOSSIER, user_id: ME, updates: { title: 't'.repeat(201) } });
    expect(asked()).toStrictEqual([{
      table: 'dispatch_dossiers', op: 'update', columns: [], filters: [['eq', 'id', DOSSIER], ['eq', 'user_id', ME]], one: null,
      values: [{ title: 't'.repeat(200) }],
    }]);
  });

  it('is edited in its excerpt and essay, each cut to its own length', async () => {
    mockHouse = supabaseFake({ rows: ESSAYS() });
    await replay('update_dossier', { id: DOSSIER, user_id: ME, updates: { excerpt: ` ${'e'.repeat(501)}`, full_content: 'f'.repeat(25001) } });
    expect(asked()[0]?.values).toStrictEqual([{ excerpt: 'e'.repeat(500), full_content: 'f'.repeat(25000) }]);
  });

  it('is deleted by its id and its author alone', async () => {
    mockHouse = supabaseFake({ rows: ESSAYS() });
    await replay('delete_dossier', { id: THEIR_DOSSIER, user_id: ME });
    expect(asked()[0]?.filters).toEqual([['eq', 'id', THEIR_DOSSIER], ['eq', 'user_id', ME]]);
    expect(mockHouse.rows('dispatch_dossiers')).toHaveLength(2);
    await replay('delete_dossier', { id: DOSSIER, user_id: ME });
    expect(mockHouse.rows('dispatch_dossiers').map((r) => r.id)).toEqual([THEIR_DOSSIER]);
  });
});

describe('a comment on an essay', () => {
  const comment = { dossier_id: DOSSIER, user_id: ME, username: 'orson', body: `  ${'b'.repeat(2001)}` };

  it('is filed cleaned and cut to a comment\'s length, and its stand-in renamed', async () => {
    mockHouse = supabaseFake({ answer: { dossier_comments: filedAs(COMMENT) } });
    await expect(replay('add_dossier_comment', { ...comment, _tempId: 'temp-c' })).resolves.toStrictEqual({ newId: COMMENT, fakeId: 'temp-c' });
    expect(asked()).toStrictEqual([{
      table: 'dossier_comments', op: 'insert', columns: ['id'], filters: [], one: 'maybeSingle',
      values: [{ dossier_id: DOSSIER, user_id: ME, username: 'orson', body: 'b'.repeat(2000) }],
    }]);
  });

  it('reports nothing to rename without a stand-in', async () => {
    mockHouse = supabaseFake({ answer: { dossier_comments: filedAs(COMMENT) } });
    await expect(replay('add_dossier_comment', comment)).resolves.toStrictEqual({});
  });

  it('reports nothing to rename when the house answered with no row', async () => {
    mockHouse = supabaseFake({ answer: { dossier_comments: filedAs(null) } });
    await expect(replay('add_dossier_comment', { ...comment, _tempId: 'temp-c' })).resolves.toStrictEqual({});
  });

  const COMMENTS = () => ({ dossier_comments: [
    { id: COMMENT, dossier_id: DOSSIER, user_id: ME, username: 'orson', body: 'Old words' },
  ] });

  it('is edited in its words, cleaned and cut, the member\'s own alone', async () => {
    mockHouse = supabaseFake({ rows: COMMENTS() });
    await replay('update_dossier_comment', { id: COMMENT, user_id: ME, updates: { body: ` ${'b'.repeat(2001)}` } });
    expect(asked()).toStrictEqual([{
      table: 'dossier_comments', op: 'update', columns: [], filters: [['eq', 'id', COMMENT], ['eq', 'user_id', ME]], one: null,
      values: [{ body: 'b'.repeat(2000) }],
    }]);
    expect(mockHouse.rows('dossier_comments')[0]?.body).toBe('b'.repeat(2000));
  });

  it('keeps its words when the edit names none', async () => {
    mockHouse = supabaseFake({ rows: COMMENTS() });
    await replay('update_dossier_comment', { id: COMMENT, user_id: ME, updates: {} });
    expect(asked()[0]?.values).toStrictEqual([{}]);
    expect(mockHouse.rows('dossier_comments')[0]?.body).toBe('Old words');
  });

  it('is removed by its id and its author alone', async () => {
    mockHouse = supabaseFake({ rows: COMMENTS() });
    await replay('delete_dossier_comment', { comment_id: COMMENT, user_id: OTHER });
    expect(asked()[0]?.filters).toEqual([['eq', 'id', COMMENT], ['eq', 'user_id', OTHER]]);
    expect(mockHouse.rows('dossier_comments')).toHaveLength(1);
    await replay('delete_dossier_comment', { comment_id: COMMENT, user_id: ME });
    expect(mockHouse.rows('dossier_comments')).toEqual([]);
  });
});

describe('a certification of an essay', () => {
  const certified = (who: string) => ({ id: CERT, user_id: who, dossier_id: DOSSIER });

  it.each([
    ['nobody is signed in', null],
    ['the session names no member', { access_token: 'jwt' }],
  ])('is left as it is when %s', async (_when, session) => {
    mockSession = session;
    await expect(replay('toggle_dossier_certify', { dossier_uuid: DOSSIER, desired_state: true })).resolves.toStrictEqual({});
    expect(mockHouse.asked).toEqual([]);
    expect(rpcs).toEqual([]);
  });

  it('reads whether the member has certified this essay', async () => {
    mockHouse = supabaseFake({ rows: { dossier_certifications: [certified(ME)] }, rpc: RPC });
    await replay('toggle_dossier_certify', { dossier_uuid: DOSSIER, desired_state: true });
    expect(asked()).toStrictEqual([{
      table: 'dossier_certifications', op: 'select', columns: ['id'], filters: [['eq', 'dossier_id', DOSSIER], ['eq', 'user_id', ME]], one: 'maybeSingle', values: null,
    }]);
  });

  it.each([
    ['certified', 'certified', [certified(ME)], true, false],
    ['certified', 'not certified', [certified(ME)], false, true],
    ['not certified', 'certified', [certified(OTHER)], true, true],
    ['not certified', 'not certified', [certified(OTHER)], false, false],
  ])('is %s on the house and wanted %s: toggled only when the two differ', async (_held, _wanted, rows, desired, toggles) => {
    mockHouse = supabaseFake({ rows: { dossier_certifications: rows }, rpc: RPC });
    await expect(replay('toggle_dossier_certify', { dossier_uuid: DOSSIER, desired_state: desired })).resolves.toStrictEqual({});
    expect(rpcs).toEqual(toggles ? [['toggle_dossier_certify', { dossier_uuid: DOSSIER }]] : []);
  });

  it('counts a view by the essay\'s id', async () => {
    await expect(replay('increment_dossier_views', { dossier_uuid: DOSSIER })).resolves.toStrictEqual({});
    expect(rpcs).toEqual([['increment_dossier_views', { dossier_uuid: DOSSIER }]]);
  });
});
