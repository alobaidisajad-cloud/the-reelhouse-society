/**
 * aQueuedStackIsSavedAsTheMemberLeftIt.test.ts — utils/mutationExecutor.ts, the replays of a
 * stack, a watchlist and a shelf: a stack made offline is saved whole in one call, its title and
 * description cleaned and cut, unnamed choices as private-no and ranked-no, its films in either
 * shape a queue may hold (a film's own place kept, else its place in the list), and the queue told
 * which id its stand-in became; an edit sends only what it names, the rest as "unchanged" (null). A
 * film taken out is deleted from its own stack, and the films after it are written in their new
 * places. Films added, restored or listed are written by stack and film. A critique of a stack is
 * cleaned and cut; one is removed only by its author. A watchlist entry writes only what it names;
 * a shelf entry made with no formats is made with none; one removed or changed is the member's
 * own film alone.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { executeMutation } from '../mutationExecutor';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const LIST = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OTHER_LIST = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const COMMENT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

type Row = Record<string, unknown>;

/** What save_stack answers. */
let mockStack: unknown = null;
/** Each rpc as it was called. */
const rpcs: [string, Row][] = [];
/** Each upsert's options (the fake does not keep them): written down as they pass. */
const upserts: { table: string; options: unknown }[] = [];

const build = (rows: Record<string, Row[]> = {}) => {
  const house = supabaseFake({
    rows,
    rpc: {
      save_stack: (args: Row) => { rpcs.push(['save_stack', args]); return mockStack; },
      delete_list_cascade: (args: Row) => { rpcs.push(['delete_list_cascade', args]); return null; },
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
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: null }) } }));

const replay = (type: string, payload: Row) =>
  executeMutation({ id: 'q1', type: type as never, payload, timestamp: 0 }, {});

const asked = () => mockHouse.asked.map(({ table, op, columns, filters, values }) => ({ table, op, columns, filters, values }));

/** A queue's films in both shapes, the last named by its id alone. */
const FILMS = [
  { film_id: 7, film_title: 'Seven', poster_path: '/7.jpg', rank_position: 5 },
  { id: 9, title: 'Nine', poster: '/9.jpg' },
  { id: 10 },
];
const SAVED_FILMS = [
  { film_id: 7, film_title: 'Seven', poster_path: '/7.jpg', rank_position: 5 },
  { film_id: 9, film_title: 'Nine', poster_path: '/9.jpg', rank_position: 1 },
  { film_id: 10, film_title: 'Unknown', poster_path: null, rank_position: 2 },
];

beforeEach(() => {
  mockStack = { id: LIST };
  rpcs.length = 0;
  upserts.length = 0;
  mockHouse = build();
});

describe('a stack made offline', () => {
  it('is saved whole in one call, its words cleaned and cut, its films in their places', async () => {
    const out = await replay('create_list', {
      id: LIST, _tempId: 'temp-list', user_id: ME,
      title: `  ${'t'.repeat(101)}`, description: 'd'.repeat(1001),
      is_private: true, is_ranked: true, films: FILMS,
    });
    expect(rpcs).toStrictEqual([['save_stack', {
      p_id: LIST, p_title: 't'.repeat(100), p_description: 'd'.repeat(1000),
      p_is_private: true, p_is_ranked: true, p_films: SAVED_FILMS, p_create: true,
    }]]);
    expect(out).toStrictEqual({ newId: LIST, fakeId: 'temp-list' });
    expect(mockHouse.asked).toEqual([]);
  });

  it('is saved with no title, no description, public, unranked and empty when it named none of them', async () => {
    const out = await replay('create_list', { id: LIST, user_id: ME });
    expect(rpcs).toStrictEqual([['save_stack', {
      p_id: LIST, p_title: null, p_description: null, p_is_private: false, p_is_ranked: false, p_films: [], p_create: true,
    }]]);
    expect(out).toStrictEqual({});
  });

  it('renames its stand-in to the id the house answered with', async () => {
    mockStack = { id: OTHER_LIST };
    await expect(replay('create_list', { id: LIST, _tempId: 'temp-list', user_id: ME })).resolves.toStrictEqual({ newId: OTHER_LIST, fakeId: 'temp-list' });
  });

  it('renames its stand-in to its own id when the house answered with no stack', async () => {
    mockStack = null;
    await expect(replay('create_list', { id: LIST, _tempId: 'temp-list', user_id: ME })).resolves.toStrictEqual({ newId: LIST, fakeId: 'temp-list' });
  });

  it('is deleted in one call, by its id', async () => {
    await replay('delete_list', { list_id: LIST, user_id: ME });
    expect(rpcs).toStrictEqual([['delete_list_cascade', { p_list_id: LIST }]]);
  });
});

describe('a stack edited offline', () => {
  it('sends what the edit names, its words cleaned and cut, and exactly its films', async () => {
    await replay('update_list', {
      list_id: LIST, user_id: ME, films: FILMS,
      updates: { title: 't'.repeat(101), description: ` ${'d'.repeat(1001)}`, is_private: false, is_ranked: true },
    });
    expect(rpcs).toStrictEqual([['save_stack', {
      p_id: LIST, p_title: 't'.repeat(100), p_description: 'd'.repeat(1000),
      p_is_private: false, p_is_ranked: true, p_films: SAVED_FILMS,
    }]]);
  });

  it('sends everything the edit does not name as unchanged', async () => {
    await replay('update_list', { list_id: LIST, user_id: ME, updates: {} });
    expect(rpcs).toStrictEqual([['save_stack', {
      p_id: LIST, p_title: null, p_description: null, p_is_private: null, p_is_ranked: null, p_films: null,
    }]]);
  });
});

describe('a stack\'s films', () => {
  const held = (list_id: string, film_id: number, rank_position: number) => ({ list_id, film_id, film_title: `Film ${film_id}`, rank_position });

  it('takes a film out of its own stack alone, and writes the films after it in their new places', async () => {
    mockHouse = build({ list_items: [held(LIST, 550, 0), held(LIST, 7, 1), held(OTHER_LIST, 550, 0)] });
    await replay('remove_film_from_list', {
      list_id: LIST, film_id: 550,
      trailing_films: [
        { film_id: 7, film_title: 'Seven', poster_path: '/7.jpg', rank_position: 0 },
        { id: 9, title: 'Nine', poster: '/9.jpg', rank_position: 1 },
        { id: 10, rank_position: 2 },
      ],
    });
    expect(asked()).toStrictEqual([
      { table: 'list_items', op: 'delete', columns: [], filters: [['eq', 'list_id', LIST], ['eq', 'film_id', 550]], values: null },
      { table: 'list_items', op: 'upsert', columns: [], filters: [], values: [
        { list_id: LIST, film_id: 7, film_title: 'Seven', poster_path: '/7.jpg', rank_position: 0 },
        { list_id: LIST, film_id: 9, film_title: 'Nine', poster_path: '/9.jpg', rank_position: 1 },
        { list_id: LIST, film_id: 10, film_title: 'Unknown', poster_path: null, rank_position: 2 },
      ] },
    ]);
    expect(upserts).toEqual([{ table: 'list_items', options: { onConflict: 'list_id,film_id' } }]);
    expect(mockHouse.rows('list_items').filter((r) => r.film_id === 550)).toEqual([held(OTHER_LIST, 550, 0)]);
  });

  it.each([
    ['no films after it', []],
    ['an older payload with no list of them', undefined],
  ])('only takes the film out when there are %s', async (_what, trailing) => {
    mockHouse = build({ list_items: [held(LIST, 550, 0)] });
    await replay('remove_film_from_list', { list_id: LIST, film_id: 550, trailing_films: trailing });
    expect(asked().map((a) => a.op)).toEqual(['delete']);
    expect(mockHouse.rows('list_items')).toEqual([]);
  });

  it('adds a film by stack and film, in its place', async () => {
    await replay('add_film_to_list', { list_id: LIST, film_id: 7, film_title: 'Seven', poster_path: '/7.jpg', rank_position: 3 });
    expect(asked()).toStrictEqual([{ table: 'list_items', op: 'upsert', columns: [], filters: [], values: [
      { list_id: LIST, film_id: 7, film_title: 'Seven', poster_path: '/7.jpg', rank_position: 3 },
    ] }]);
    expect(upserts).toEqual([{ table: 'list_items', options: { onConflict: 'list_id,film_id' } }]);
  });

  it.each(['add_list_items', 'restore_list_items'])('%s writes each film by stack and film, in its place', async (type) => {
    await replay(type, { list_id: LIST, items: [
      { film_id: 7, film_title: 'Seven', poster_path: '/7.jpg', rank_position: 0 },
      { film_id: 9, film_title: 'Nine', poster_path: null, rank_position: 1 },
    ] });
    expect(asked()).toStrictEqual([{ table: 'list_items', op: 'upsert', columns: [], filters: [], values: [
      { list_id: LIST, film_id: 7, film_title: 'Seven', poster_path: '/7.jpg', rank_position: 0 },
      { list_id: LIST, film_id: 9, film_title: 'Nine', poster_path: null, rank_position: 1 },
    ] }]);
    expect(upserts).toEqual([{ table: 'list_items', options: { onConflict: 'list_id,film_id' } }]);
  });
});

describe('a critique of a stack', () => {
  it('is filed under its own id, cleaned and cut to a critique\'s length', async () => {
    await replay('add_list_comment', { id: COMMENT, list_id: LIST, user_id: ME, content: ` ${'c'.repeat(2001)}` });
    expect(asked()).toStrictEqual([{ table: 'list_comments', op: 'upsert', columns: [], filters: [], values: [
      { id: COMMENT, list_id: LIST, user_id: ME, content: 'c'.repeat(2000) },
    ] }]);
    expect(upserts).toEqual([{ table: 'list_comments', options: { onConflict: 'id', ignoreDuplicates: true } }]);
  });

  it('is removed by its id and its author alone', async () => {
    const theirs = { id: COMMENT, list_id: LIST, user_id: OTHER, content: 'c' };
    mockHouse = build({ list_comments: [theirs] });
    await replay('remove_list_comment', { comment_id: COMMENT, user_id: ME });
    expect(asked()).toStrictEqual([
      { table: 'list_comments', op: 'delete', columns: [], filters: [['eq', 'id', COMMENT], ['eq', 'user_id', ME]], values: null },
    ]);
    expect(mockHouse.rows('list_comments')).toEqual([theirs]);
    await replay('remove_list_comment', { comment_id: COMMENT, user_id: OTHER });
    expect(mockHouse.rows('list_comments')).toEqual([]);
  });
});

describe('a watchlist and a shelf', () => {
  it('writes a watchlist entry with only what it names', async () => {
    await replay('add_watchlist', { user_id: ME, film_id: 7, film_title: 'Seven' });
    expect(asked()).toStrictEqual([{ table: 'watchlists', op: 'insert', columns: [], filters: [], values: [
      { user_id: ME, film_id: 7, film_title: 'Seven' },
    ] }]);
  });

  it('makes a shelf entry queued with no formats with none, and no poster or year', async () => {
    mockHouse = build({ physical_archive: [] });
    await replay('add_archive', { user_id: ME, film_id: 7, film_title: 'Seven' });
    expect(mockHouse.rows('physical_archive')).toStrictEqual([
      { user_id: ME, film_id: 7, film_title: 'Seven', poster_path: null, year: null, formats: [] },
    ]);
  });

  it('takes the member\'s own film off the shelf alone', async () => {
    const mine = { user_id: ME, film_id: 7, film_title: 'Seven', formats: [] };
    const otherFilm = { ...mine, film_id: 9 };
    const theirs = { ...mine, user_id: OTHER };
    mockHouse = build({ physical_archive: [mine, otherFilm, theirs] });
    await replay('remove_archive', { user_id: ME, film_id: 7 });
    expect(asked()[0]?.filters).toEqual([['eq', 'user_id', ME], ['eq', 'film_id', 7]]);
    expect(mockHouse.rows('physical_archive')).toEqual([otherFilm, theirs]);
  });

  it('changes the member\'s own shelf entry alone', async () => {
    const mine = { user_id: ME, film_id: 7, film_title: 'Seven', formats: [], condition: 'good' };
    const theirs = { ...mine, user_id: OTHER };
    mockHouse = build({ physical_archive: [mine, theirs] });
    await replay('update_archive', { user_id: ME, film_id: 7, updates: { condition: 'worn' } });
    expect(asked()).toStrictEqual([{ table: 'physical_archive', op: 'update', columns: [], filters: [['eq', 'user_id', ME], ['eq', 'film_id', 7]], values: [{ condition: 'worn' }] }]);
    expect(mockHouse.rows('physical_archive')).toEqual([{ ...mine, condition: 'worn' }, theirs]);
  });
});
