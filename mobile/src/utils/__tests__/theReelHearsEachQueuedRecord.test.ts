/**
 * theReelHearsEachQueuedRecord.test.ts — review round 8, utils/mutationExecutor.ts `executeMutation`.
 * ─────────────────────────────────────────────────────────────────────────────
 * A record filed, amended or withdrawn online tells the Reel itself (reelMayHaveChanged). One
 * written offline and sent later by the queue told it nothing: its card stood as it was, or was
 * never drawn, until a pull. Each of the five replays of a record or a viewing now tells the Reel
 * once the house has it, and a record filed offline tells the Lobby's wall too, as one filed
 * online does. A send the house refused tells neither; any other replay tells the Reel nothing.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { executeMutation } from '../mutationExecutor';

const ME = '11111111-1111-4111-8111-111111111111';
const LOG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VIEWING = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
const LIST = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const house = () => supabaseFake({
  rows: { logs: [], watchlists: [], list_items: [] },
  rpc: { log_viewing_add: VIEWING, log_viewing_remove: VIEWING, save_stack: { id: LIST } },
});
let mockHouse = house();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/components/lobby/wallRead', () => ({ wallMayHaveChanged: jest.fn() }));
jest.mock('@/src/components/feed/reelRead', () => ({ reelMayHaveChanged: jest.fn() }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: null }) } }));
const { wallMayHaveChanged } = jest.requireMock('@/src/components/lobby/wallRead') as { wallMayHaveChanged: jest.Mock };
const { reelMayHaveChanged } = jest.requireMock('@/src/components/feed/reelRead') as { reelMayHaveChanged: jest.Mock };

const replay = (type: string, payload: Record<string, unknown>) =>
  executeMutation({ id: 'q1', type: type as never, payload, timestamp: 0 }, {});

const LOGGED = { id: LOG, viewing_id: VIEWING, user_id: ME, film_id: 11, film_title: 'Sunrise', rating: 4, watched_date: '2026-10-01' };
const TIMEOUT = { code: '57014', message: 'canceling statement due to statement timeout' };

beforeEach(() => {
  mockHouse = house();
  wallMayHaveChanged.mockClear();
  reelMayHaveChanged.mockClear();
});

describe('a record sent by the queue', () => {
  it.each([
    ['add_log', LOGGED],
    ['update_log', { id: LOG, updates: { rating: 4 } }],
    ['remove_log', { log_id: LOG, user_id: ME }],
    ['add_viewing', { log_id: LOG, viewing_id: VIEWING, fields: { rating: 4 } }],
    ['remove_viewing', { log_id: LOG, viewing_id: VIEWING }],
  ])('tells the Reel once the house has it, once: %s', async (type, payload) => {
    await replay(type, payload);
    expect(reelMayHaveChanged).toHaveBeenCalledTimes(1);
  });

  it('filed offline, tells the wall as well as the Reel, as one filed online does', async () => {
    await expect(replay('add_log', { ...LOGGED, _fakeId: 'temp-log' })).resolves.toStrictEqual({ newId: LOG, fakeId: 'temp-log' });
    expect(wallMayHaveChanged).toHaveBeenCalledTimes(1);
    expect(reelMayHaveChanged).toHaveBeenCalledTimes(1);
  });

  it('refused by the house, tells neither the Reel nor the wall; sent again and taken, tells both', async () => {
    mockHouse = supabaseFake({ fail: { logs: TIMEOUT } });
    await expect(replay('add_log', LOGGED)).rejects.toBe(TIMEOUT);
    expect(reelMayHaveChanged).not.toHaveBeenCalled();
    expect(wallMayHaveChanged).not.toHaveBeenCalled();

    mockHouse = house();
    await replay('add_log', LOGGED);
    expect(reelMayHaveChanged).toHaveBeenCalledTimes(1);
    expect(wallMayHaveChanged).toHaveBeenCalledTimes(1);
  });
});

it('a replay that is no record tells the Reel nothing; a viewing sent after it does', async () => {
  await replay('remove_watchlist', { user_id: ME, film_id: 7 });
  await replay('update_list', { list_id: LIST, user_id: ME, updates: { title: 'Noir' } });
  expect(reelMayHaveChanged).not.toHaveBeenCalled();
  await replay('add_viewing', { log_id: LOG, viewing_id: VIEWING, fields: { rating: 4 } });
  expect(reelMayHaveChanged).toHaveBeenCalledTimes(1);
});
