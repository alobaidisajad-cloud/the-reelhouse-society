/**
 * aNewerWriteLetsTheOlderGo.test.ts — utils/offlineQueue.ts keeps one pending write per thing a
 * write sets whole (keyOf: a viewing's note, a follow of one member, a certification of one piece,
 * a save, an answer, a film on the watchlist), the member's newest act being their word (round 13).
 * A write queued with a weak signal was sent after a newer write of the same thing had landed
 * online, and undid it: a Vault note went back to its older words, an unfollow was followed again.
 * Now a newer queued write lets the older go; an online write (writeOnline) lets go, once it lands,
 * every write of its thing queued before it, waits for one the queue has out, and holds the queue's
 * own back while it is out; and the send reads the queue again before each write, so one let go
 * meanwhile is never sent. A follow or certification the house asks to wait long for (its pace,
 * RH429) is kept as it is and the rest of the queue goes on.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { enqueueMutation, flushOfflineQueue, getOfflineQueue, type QueuedMutation } from '../offlineQueue';
import { keyOf, writeOnline } from '../oneWritePerThing';
import { DEAD_LETTER_KEY, QUEUE_KEY } from '../queueOwnership';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-11-18T12:00:00.000Z');

const mockHouse = supabaseFake({ rows: { profiles: [{ id: ME, is_banned: false, suspended_until: null }] } });
jest.mock('@/src/lib/supabase', () => ({
  get supabase() { return { ...mockHouse.client, auth: { getSession: async () => ({ data: { session: { user: { id: ME } } } }) } }; },
}));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: ME } }) } }));
jest.mock('@/src/utils/logger', () => ({ logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));
jest.mock('../e2eTrace', () => ({ e2eTrace: jest.fn() }));
jest.mock('@/src/lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock('@/src/stores/markCounts', () => ({ settleDelivered: jest.fn() }));
jest.mock('../reelToast', () => {
  const fn = jest.fn();
  (fn as unknown as { error: jest.Mock }).error = jest.fn();
  return { __esModule: true, default: fn };
});
jest.mock('expo-crypto', () => { let n = 0; return { randomUUID: () => `id-${++n}` }; });
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

const { storage } = jest.requireMock('@/src/stores/mmkv-storage') as { storage: { set: jest.Mock; getString: jest.Mock; getAllKeys: jest.Mock; delete: jest.Mock } };
const { executeMutation } = jest.requireMock('../mutationExecutor') as { executeMutation: jest.Mock };
const { settleDelivered } = jest.requireMock('@/src/stores/markCounts') as { settleDelivered: jest.Mock };
const reelToast = (jest.requireMock('../reelToast') as { default: jest.Mock & { error: jest.Mock } }).default;

const stored = (m: Partial<QueuedMutation> & { id: string; type: QueuedMutation['type'] }): QueuedMutation =>
  ({ payload: {}, timestamp: NOW - 60_000, owner: ME, ...m }) as QueuedMutation;
const put = (list: QueuedMutation[]) => storage.set(QUEUE_KEY, JSON.stringify(list));
const queued = () => getOfflineQueue().map((m) => [m.type, m.payload]);
const sentIds = () => executeMutation.mock.calls.map(([m]: [QueuedMutation]) => m.id);
/** A promise and the hand that settles it. */
function held<T>() {
  let settle!: (v: T) => void;
  let fail!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { settle = res; fail = rej; });
  return { promise, settle, fail };
}
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

const noteA = stored({ id: 'note-a', type: 'set_viewing_note', payload: { log_id: 'log-1', viewing_id: 'v-1', notes: 'A' } });

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.setSystemTime(NOW);
  for (const k of [...storage.getAllKeys()]) storage.delete(k);
  jest.clearAllMocks();
  executeMutation.mockResolvedValue({});
});
afterEach(() => jest.useRealTimers());

describe('the thing each write sets', () => {
  it('is named the same by its setting and its unsetting, and not at all by a write that adds', () => {
    const pairs: [Pick<QueuedMutation, 'type' | 'payload'>, Pick<QueuedMutation, 'type' | 'payload'>][] = [
      [{ type: 'set_viewing_note', payload: { viewing_id: 'v' } }, { type: 'remove_viewing_note', payload: { viewing_id: 'v' } }],
      [{ type: 'follow_user', payload: { target_username: 'Ada' } }, { type: 'unfollow_user', payload: { target_username: 'ada' } }],
      [{ type: 'follow_request_user', payload: { target_username: 'ada' } }, { type: 'unfollow_user', payload: { target_username: 'ADA' } }],
      [{ type: 'endorse_log', payload: { target_log_id: 'l' } }, { type: 'remove_endorsement', payload: { target_log_id: 'l' } }],
      [{ type: 'endorse_list', payload: { target_list_id: 's' } }, { type: 'remove_endorsement', payload: { target_list_id: 's' } }],
      [{ type: 'save_filing', payload: { post_id: 'p' } }, { type: 'unsave_filing', payload: { post_id: 'p' } }],
      [{ type: 'add_watchlist', payload: { film_id: 7 } }, { type: 'remove_watchlist', payload: { film_id: 7 } }],
      [{ type: 'certify_filing', payload: { post_id: 'p', desired_state: true } }, { type: 'certify_filing', payload: { post_id: 'p', desired_state: false } }],
    ];
    for (const [set, unset] of pairs) {
      expect(keyOf(set)).not.toBeNull();
      expect(keyOf(set)).toBe(keyOf(unset));
    }
    // A record's certification and a stack's of the same id are two things.
    expect(keyOf({ type: 'endorse_log', payload: { target_log_id: 'x' } })).not.toBe(keyOf({ type: 'endorse_list', payload: { target_list_id: 'x' } }));
    expect(keyOf({ type: 'add_log', payload: { id: 'x' } })).toBeNull();
    expect(keyOf({ type: 'add_critique', payload: { post_id: 'p' } })).toBeNull();
    expect(keyOf({ type: 'cast_vote', payload: { post_id: 'p' } })).toBeNull();
  });
});

describe('a newer write queued over an older one of the same thing', () => {
  it('a note written again with no signal replaces the one waiting: one note for the viewing is queued, the newer', () => {
    put([noteA]);
    expect(enqueueMutation({ type: 'set_viewing_note', payload: { log_id: 'log-1', viewing_id: 'v-1', notes: 'B' } })).toBe(true);
    expect(queued()).toEqual([['set_viewing_note', { log_id: 'log-1', viewing_id: 'v-1', notes: 'B' }]]);
  });

  it('a follow then an unfollow made offline leave only the unfollow waiting, and the follow is settled as done with', () => {
    put([stored({ id: 'f', type: 'follow_user', payload: { user_id: ME, target_username: 'ada' } })]);
    enqueueMutation({ type: 'unfollow_user', payload: { user_id: ME, target_username: 'Ada' } });
    expect(queued().map(([type]) => type)).toEqual(['unfollow_user']);
    expect(settleDelivered.mock.calls.map(([m]: [QueuedMutation]) => m.id)).toEqual(['f']);
  });

  it('two viewings\' notes, another member\'s write of the same thing, and words all stay', () => {
    put([
      noteA,
      stored({ id: 'theirs', type: 'set_viewing_note', owner: OTHER, payload: { log_id: 'log-1', viewing_id: 'v-2', notes: 'theirs' } }),
      stored({ id: 'crit', type: 'add_critique', payload: { _tempId: 'crit-temp', post_id: 'p', user_id: ME, body: 'words' } }),
    ]);
    enqueueMutation({ type: 'set_viewing_note', payload: { log_id: 'log-1', viewing_id: 'v-2', notes: 'mine' } });
    expect(getOfflineQueue().map((m) => m.id)).toEqual(['note-a', 'theirs', 'crit', expect.any(String)]);
  });
});

describe('an online write of a thing with an older write of it waiting', () => {
  it('lets the older go once it lands: the queue never sends the older note over it', async () => {
    put([noteA]);
    const landed = await writeOnline(keyOf({ type: 'set_viewing_note', payload: { viewing_id: 'v-1' } }), async () => 'B landed');
    expect(landed).toBe('B landed');
    expect(getOfflineQueue()).toEqual([]);
    await flushOfflineQueue();
    expect(executeMutation).not.toHaveBeenCalled();
  });

  it('keeps the older waiting when it does not land, so nothing the member did is lost', async () => {
    put([noteA]);
    await expect(writeOnline(keyOf(noteA), async () => { throw new Error('refused'); })).rejects.toThrow('refused');
    expect(getOfflineQueue().map((m) => m.id)).toEqual(['note-a']);
  });

  it('counts a failure the caller reads as a landing (a duplicate) as landed', async () => {
    put([stored({ id: 'un', type: 'remove_endorsement', payload: { user_id: ME, target_log_id: 'l' } })]);
    const duplicate = { code: '23505', message: 'duplicate key value violates unique constraint' };
    await expect(writeOnline(keyOf({ type: 'endorse_log', payload: { target_log_id: 'l' } }), async () => { throw duplicate; },
      { landedDespite: (e) => (e as { code?: string }).code === '23505' })).rejects.toBe(duplicate);
    expect(getOfflineQueue()).toEqual([]);
  });

  it('counts an answered failure as not landed when the caller says so', async () => {
    put([stored({ id: 'rm', type: 'remove_watchlist', payload: { user_id: ME, film_id: 7 } })]);
    await writeOnline(keyOf({ type: 'add_watchlist', payload: { film_id: 7 } }), async () => ({ error: { code: '500' } }),
      { landed: (r) => !r.error });
    expect(getOfflineQueue().map((m) => m.id)).toEqual(['rm']);
  });

  it('holds the queue\'s write of the same thing while it is out, and the queue sends the rest', async () => {
    put([noteA, stored({ id: 'crit', type: 'add_critique', payload: { _tempId: 'crit-temp', post_id: 'p', user_id: ME, body: 'words' } })]);
    const online = held<void>();
    const writing = writeOnline(keyOf(noteA), () => online.promise);
    await turn();
    await flushOfflineQueue();
    expect(sentIds()).toEqual(['crit']);
    expect(getOfflineQueue().map((m) => m.id)).toEqual(['note-a']);
    online.settle();
    await writing;
    expect(getOfflineQueue()).toEqual([]);
  });

  it('waits for the queue\'s write of the same thing already out, so the newer lands last', async () => {
    put([noteA]);
    const out = held<Record<string, never>>();
    executeMutation.mockReturnValueOnce(out.promise);
    const order: string[] = [];
    const sending = flushOfflineQueue();
    await turn();
    expect(sentIds()).toEqual(['note-a']);
    const writing = writeOnline(keyOf(noteA), async () => { order.push('online B'); });
    await turn();
    expect(order).toEqual([]);
    out.settle({});
    order.push('queued A landed');
    await sending;
    await writing;
    expect(order).toEqual(['queued A landed', 'online B']);
  });

  it('two online writes of one thing go one after the other', async () => {
    const first = held<void>();
    const order: string[] = [];
    const a = writeOnline('note:v-9', async () => { order.push('A out'); await first.promise; order.push('A in'); });
    const b = writeOnline('note:v-9', async () => { order.push('B out'); });
    await turn();
    expect(order).toEqual(['A out']);
    first.settle();
    await Promise.all([a, b]);
    expect(order).toEqual(['A out', 'A in', 'B out']);
  });

  it('a write with no thing of its own goes as it is', async () => {
    await expect(writeOnline(null, async () => 'as it is')).resolves.toBe('as it is');
  });
});

describe('the send reads the queue again before each write', () => {
  it('never sends a write let go while the send was out', async () => {
    put([
      stored({ id: 'crit', type: 'add_critique', payload: { _tempId: 'crit-temp', post_id: 'p', user_id: ME, body: 'words' } }),
      noteA,
    ]);
    executeMutation.mockImplementationOnce(async () => {
      // While the critique is out, the member writes the note again online and it lands.
      await writeOnline(keyOf(noteA), async () => undefined);
      return {};
    });
    await flushOfflineQueue();
    expect(sentIds()).toEqual(['crit']);
    expect(getOfflineQueue()).toEqual([]);
  });
});

describe('the house\'s pace in the queue', () => {
  const paced = (seconds: number, scope: 'member' | 'target') =>
    Object.assign(new Error('RATE_LIMITED'), { code: 'RH429', hint: String(seconds), details: scope });

  it('keeps a follow the house asks an hour\'s wait for, unspent and unsaid, and sends the words behind it', async () => {
    put([
      stored({ id: 'f', type: 'follow_user', payload: { user_id: ME, target_username: 'ada', target_user_id: OTHER } }),
      stored({ id: 'crit', type: 'add_critique', payload: { _tempId: 'crit-temp', post_id: 'p', user_id: ME, body: 'words' } }),
    ]);
    executeMutation.mockImplementation(async (m: QueuedMutation) => { if (m.id === 'f') throw paced(3600, 'target'); return {}; });
    await flushOfflineQueue();
    expect(sentIds()).toEqual(['f', 'crit']);
    const [left] = getOfflineQueue();
    expect(left).toBeDefined();
    expect([left!.id, left!._retryCount, left!._held]).toEqual(['f', undefined, undefined]);
    expect(reelToast.error).not.toHaveBeenCalled();
    expect(storage.getString(DEAD_LETTER_KEY)).toBeUndefined();
  });

  it('paced for the member\'s own acts, holds their other marks this send, and still sends their words', async () => {
    put([
      stored({ id: 'c1', type: 'endorse_log', payload: { user_id: ME, type: 'endorse_log', target_log_id: 'l1' } }),
      stored({ id: 'c2', type: 'endorse_log', payload: { user_id: ME, type: 'endorse_log', target_log_id: 'l2' } }),
      stored({ id: 'crit', type: 'add_critique', payload: { _tempId: 'crit-temp', post_id: 'p', user_id: ME, body: 'words' } }),
    ]);
    executeMutation.mockImplementation(async (m: QueuedMutation) => { if (m.id === 'c1') throw paced(60, 'member'); return {}; });
    await flushOfflineQueue();
    expect(sentIds()).toEqual(['c1', 'crit']);
    expect(getOfflineQueue().map((m) => m.id)).toEqual(['c1', 'c2']);
    // Sent again once the wait is over.
    executeMutation.mockResolvedValue({});
    jest.advanceTimersByTime(60_000);
    await turn(); await turn(); await turn();
    expect(sentIds()).toEqual(['c1', 'crit', 'c1', 'c2']);
  });
});
