/**
 * aQueuedWriteReadsItsPageAgain.test.ts — utils/mutationExecutor.ts: a write the queue sends reads
 * again, once the house has it, the page its online twin reads again once answered. A stack's
 * critique, films or details, and a record amended, rewatched, its rewatch taken back or the record
 * withdrawn: the page drew the act as the phone laid it, and kept that guess after the send.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { executeMutation } from '../mutationExecutor';

const ME = '11111111-1111-4111-8111-111111111111';
const LIST = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const LOG = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const VIEWING = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const mockHouse = supabaseFake({ rpc: { save_stack: () => ({ id: LIST, updated_at: '2026-11-22T10:00:00Z' }) } });
const mockInvalidate = jest.fn();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/lib/queryClient', () => ({ queryClient: { invalidateQueries: (...a: unknown[]) => mockInvalidate(...a) } }));
jest.mock('@/src/components/lobby/wallRead', () => ({ wallMayHaveChanged: jest.fn() }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: ME } }) } }));
jest.mock('@/src/services/VaultService', () => ({ VaultService: { addViewing: jest.fn(async () => undefined), removeViewing: jest.fn(async () => undefined) } }));

const replay = (type: string, payload: Record<string, unknown>) =>
  executeMutation({ id: 'q1', type: type as never, payload, timestamp: 0 }, {});

/** The keys read again, as the cache was asked. */
const readAgain = () => mockInvalidate.mock.calls.map(([arg]) => (arg as { queryKey: unknown[] }).queryKey);

beforeEach(() => mockInvalidate.mockClear());

it('a stack\'s critique sent by the queue reads the stack\'s critiques again', async () => {
  await replay('add_list_comment', { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', list_id: LIST, user_id: ME, content: 'A fine run.' });
  expect(readAgain()).toContainEqual(['stackComments', LIST]);
});

it.each([
  ['update_list', { list_id: LIST, updates: { title: 'Noir' } }],
  ['add_film_to_list', { list_id: LIST, film_id: 7, film_title: 'Seven', poster_path: null, rank_position: 1 }],
  ['remove_film_from_list', { list_id: LIST, film_id: 7 }],
])('a stack\'s %s sent by the queue reads the stack again', async (type, payload) => {
  await replay(type, payload);
  expect(readAgain()).toContainEqual(['stack', LIST]);
});

it.each([
  ['update_log', { id: LOG, film_id: 9, updates: { rating: 4 } }],
  ['remove_log', { log_id: LOG, film_id: 9, user_id: ME }],
  ['add_viewing', { log_id: LOG, viewing_id: VIEWING, film_id: 9, fields: {} }],
  ['remove_viewing', { log_id: LOG, viewing_id: VIEWING, film_id: 9 }],
])('a record\'s %s sent by the queue reads the record\'s page again, as its film', async (type, payload) => {
  await replay(type, payload);
  expect(readAgain()).toEqual(expect.arrayContaining([['log', LOG], ['film', 9]]));
});

it('a write whose online twin reads no page again reads none', async () => {
  await replay('add_watchlist', { user_id: ME, film_id: 9, film_title: 'Nine', poster_path: null });
  expect(readAgain()).toEqual([]);
});
