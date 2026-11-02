/**
 * AN EDIT IS LAID ONLY OVER WHAT IT CHANGED (SYN-28, WORKLIST P4.32).
 *
 * A log or a filing edit queued on a phone may be sent days later, after the same record was
 * changed from another device or the website. Written whole, it put back what was there before.
 * Each edit now carries `was` (its fields as the member saw them): a field changed elsewhere since
 * is given back, never laid over; a field the member left alone is not sent; the rest is written
 * only if the row has not moved since it was read.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { enqueueMutation, flushOfflineQueue, getOfflineQueue, type QueuedMutation } from '../offlineQueue';
import { whyRefused } from '../queueOwnership';
import { FILING_CHANGED_SINCE, LOG_CHANGED_SINCE, same } from '../keepWhatChangedSince';
import { keepLogEdit, mergeHistory } from '@/src/services/KeptEdits';
import { LOG_EDITABLE_COLUMNS, LOG_EDIT_COLUMNS } from '../mappers';
import { FILING_EDITABLE_COLUMNS, FILING_EDIT_COLUMNS } from '@/src/stores/dispatchTypes';

const ME = '11111111-1111-4111-8111-111111111111';
const LOG = '33333333-3333-4333-8333-333333333333';
const FILING = '44444444-4444-4444-8444-444444444444';
const NOW = Date.parse('2026-11-02T12:00:00.000Z');
const READ = '2026-10-30T09:00:00.000000+00:00';
const LATER = '2026-11-01T18:00:00.000000+00:00';

const mockHouse = supabaseFake({
  rows: {
    profiles: [{ id: ME, is_banned: false, suspended_until: null }],
    logs: [],
    dispatch_posts: [],
  },
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
jest.mock('@/src/components/lobby/wallRead', () => ({ wallMayHaveChanged: jest.fn() }));
jest.mock('../reelToast', () => {
  const fn = jest.fn();
  (fn as unknown as { error: jest.Mock }).error = jest.fn();
  return { __esModule: true, default: fn };
});
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

const { storage } = jest.requireMock('@/src/stores/mmkv-storage') as { storage: { getAllKeys: jest.Mock; delete: jest.Mock } };

type Row = Record<string, unknown>;
const log = () => mockHouse.rows('logs')[0] as Row;
const filing = () => mockHouse.rows('dispatch_posts')[0] as Row;
/** Another device, or the website: the row changed, and its time moved. */
const elsewhere = (row: Row, change: Row) => Object.assign(row, change, { updated_at: LATER });

const queue = (type: 'update_log' | 'update_filing', payload: Row) =>
  enqueueMutation({ type, payload } as Omit<QueuedMutation, 'id' | 'timestamp' | 'owner'>);
const editLog = (updates: Row, was?: Row) => queue('update_log', { id: LOG, updates, ...(was ? { was } : {}) });
const editFiling = (updates: Row, was: Row) =>
  queue('update_filing', { id: FILING, user_id: ME, kind: 'dossier', updates, was });

/** The one write held for the member, refused, and why. */
const heldAs = () => {
  const [held] = getOfflineQueue();
  return [getOfflineQueue().length, held?._held, whyRefused(held?._refusal)];
};

beforeEach(() => {
  // The date stood still; the executor's own yield (a 0 ms timeout) left to run.
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask', 'setTimeout', 'clearTimeout'] });
  jest.setSystemTime(NOW);
  for (const k of [...storage.getAllKeys()]) storage.delete(k);
  const logs = mockHouse.rows('logs');
  logs.length = 0;
  logs.push({
    id: LOG, user_id: ME, film_id: 603, film_title: 'The Matrix', rating: 3, review: 'Fine.',
    status: 'watched', watched_date: '2026-10-29', viewing_history: [], updated_at: READ,
  });
  const posts = mockHouse.rows('dispatch_posts');
  posts.length = 0;
  posts.push({
    id: FILING, user_id: ME, kind: 'dossier', title: 'On the Matrix', body: 'An excerpt.',
    full_content: 'The essay as written.', updated_at: READ, edited_at: null,
  });
});
afterEach(() => jest.useRealTimers());

describe('a log edit queued days ago', () => {
  it('is given back when the review it changes was changed elsewhere since, and that review stays', async () => {
    editLog({ review: 'Better on a second look.' }, { review: 'Fine.' });
    elsewhere(log(), { review: 'Written on the website.' });

    await flushOfflineQueue();

    expect(log().review).toBe('Written on the website.');
    expect(heldAs()).toEqual([1, 'refused', LOG_CHANGED_SINCE]);
  });

  it('lands beside a change made elsewhere to another field: both stay', async () => {
    editLog({ rating: 4.5, review: 'Fine.' }, { rating: 3, review: 'Fine.' });
    elsewhere(log(), { review: 'Written on the website.' });

    await flushOfflineQueue();

    expect([log().rating, log().review]).toEqual([4.5, 'Written on the website.']);
    expect(getOfflineQueue()).toEqual([]);
  });

  it('lands twice when two edits of it were queued offline', async () => {
    editLog({ review: 'Second thoughts.' }, { review: 'Fine.' });
    editLog({ review: 'Third thoughts.' }, { review: 'Second thoughts.' });

    await flushOfflineQueue();

    expect(log().review).toBe('Third thoughts.');
    expect(getOfflineQueue()).toEqual([]);
  });

  /** Another write, landing between the edit's read of the log and its write. */
  const between = (change: Row) => {
    const real = mockHouse.client.from;
    let raced = false;
    const spy = jest.spyOn(mockHouse.client, 'from').mockImplementation(((table: string) => {
      const q = real(table);
      if (table !== 'logs' || raced) return q;
      const update = q.update.bind(q);
      q.update = (values: Row) => {
        raced = true;
        elsewhere(log(), change);
        return update(values);
      };
      return q;
    }) as typeof real);
    return { raced: () => raced, done: () => spy.mockRestore() };
  };

  it('is given back when the field it changes is changed between its read and its write', async () => {
    editLog({ rating: 5 }, { rating: 3 });
    const race = between({ rating: 2 });

    await flushOfflineQueue();
    race.done();

    expect([race.raced(), log().rating]).toEqual([true, 2]);
    expect(heldAs()).toEqual([1, 'refused', LOG_CHANGED_SINCE]);
  });

  it('reads the log again when another write lands between its read and its write', async () => {
    editLog({ rating: 5 }, { rating: 3 });
    const race = between({ status: 'rewatched' });

    await flushOfflineQueue();
    race.done();

    expect([race.raced(), log().rating, log().status]).toEqual([true, 5, 'rewatched']);
    expect(getOfflineQueue()).toEqual([]);
  });

  it('holds its day as the house does: a noon timestamp is the same day as the date', async () => {
    editLog({ watched_date: '2026-10-30T12:00:00Z' }, { watched_date: '2026-10-29T12:00:00Z' });
    elsewhere(log(), { review: 'Written on the website.' });

    await flushOfflineQueue();

    expect([log().watched_date, log().review]).toEqual(['2026-10-30T12:00:00Z', 'Written on the website.']);
    expect(getOfflineQueue()).toEqual([]);
  });

  it('is written as before when it carries no `was`, as an older build\'s does', async () => {
    editLog({ review: 'From an older build.' });
    elsewhere(log(), { review: 'Written on the website.' });

    await flushOfflineQueue();

    expect(log().review).toBe('From an older build.');
    expect(getOfflineQueue()).toEqual([]);
  });
});

describe('a filing edit queued days ago', () => {
  it('is given back when its essay was amended elsewhere since, and that essay stays', async () => {
    editFiling({ full_content: 'The essay, amended on the phone.' }, { full_content: 'The essay as written.' });
    elsewhere(filing(), { full_content: 'The essay, amended on the website.' });

    await flushOfflineQueue();

    expect(filing().full_content).toBe('The essay, amended on the website.');
    expect(heldAs()).toEqual([1, 'refused', FILING_CHANGED_SINCE]);
  });

  it('lands its title beside an excerpt amended elsewhere: both stay', async () => {
    editFiling({ title: 'On The Matrix, again', body: 'An excerpt.' }, { title: 'On the Matrix', body: 'An excerpt.' });
    elsewhere(filing(), { body: 'An excerpt, amended on the website.' });

    await flushOfflineQueue();

    expect([filing().title, filing().body]).toEqual(['On The Matrix, again', 'An excerpt, amended on the website.']);
    expect(getOfflineQueue()).toEqual([]);
  });
});

describe('the kept edit itself', () => {
  it('raises a read the house failed, never taking it for a log that is gone', async () => {
    const real = mockHouse.client.from;
    const spy = jest.spyOn(mockHouse.client, 'from').mockImplementation(((table: string) => {
      const q = real(table);
      q.maybeSingle = () => Promise.resolve({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' }, count: null });
      return q;
    }) as typeof real);
    await expect(keepLogEdit(LOG, ME, { rating: 5 }, { rating: 3 })).rejects.toMatchObject({ code: '57014' });
    spy.mockRestore();
    expect(log().rating).toBe(3);
  });

  it('joins two histories: a viewing on either side stays, and an empty place on either is no viewing', () => {
    const house = [{ date: '2026-10-01T12:00:00Z', rating: 3 }, null];
    const phone = [null, { date: '2026-10-20T12:00:00Z', rating: 4 }, { date: '2026-10-01T12:00:00Z', rating: 3 }];
    expect(mergeHistory(house, phone)).toEqual([{ date: '2026-10-20T12:00:00Z', rating: 4 }, { date: '2026-10-01T12:00:00Z', rating: 3 }]);
  });
});

describe('what an edit reads', () => {
  // A column an edit writes and does not read is empty to the comparison: every edit of it
  // would be refused as changed elsewhere.
  const named = (cols: string) => cols.split(',').map((c) => c.trim());
  it('is every column a log edit may write, and its time', () => {
    expect(named(LOG_EDIT_COLUMNS)).toEqual(expect.arrayContaining(['updated_at', ...LOG_EDITABLE_COLUMNS]));
  });
  it('is every column a filing edit may write, and its time', () => {
    expect(named(FILING_EDIT_COLUMNS)).toEqual(expect.arrayContaining(['updated_at', ...FILING_EDITABLE_COLUMNS]));
  });
});

describe('a value as the house stores it', () => {
  it('holds an empty as an empty, a number as its value, words as cleaned, and says no to a difference', () => {
    expect([same(null, ''), same(undefined, null), same('', 'x')]).toEqual([true, true, false]);
    expect([same(4.5, '4.5'), same(4, 4.5)]).toEqual([true, false]);
    expect([same('Fine.  ', 'Fine.'), same('Fine.', 'Fine!')]).toEqual([true, false]);
    expect([same({ a: [1, 'x'] }, { a: [1, 'x '] }), same({ a: [1] }, { a: [1, 2] }), same([1], { 0: 1 })]).toEqual([true, false, false]);
  });
});
