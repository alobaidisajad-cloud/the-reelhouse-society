/**
 * A request ends at its deadline, once (P4.6).
 *
 * A request that ran out of time ended as a 'TimeoutError' with no code, and postgrest-js tries
 * any other fetch failure of a read three more times, a second, two and four apart: a read on a
 * hung connection (half-dead Wi-Fi, a captive portal) spun 67 seconds before its screen could say
 * it was not reached. It ends now as the house's DeadlineExceeded, coded ABORT_ERR, which ends the
 * whole call at one deadline; isNetworkError reads it as not reached, thrown or resolved, so a
 * write goes to the offline queue rather than being shown as failed; and one hit in ten is told to
 * Sentry by its host and path alone.
 *
 * Nor does postgrest-js ask a failed read again at all: the app keeps one layer of retries, its
 * own. A log sealed with no connection waited 16 seconds on a read asked again into a dead network.
 */
import { DeadlineExceeded, fetchWithinLimit, REQUEST_LIMIT_MS, supabase } from '@/src/lib/supabase';
import { captureDeadline } from '@/src/lib/sentry';
import { isNetworkError } from '@/src/utils/networkError';

// The real client, over the network this test plays: one that never answers.
jest.unmock('@supabase/supabase-js');
jest.mock('@/src/lib/sentry', () => ({ ...jest.requireActual('@/src/lib/sentry'), captureDeadline: jest.fn() }));
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: { getString: () => undefined, set: () => {}, delete: () => {}, getAllKeys: () => [], contains: () => false },
  setSensitive: () => {},
  isStorageEncrypted: () => true,
  withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
  storageReady: () => Promise.resolve(),
}));

/** A request the house never answers: it ends only when its signal does. */
const hang = jest.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((_answer, fail) => {
  init?.signal?.addEventListener('abort', () => fail(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
}));

beforeEach(() => {
  jest.useFakeTimers();
  hang.mockClear();
  (captureDeadline as jest.Mock).mockClear();
  jest.spyOn(globalThis, 'fetch').mockImplementation(hang as unknown as typeof fetch);
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
// The real client starts refreshing a session as it loads: stopped, so no timer outlives the file.
afterAll(() => supabase.auth.stopAutoRefresh());

it('ends a request that never answers at its deadline, as DeadlineExceeded, and not a moment before', async () => {
  let ended: unknown = null;
  void fetchWithinLimit('https://house.example/rest/v1/logs?select=id').catch((e) => { ended = e; });
  await jest.advanceTimersByTimeAsync(REQUEST_LIMIT_MS - 1);
  expect(ended).toBeNull();
  await jest.advanceTimersByTimeAsync(1);
  expect(ended).toBeInstanceOf(DeadlineExceeded);
  expect([(ended as DeadlineExceeded).name, (ended as DeadlineExceeded).code]).toEqual(['DeadlineExceeded', 'ABORT_ERR']);
});

it('a read that never answers ends once, at one deadline, and is read as not reached', async () => {
  let answer: { error: unknown } | null = null;
  void supabase.from('logs').select('id').then((r) => { answer = r; });
  await jest.advanceTimersByTimeAsync(REQUEST_LIMIT_MS);
  // One try: coded otherwise, postgrest-js asked three more times, 67 seconds in all.
  expect(hang).toHaveBeenCalledTimes(1);
  expect(answer).not.toBeNull();
  const error = (answer as unknown as { error: { message: string } }).error;
  expect(error.message).toMatch(/^DeadlineExceeded: /);
  expect(isNetworkError(error)).toBe(true);
});

it('a write that never answers is read as not reached: the queue takes it, never "failed"', async () => {
  let answer: { error: unknown } | null = null;
  void supabase.from('logs').insert({ film_id: 1 }).then((r) => { answer = r; });
  await jest.advanceTimersByTimeAsync(REQUEST_LIMIT_MS);
  expect(hang).toHaveBeenCalledTimes(1);
  expect(isNetworkError((answer as unknown as { error: unknown }).error)).toBe(true);
});

it('a deadline is told to Sentry one time in ten, by its host and path alone, never the query', async () => {
  (Math.random as jest.Mock).mockReturnValue(0.05);
  void fetchWithinLimit('https://house.example/rest/v1/logs?select=id&review=eq.my%20words').catch(() => {});
  await jest.advanceTimersByTimeAsync(REQUEST_LIMIT_MS);
  expect(captureDeadline).toHaveBeenCalledTimes(1);
  const [error, host, path] = (captureDeadline as jest.Mock).mock.calls[0] ?? [];
  expect([error instanceof DeadlineExceeded, host, path]).toEqual([true, 'house.example', '/rest/v1/logs']);
  expect(JSON.stringify((captureDeadline as jest.Mock).mock.calls)).not.toMatch(/words|select/);

  (Math.random as jest.Mock).mockReturnValue(0.5);
  void fetchWithinLimit('https://house.example/rest/v1/logs').catch(() => {});
  await jest.advanceTimersByTimeAsync(REQUEST_LIMIT_MS);
  expect(captureDeadline).toHaveBeenCalledTimes(1);
});

it('isNetworkError reads a deadline in both its shapes', () => {
  expect(isNetworkError(new DeadlineExceeded(15_000))).toBe(true);
  expect(isNetworkError({ message: 'DeadlineExceeded: The request timed out after 15000 ms', code: '' })).toBe(true);
});

describe('one layer of retries, the app\'s own', () => {
  /** A network with no connection: every request fails at once, as Android's does. */
  const refuse = jest.fn((_input: unknown, _init?: RequestInit) =>
    Promise.reject(new TypeError('fetch failed: java.net.ConnectException: Failed to connect')));

  it('a read that cannot connect is asked once, and ends at once as not reached', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(refuse as unknown as typeof fetch);
    refuse.mockClear();
    let answer: { error: unknown } | null = null;
    void supabase.from('logs').select('id').eq('film_id', 1).then((r) => { answer = r; });
    await jest.advanceTimersByTimeAsync(0);
    // With postgrest-js's own retries, it was asked three more times, seven seconds on.
    expect(answer).not.toBeNull();
    expect(refuse).toHaveBeenCalledTimes(1);
    expect(isNetworkError((answer as unknown as { error: unknown }).error)).toBe(true);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(refuse).toHaveBeenCalledTimes(1);
  });

  it('a function call and a read of another schema are asked once too', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(refuse as unknown as typeof fetch);
    refuse.mockClear();
    const answers: unknown[] = [];
    void supabase.rpc('get_lobby_wall').then((r) => { answers.push(r); });
    void supabase.schema('public').from('logs').select('id').then((r) => { answers.push(r); });
    await jest.advanceTimersByTimeAsync(10_000);
    expect(answers).toHaveLength(2);
    expect(refuse).toHaveBeenCalledTimes(2);
  });

  it('an answer of "busy" (503) is given to the caller as it came, never asked again beneath it', async () => {
    const busy = jest.fn((_input: unknown, _init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify({ message: 'busy' }), { status: 503 })));
    jest.spyOn(globalThis, 'fetch').mockImplementation(busy as unknown as typeof fetch);
    let answer: { status: number } | null = null;
    void supabase.from('logs').select('id').then((r) => { answer = r; });
    await jest.advanceTimersByTimeAsync(10_000);
    expect(busy).toHaveBeenCalledTimes(1);
    expect(answer).toMatchObject({ status: 503 });
  });
});
