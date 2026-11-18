/**
 * aWriteOnAPageGoneIsLetGoNotSent.test.ts — review round 12
 * ─────────────────────────────────────────────────────────────────────────────
 * Two writes made offline on a page deleted before the queue sent them, sent through the real
 * queue and the real executor against the house as strict as it is (supabaseFake):
 *
 *   · A stack amended offline and deleted elsewhere was let go of and said ("the amendment was let
 *     go"), then counted as sent: "Archive updated with offline actions." followed it. Nothing was.
 *   · A critique written offline under a record or a stack deleted meanwhile (LOG_GONE, STACK_GONE)
 *     was taken as a plain refusal: its words were put back in the box of a page that no longer
 *     opens, and the member was told they were "back where it was written, unsent". Now the page
 *     leaves the phone, as it does when a critique filed online meets the same word, the words are
 *     never put back on a page that does not exist, and the member is told truly, their first words
 *     quoted. The dead letter keeps a copy.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { flushOfflineQueue, getOfflineQueue, type QueuedMutation } from '../offlineQueue';
import { DEAD_LETTER_KEY, QUEUE_KEY } from '../queueOwnership';
import { readDraft } from '../memberDrafts';

const ME = '11111111-1111-4111-8111-111111111111';
const LOG = '22222222-2222-4222-8222-222222222222';
const STACK = '44444444-4444-4444-8444-444444444444';
const NOW = Date.parse('2026-11-17T12:00:00.000Z');
const SENT = 'Archive updated with offline actions.';

const GONE = (word: string) => ({ code: 'P0002', message: word });
let mockHouse = supabaseFake();
const house = (opts: Parameters<typeof supabaseFake>[0]) => supabaseFake({
  ...opts,
  answer: { profiles: () => [{ id: ME, is_banned: false, suspended_until: null }], ...(opts?.answer ?? {}) },
});
jest.mock('@/src/lib/supabase', () => ({
  get supabase() { return { ...mockHouse.client, auth: { getSession: async () => ({ data: { session: { user: { id: ME } } } }) } }; },
  fetchWithinLimit: jest.fn(),
}));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: ME, username: 'me' } }) } }));
jest.mock('@/src/utils/logger', () => ({ logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));
jest.mock('../e2eTrace', () => ({ e2eTrace: jest.fn() }));
jest.mock('@/src/lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock('@/src/stores/markCounts', () => ({ settleDelivered: jest.fn() }));
jest.mock('../tierDoor', () => ({ showTierDoor: jest.fn() }));
jest.mock('../reelToast', () => {
  const fn = jest.fn();
  (fn as unknown as { error: jest.Mock }).error = jest.fn();
  return { __esModule: true, default: fn };
});
// The page let go of on the phone: heard here by who is asked to let it go.
jest.mock('../letTheRecordGo', () => ({ letTheRecordGo: jest.fn() }));
jest.mock('@/src/stores/domain/listSlice', () => ({ forgetGoneStack: jest.fn() }));
jest.mock('@/src/stores/films', () => ({ useListStore: { setState: jest.fn() } }));
jest.mock('../../types/mutations', () => ({ MutationSchemaMap: {} }));
jest.mock('@/src/stores/mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    isStorageEncrypted: () => true,
    withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
    storage: {
      set: jest.fn((k: string, v: string) => store.set(k, v)),
      getString: jest.fn((k: string) => store.get(k)),
      delete: jest.fn((k: string) => store.delete(k)),
      getAllKeys: jest.fn(() => [...store.keys()]),
    },
  };
});

const toast = (jest.requireMock('../reelToast') as { default: jest.Mock & { error: jest.Mock } }).default;
const { storage } = jest.requireMock('@/src/stores/mmkv-storage') as { storage: { set: jest.Mock; getString: jest.Mock; getAllKeys: jest.Mock; delete: jest.Mock } };
const { letTheRecordGo } = jest.requireMock('../letTheRecordGo') as { letTheRecordGo: jest.Mock };
const { forgetGoneStack } = jest.requireMock('@/src/stores/domain/listSlice') as { forgetGoneStack: jest.Mock };

const stored = (id: string, type: QueuedMutation['type'], payload: Record<string, unknown>): QueuedMutation =>
  ({ id, type, payload, timestamp: NOW - 1000, owner: ME });
const put = (list: QueuedMutation[]) => storage.set(QUEUE_KEY, JSON.stringify(list));
const dead = (): QueuedMutation[] => JSON.parse(storage.getString(DEAD_LETTER_KEY) ?? '[]');
const said = () => [...toast.mock.calls, ...toast.error.mock.calls].map(([words]) => words as string);

const ON_A_RECORD = stored('c1', 'add_log_comment', {
  id: '55555555-5555-4555-8555-555555555555', log_id: LOG, user_id: ME, username: 'me',
  body: 'The light in the last reel is the whole film, and nobody in the house says so.',
});
const ON_A_STACK = stored('c2', 'add_list_comment', {
  id: '66666666-6666-4666-8666-666666666666', list_id: STACK, user_id: ME, content: 'Sunrise belongs first.',
});
const AMENDED = stored('a1', 'update_list', { list_id: STACK, user_id: ME, updates: { title: 'Silents, Revised' }, read_at: '2026-11-01T00:00:00Z' });

beforeEach(() => {
  // The clock alone: the real executor breathes on a 0 ms timer between writes.
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask', 'setTimeout', 'clearTimeout'] });
  jest.setSystemTime(NOW);
  for (const k of [...storage.getAllKeys()]) storage.delete(k);
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

it('a critique written offline under a record deleted meanwhile is let go: the record leaves the phone, the words are never put back, and the member is told truly', async () => {
  mockHouse = house({ fail: { log_comments: GONE('LOG_GONE') } });
  put([ON_A_RECORD]);
  await flushOfflineQueue();
  expect(getOfflineQueue()).toEqual([]);
  expect(letTheRecordGo.mock.calls.map(([, id]) => id)).toEqual([LOG]);
  expect(readDraft(ME, 'critique', `log:${LOG}`)).toBeFalsy();
  expect(said()).toEqual([
    'A critique written offline, “The light in the last reel is the whole film, a…”, was not filed: the record it answered is no longer in the house.',
  ]);
  expect(dead().map((m) => [m.type, m.payload._failReason])).toEqual([['add_log_comment', 'let go: LOG_GONE']]);
});

it('a critique written offline under a stack deleted meanwhile is let go the same way', async () => {
  mockHouse = house({ fail: { list_comments: GONE('STACK_GONE') } });
  put([ON_A_STACK]);
  await flushOfflineQueue();
  expect(getOfflineQueue()).toEqual([]);
  expect(forgetGoneStack.mock.calls.map(([id]) => id)).toEqual([STACK]);
  expect(readDraft(ME, 'critique', `stack:${STACK}`)).toBeFalsy();
  expect(said()).toEqual([
    'A critique written offline, “Sunrise belongs first.”, was not filed: the stack it answered is no longer in the house.',
  ]);
});

it('a critique the house refuses for another reason is still given back to its box, as before', async () => {
  mockHouse = house({ fail: { log_comments: { code: '42501', message: 'new row violates row-level security policy' } } });
  put([ON_A_RECORD]);
  await flushOfflineQueue();
  expect(letTheRecordGo).not.toHaveBeenCalled();
  expect(readDraft<{ body: string }>(ME, 'critique', `log:${LOG}`)?.data.body).toBe(ON_A_RECORD.payload.body);
});

it('a stack amended offline and deleted elsewhere is said to be let go, and never said to have updated the archive', async () => {
  mockHouse = house({ rpc: { save_stack: { error: GONE('No such stack of yours') } } });
  put([AMENDED]);
  await flushOfflineQueue();
  expect(getOfflineQueue()).toEqual([]);
  expect(said()).toEqual(['A stack amended offline is no longer in the house: the amendment was let go.']);
  expect(said()).not.toContain(SENT);
});

it('beside a write that did reach the house, the archive is still said to be updated', async () => {
  mockHouse = house({ rows: { list_comments: [] }, rpc: { save_stack: { error: GONE('No such stack of yours') } } });
  put([AMENDED, ON_A_STACK]);
  await flushOfflineQueue();
  expect(said()).toContain(SENT);
  expect(said()).toContain('A stack amended offline is no longer in the house: the amendment was let go.');
});
