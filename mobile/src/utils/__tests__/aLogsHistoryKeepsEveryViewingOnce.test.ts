/**
 * aLogsHistoryKeepsEveryViewingOnce.test.ts — utils/mutationExecutor.ts, `update_log` with a
 * viewing history: a log edited offline carries the history the phone held, and the server's may
 * have grown since. The replay reads the server's history first and keeps every viewing from both,
 * each once: two entries are one viewing when they agree on the date, the rating, the status, the
 * first forty characters of the review, who it was watched with and on what; a field left out
 * counts as that field empty. An empty place on either side is no viewing, and is dropped. The
 * merged history is written newest first. A history that is not a
 * list, or a log whose server history is not one, is written as the phone gave it, unread or
 * unmerged.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { executeMutation } from '../mutationExecutor';

const ME = '11111111-1111-4111-8111-111111111111';
const LOG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ROW = { id: LOG, user_id: ME, film_id: 11, film_title: 'Sunrise', watched_date: '2026-01-01' };

let mockHouse = supabaseFake({ rows: { logs: [] } });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/components/lobby/wallRead', () => ({ wallMayHaveChanged: jest.fn() }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: null }) } }));

const replay = (type: string, payload: Record<string, unknown>) =>
  executeMutation({ id: 'q1', type: type as never, payload, timestamp: 0 }, {});

/** The log as the server holds it, the phone's edit replayed, and the history written. */
const merged = async (server: unknown, offline: unknown) => {
  mockHouse = supabaseFake({ rows: { logs: [{ ...ROW, viewing_history: server }] } });
  await replay('update_log', { id: LOG, updates: { viewing_history: offline } });
  return mockHouse.rows('logs')[0]?.viewing_history;
};

const JAN = '2026-01-01T12:00:00Z';
const FEB = '2026-02-01T12:00:00Z';
const MAR = '2026-03-01T12:00:00Z';
/** A viewing with every field the key reads. */
const full = { date: JAN, rating: 4, status: 'watched', review: 'A slow burn.', watchedWith: 'Ann', physicalMedia: 'VHS' };

describe('the replay reads the server\'s history before it writes the phone\'s', () => {
  it('reads the log\'s history by its id, then writes the merge to that log', async () => {
    await merged([{ ...full, date: JAN }], [{ ...full, date: MAR }]);
    expect(mockHouse.asked.map(({ table, op, columns, filters, one }) => ({ table, op, columns, filters, one }))).toEqual([
      { table: 'logs', op: 'select', columns: ['viewing_history'], filters: [['eq', 'id', LOG]], one: 'maybeSingle' },
      { table: 'logs', op: 'update', columns: [], filters: [['eq', 'id', LOG]], one: null },
    ]);
  });

  it('keeps every viewing from both sides, newest first', async () => {
    const a = { ...full, date: JAN, rating: 1 };
    const b = { ...full, date: MAR, rating: 2 };
    const c = { ...full, date: FEB, rating: 3 };
    expect(await merged([a], [b, c])).toEqual([b, c, a]);
  });

  it('writes the server\'s viewings newest first even when the phone adds none', async () => {
    const a = { ...full, date: JAN, rating: 1 };
    const b = { ...full, date: MAR, rating: 2 };
    const c = { ...full, date: FEB, rating: 3 };
    expect(await merged([a, b, c], [])).toEqual([b, c, a]);
  });

  it('keeps a viewing the server already holds as the server holds it, and does not double it', async () => {
    const serverOwn = { ...full, note: 'the server\'s' };
    const phoneOwn = { ...full, note: 'the phone\'s' };
    const later = { ...full, date: MAR };
    expect(await merged([serverOwn], [phoneOwn, later])).toEqual([later, serverOwn]);
  });

  it.each([
    ['the date', { date: FEB }],
    ['the rating', { rating: 5 }],
    ['the status', { status: 'abandoned' }],
    ['the review', { review: 'A fast burn.' }],
    ['who it was watched with', { watchedWith: 'Bea' }],
    ['what it was watched on', { physicalMedia: 'DVD' }],
  ])('keeps two viewings that differ only in %s as two', async (_field, change) => {
    const other = { ...full, ...change };
    const written = (await merged([full], [other])) as unknown[];
    expect(written).toHaveLength(2);
    expect(written).toEqual(expect.arrayContaining([full, other]));
  });

  it('takes two reviews alike for their first forty characters as one viewing', async () => {
    const opening = 'x'.repeat(40);
    const serverOwn = { ...full, review: `${opening} and then the ending` };
    const phoneOwn = { ...full, review: `${opening} and then another ending` };
    expect(await merged([serverOwn], [phoneOwn])).toEqual([serverOwn]);
  });

  it('takes a field left out as that field empty, so the two are one viewing', async () => {
    const serverOwn = { date: JAN, rating: 0, status: '', review: '', watchedWith: '', physicalMedia: '' };
    const phoneOwn = { date: JAN };
    expect(await merged([serverOwn], [phoneOwn])).toEqual([serverOwn]);
  });

  it('takes a viewing with no date as one with an empty date', async () => {
    const serverOwn = { date: '', rating: 3 };
    const phoneOwn = { rating: 3 };
    expect(await merged([serverOwn], [phoneOwn])).toEqual([serverOwn]);
  });

  it('drops an empty place in the server\'s history', async () => {
    const a = { ...full, date: JAN };
    const b = { ...full, date: MAR };
    expect(await merged([a, null], [b])).toEqual([b, a]);
  });

  it('drops an empty place in the phone\'s history too, and the edit still lands', async () => {
    const a = { ...full, date: JAN };
    const b = { ...full, date: MAR };
    expect(await merged([a], [null, b, null])).toEqual([b, a]);
    expect(await merged([a], [undefined, undefined, b])).toEqual([b, a]);
    expect(await merged([], [null])).toEqual([]);
  });
});

describe('what is written unmerged', () => {
  it('reads nothing first when the edit carries no history', async () => {
    mockHouse = supabaseFake({ rows: { logs: [{ ...ROW, rating: 2 }] } });
    await replay('update_log', { id: LOG, updates: { rating: 4 } });
    expect(mockHouse.asked.map((a) => a.op)).toEqual(['update']);
    expect(mockHouse.rows('logs')[0]).toEqual({ ...ROW, rating: 4 });
  });

  it('writes a history that is not a list as the phone gave it, unread', async () => {
    mockHouse = supabaseFake({ rows: { logs: [{ ...ROW, viewing_history: [full] }] } });
    await replay('update_log', { id: LOG, updates: { viewing_history: { not: 'a list' } } });
    expect(mockHouse.asked.map((a) => a.op)).toEqual(['update']);
    expect(mockHouse.rows('logs')[0]?.viewing_history).toEqual({ not: 'a list' });
  });

  it('writes the phone\'s history as given, unsorted, when the server holds none as a list', async () => {
    const a = { ...full, date: JAN };
    const b = { ...full, date: MAR };
    expect(await merged(null, [a, b])).toEqual([a, b]);
  });

  it('writes nothing and reports done when the log is no longer there', async () => {
    mockHouse = supabaseFake({ rows: { logs: [] } });
    await expect(replay('update_log', { id: LOG, updates: { viewing_history: [full] } })).resolves.toEqual({});
    expect(mockHouse.asked.map((a) => a.op)).toEqual(['select', 'update']);
    expect(mockHouse.rows('logs')).toEqual([]);
  });
});
