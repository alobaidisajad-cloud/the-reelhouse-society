/**
 * A WRITE THE HOUSE REFUSES IS GIVEN BACK (WORKLIST P4.14).
 *
 * A queued write the house refused for good (a row rule, a CHECK, a broken statement, a moment's
 * failure five times over) was dead-lettered, and the member told only that a change "could not
 * be sent": their words and what they did were gone. Now each is given back by its kind: a mark
 * lapses, named; words go back to the box they were written in; a salon message stays in its
 * room, failed; anything else is held for the member under UNSENT CHANGES, refused, never sent
 * again until they ask, and theirs to send again or let go. The dead letter keeps a copy.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { flushOfflineQueue, getOfflineQueue, letRefusedGo, sendRefusedAgain, type QueuedMutation } from '../offlineQueue';
import { DEAD_LETTER_KEY, QUEUE_KEY, QUEUED_WRITE_KIND } from '../queueOwnership';
import { readDraft } from '../memberDrafts';

const ME = '11111111-1111-4111-8111-111111111111';
const NOW = Date.parse('2026-11-01T12:00:00.000Z');

const mockHouse = supabaseFake({
  answer: { profiles: () => [{ id: ME, is_banned: false, suspended_until: null }] },
});
jest.mock('@/src/lib/supabase', () => ({
  get supabase() { return { ...mockHouse.client, auth: { getSession: async () => ({ data: { session: { user: { id: ME } } } }) } }; },
}));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: ME } }) } }));
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
// Every payload here is the house's to refuse, not the schema's: each type is sent as it stands.
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
jest.mock('../mutationExecutor', () => ({
  ...jest.requireActual('../mutationExecutor'),
  executeMutation: jest.fn(),
}));

const toast = (jest.requireMock('../reelToast') as { default: jest.Mock & { error: jest.Mock } }).default;
const { storage } = jest.requireMock('@/src/stores/mmkv-storage') as { storage: { set: jest.Mock; getString: jest.Mock; getAllKeys: jest.Mock; delete: jest.Mock } };
const { executeMutation } = jest.requireMock('../mutationExecutor') as { executeMutation: jest.Mock };

/** A write as the store holds it, its payload what the member wrote or did. */
const stored = (id: string, type: QueuedMutation['type'], payload: Record<string, unknown>, extra: Partial<QueuedMutation> = {}): QueuedMutation =>
  ({ id, type, payload, timestamp: NOW - 1000, owner: ME, ...extra });
const put = (list: QueuedMutation[]) => storage.set(QUEUE_KEY, JSON.stringify(list));
const dead = (): QueuedMutation[] => JSON.parse(storage.getString(DEAD_LETTER_KEY) ?? '[]');

/** Each words write's box, as useKeptWords keeps it; a filing and a dossier comment have none. */
const BOXED: Partial<Record<QueuedMutation['type'], { payload: Record<string, unknown>; scope: string }>> = {
  add_critique: { payload: { post_id: 'P', user_id: ME, body: 'Kept words.' }, scope: 'P' },
  add_log_comment: { payload: { log_id: 'L', user_id: ME, body: 'Kept words.' }, scope: 'log:L' },
  add_list_comment: { payload: { list_id: 'S', user_id: ME, content: 'Kept words.' }, scope: 'stack:S' },
};

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.setSystemTime(NOW);
  for (const k of [...storage.getAllKeys()]) storage.delete(k);
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

describe.each([
  ['a row rule', { code: '42501', message: 'new row violates row-level security policy' }],
  ['a CHECK', { code: '23514', message: 'new row for relation violates check constraint' }],
])('refused by %s at the flush', (_why, refusal) => {
  const records = Object.entries(QUEUED_WRITE_KIND)
    .filter(([type, kind]) => kind === 'record' || (kind === 'words' && !BOXED[type as QueuedMutation['type']]))
    .map(([type]) => type as QueuedMutation['type']);

  it('holds every record and every unboxed piece of writing for the member, its values whole', async () => {
    put(records.map((type) => stored(type, type, { user_id: ME, what: `the member's ${type}` })));
    executeMutation.mockRejectedValue(refusal);
    await flushOfflineQueue();
    expect(getOfflineQueue().map((m) => [m.type, m._held, m._refusal, m.payload.what]))
      .toEqual(records.map((type) => [type, 'refused', refusal.message, `the member's ${type}`]));
    expect(dead().map((m) => m.type)).toEqual(records);
  });

  it.each(Object.keys(BOXED))('puts a refused %s back in its box, after what was written there since', async (type) => {
    const boxed = BOXED[type as QueuedMutation['type']]!;
    put([stored('w', type as QueuedMutation['type'], boxed.payload)]);
    executeMutation.mockRejectedValue(refusal);
    await flushOfflineQueue();
    expect(getOfflineQueue()).toEqual([]);
    expect(readDraft<{ body: string }>(ME, 'critique', boxed.scope)?.data.body).toBe('Kept words.');
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/the house did not take is back where it was written, unsent\.$/));
  });
});

it('lets a refused mark lapse, named', async () => {
  put([stored('f', 'follow_user', { user_id: 'someone' })]);
  executeMutation.mockRejectedValue({ code: '42501', message: 'refused' });
  await flushOfflineQueue();
  expect(getOfflineQueue()).toEqual([]);
  expect(toast.error).toHaveBeenCalledWith('A follow made offline was not taken by the house.');
});

// A 500, not the 503 the worklist names: a 502, 503 or 504 is read as the house unreachable
// (isNetworkError), which halts the send and keeps every write in order, its tries uncounted, so
// its words are never at risk. A 500 is the moment's failure that is counted to five.
describe('a moment\'s failure, five times over', () => {
  const failingFiveTimes = async (m: QueuedMutation) => {
    put([{ ...m, _retryCount: 4 }]);
    executeMutation.mockRejectedValue(Object.assign(new Error('Internal Server Error'), { status: 500 }));
    await flushOfflineQueue();
  };

  it('puts a critique back in its draft, and the toast says where', async () => {
    await failingFiveTimes(stored('c', 'add_critique', { post_id: 'P', user_id: ME, body: 'A critique.' }));
    expect(readDraft<{ body: string }>(ME, 'critique', 'P')?.data.body).toBe('A critique.');
    expect(toast.error).toHaveBeenCalledWith('A critique the house did not take is back where it was written, unsent.');
  });

  it('keeps a salon message in its room, failed, for the member to send again', async () => {
    await failingFiveTimes(stored('s', 'send_lounge_message', { _tempId: 'msg', lounge_id: 'R', user_id: ME, content: 'Still mine.' }));
    expect(getOfflineQueue().map((m) => [m.payload._tempId, m.payload.content, m._held])).toEqual([['msg', 'Still mine.', 'refused']]);
  });
});

describe('what the member does with a held change', () => {
  const held = () => stored('h', 'add_log', { user_id: ME, film_id: 9 }, { _held: 'refused', _refusal: 'refused', _retryCount: 3 });

  it('is never sent again on its own', async () => {
    put([held()]);
    await flushOfflineQueue();
    expect(executeMutation).not.toHaveBeenCalled();
    expect(getOfflineQueue().map((m) => m.id)).toEqual(['h']);
  });

  it('asked again, waits to be sent like any other, its tries counted afresh', async () => {
    put([held()]);
    sendRefusedAgain('h');
    expect(getOfflineQueue()).toEqual([stored('h', 'add_log', { user_id: ME, film_id: 9 })]);
    executeMutation.mockResolvedValue({});
    await flushOfflineQueue();
    expect(executeMutation).toHaveBeenCalledTimes(1);
    expect(getOfflineQueue()).toEqual([]);
  });

  it('let go, leaves the queue; a write not held is never let go by it', () => {
    put([held(), stored('w', 'add_log', { user_id: ME, film_id: 1 })]);
    letRefusedGo('w');
    letRefusedGo('h');
    expect(getOfflineQueue().map((m) => m.id)).toEqual(['w']);
  });
});
