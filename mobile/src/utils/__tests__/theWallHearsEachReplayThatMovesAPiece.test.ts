/**
 * theWallHearsEachReplayThatMovesAPiece.test.ts — utils/mutationExecutor.ts, `executeMutation`:
 * each of the nine replays that can change or take down a piece the Lobby hangs (a log edited or
 * removed, a viewing added or removed, a stack edited, deleted or a film taken out of it, a filing
 * amended or ended) asks for the wall again once the house has it, and only then; every other
 * replay leaves the wall alone. A kind of write it has no handler for is refused by name.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { executeMutation, UnknownMutationError } from '../mutationExecutor';

const ME = '11111111-1111-4111-8111-111111111111';
const LOG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VIEWING = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
const LIST = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const POST = '12121212-1212-4212-8212-121212121212';

const house = () => supabaseFake({
  rows: {
    logs: [],
    list_items: [],
    watchlists: [],
    dispatch_posts: [{ id: POST, kind: 'take', user_id: ME, author_username: 'orson', body: 'Old' }],
  },
  rpc: { log_viewing_add: VIEWING, log_viewing_remove: VIEWING, save_stack: { id: LIST }, delete_list_cascade: null, end_filing: null },
});
let mockHouse = house();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/components/lobby/wallRead', () => ({ wallMayHaveChanged: jest.fn() }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: null }) } }));
const { wallMayHaveChanged } = jest.requireMock('@/src/components/lobby/wallRead') as { wallMayHaveChanged: jest.Mock };

const replay = (type: string, payload: Record<string, unknown>) =>
  executeMutation({ id: 'q1', type: type as never, payload, timestamp: 0 }, {});

beforeEach(() => {
  mockHouse = house();
  wallMayHaveChanged.mockClear();
});

describe('the wall is asked again', () => {
  it.each([
    ['update_log', { id: LOG, updates: { rating: 4 } }],
    ['remove_log', { log_id: LOG, user_id: ME }],
    ['add_viewing', { log_id: LOG, viewing_id: VIEWING, fields: { rating: 4 } }],
    ['remove_viewing', { log_id: LOG, viewing_id: VIEWING }],
    ['update_list', { list_id: LIST, user_id: ME, updates: { title: 'Noir' } }],
    ['delete_list', { list_id: LIST, user_id: ME }],
    ['remove_film_from_list', { list_id: LIST, film_id: 7 }],
    ['update_filing', { id: POST, user_id: ME, kind: 'take', updates: { body: 'New' } }],
    ['end_filing', { id: POST }],
  ])('once, after %s', async (type, payload) => {
    await expect(replay(type, payload)).resolves.toStrictEqual({});
    expect(wallMayHaveChanged).toHaveBeenCalledTimes(1);
  });
});

describe('the wall is left alone', () => {
  it.each([
    ['remove_watchlist', { user_id: ME, film_id: 7 }],
    ['add_film_to_list', { list_id: LIST, film_id: 7, film_title: 'Seven', rank_position: 0 }],
    ['save_stub', {}],
  ])('after %s', async (type, payload) => {
    await expect(replay(type, payload)).resolves.toStrictEqual({});
    expect(wallMayHaveChanged).not.toHaveBeenCalled();
  });

  it('when the house did not take the change', async () => {
    const failure = { code: '57014', message: 'canceling statement due to statement timeout' };
    mockHouse = supabaseFake({ fail: { logs: failure } });
    await expect(replay('remove_log', { log_id: LOG, user_id: ME })).rejects.toBe(failure);
    expect(wallMayHaveChanged).not.toHaveBeenCalled();
  });
});

it('refuses a kind of write it has no handler for, by name', async () => {
  const refused = await replay('file_a_manifesto', {}).catch((e: unknown) => e);
  expect(refused).toBeInstanceOf(UnknownMutationError);
  expect(refused).toMatchObject({ name: 'UnknownMutationError', message: 'Unknown mutation type: file_a_manifesto' });
  expect(mockHouse.asked).toEqual([]);
});
