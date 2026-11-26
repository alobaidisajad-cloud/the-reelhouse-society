/**
 * aReplayTellsWhatItMoved.test.ts — utils/mutationExecutor.ts, `executeMutation`, once the house has a
 * replay: a record filed, amended, rewatched or withdrawn tells the Reel (its card) and the wall (a piece
 * it hangs), and reads its film's page again, its film named by the replay or, from an older build, by the
 * record the phone holds; a record an older build marked watched tells what holds the member's records;
 * every other replay tells neither, and reads no film again. theWallHearsEachReplayThatMovesAPiece holds
 * the wall for the stacks and filings.
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { queryClient } from '@/src/lib/queryClient';
import { executeMutation } from '../mutationExecutor';
import { findRecordsFilmBy } from '../recordsFilm';

const ME = '11111111-1111-4111-8111-111111111111';
const LOG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_LOG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VIEWING = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
const LIST = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const house = () => supabaseFake({
  rows: { logs: [], list_items: [] },
  answer: { logs: (ask: Ask) => (ask.op === 'insert' ? ask.values ?? [] : []) },
  rpc: { log_viewing_add: VIEWING, log_viewing_remove: VIEWING, save_stack: { id: LIST } },
});
let mockHouse = house();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/components/lobby/wallRead', () => ({ wallMayHaveChanged: jest.fn() }));
jest.mock('@/src/components/feed/reelRead', () => ({ reelMayHaveChanged: jest.fn(), recordsMayHaveChanged: jest.fn() }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: null }) } }));
const { wallMayHaveChanged } = jest.requireMock('@/src/components/lobby/wallRead') as { wallMayHaveChanged: jest.Mock };
const { reelMayHaveChanged, recordsMayHaveChanged } = jest.requireMock('@/src/components/feed/reelRead') as { reelMayHaveChanged: jest.Mock; recordsMayHaveChanged: jest.Mock };

const replay = (type: string, payload: Record<string, unknown>) =>
  executeMutation({ id: 'q1', type: type as never, payload, timestamp: 0 }, {});
const LOGGED = { id: LOG, viewing_id: VIEWING, user_id: ME, film_id: 11, film_title: 'Sunrise', rating: 4, watched_date: '2026-10-01' };
/** The films of the records the phone holds: LOG's is 42, OTHER_LOG's 99, anything else's 77. */
const FILMS: Record<string, number> = { [LOG]: 42, [OTHER_LOG]: 99 };
let invalidate: jest.SpyInstance;
/** Each film whose page was read again, in order (a record's or a stack's own page is another test's). */
const filmsRead = () => invalidate.mock.calls.map(([filters]) => filters).filter((f) => f.queryKey[0] === 'film');

beforeEach(() => {
  mockHouse = house();
  findRecordsFilmBy((logId) => FILMS[logId] ?? 77);
  for (const m of [wallMayHaveChanged, reelMayHaveChanged, recordsMayHaveChanged]) m.mockClear();
  invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
});
afterEach(() => invalidate.mockRestore());

describe('a record filed, amended, rewatched or withdrawn', () => {
  it.each([
    ['add_log', { ...LOGGED }],
    ['update_log', { id: LOG, updates: { rating: 4 } }],
    ['remove_log', { log_id: LOG, user_id: ME }],
    ['add_viewing', { log_id: LOG, viewing_id: VIEWING, fields: { rating: 4 } }],
    ['remove_viewing', { log_id: LOG, viewing_id: VIEWING }],
  ])('%s tells the Reel and the wall once, and nothing told of records alone', async (type, payload) => {
    await replay(type, payload);
    expect([wallMayHaveChanged.mock.calls.length, reelMayHaveChanged.mock.calls.length, recordsMayHaveChanged.mock.calls.length]).toEqual([1, 1, 0]);
  });

  it('marked watched by an older build, tells what holds the member\'s records, and neither the Reel nor the wall', async () => {
    await replay('mark_watched', { ...LOGGED });
    expect([wallMayHaveChanged.mock.calls.length, reelMayHaveChanged.mock.calls.length, recordsMayHaveChanged.mock.calls.length]).toEqual([0, 0, 1]);
  });

  it('reads again the page of the film the replay names', async () => {
    await replay('add_log', { ...LOGGED });
    await replay('mark_watched', { ...LOGGED, film_id: 12 });
    await replay('add_viewing', { log_id: LOG, viewing_id: VIEWING, film_id: '13', fields: { rating: 4 } });
    expect(filmsRead()).toEqual([{ queryKey: ['film', 11] }, { queryKey: ['film', 12] }, { queryKey: ['film', 13] }]);
  });

  it('naming no film, or none that is a number, reads the page of its record\'s film: an amendment\'s by its own id', async () => {
    await replay('update_log', { id: LOG, log_id: OTHER_LOG, film_id: null, updates: { rating: 4 } });
    await replay('remove_log', { log_id: OTHER_LOG, id: LOG, user_id: ME, film_id: 'not a film' });
    await replay('remove_viewing', { log_id: LOG, viewing_id: VIEWING });
    expect(filmsRead()).toEqual([{ queryKey: ['film', 42] }, { queryKey: ['film', 99] }, { queryKey: ['film', 42] }]);
  });

  it('with no film and no record named, reads no film\'s page', async () => {
    await replay('mark_watched', { ...LOGGED, film_id: undefined });
    expect(filmsRead()).toEqual([]);
  });
});

it('every other replay tells neither the Reel nor the records, and reads no film\'s page', async () => {
  await replay('update_list', { list_id: LIST, user_id: ME, updates: { title: 'Noir' } });
  await replay('remove_watchlist', { user_id: ME, film_id: 7 });
  expect([reelMayHaveChanged.mock.calls.length, recordsMayHaveChanged.mock.calls.length, filmsRead()]).toEqual([0, 0, []]);
});
