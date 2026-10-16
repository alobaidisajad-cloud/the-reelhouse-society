/**
 * In the sealed E2E build, the client's fetch writes each request it made and how it ended (its
 * status, or the error it met) to the device log (WORKLIST P0.75): a fault run matches each to the
 * gateway's log line, so an answer the house sent and the app never heard is seen from both sides.
 * In any other build it writes nothing.
 */
type Fetch = typeof fetch;

/** The client's fetch, loaded as the E2E build (`e2e`) or a store build loads it. */
const loadFetch = (e2e: boolean): Fetch => {
  let f: Fetch | undefined;
  jest.isolateModules(() => {
    jest.doMock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: e2e ? { e2e: true } : {} } } }));
    f = (require('@/src/lib/supabase') as { fetchWithinLimit: Fetch }).fetchWithinLimit;
  });
  return f as Fetch;
};

const realFetch = global.fetch;
let warned: string[];
beforeEach(() => {
  warned = [];
  jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => { warned.push(String(args[0])); });
});
afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

/** The request lines written, their detail read back. */
const requests = () => warned.filter((w) => w.startsWith('[e2e] request ')).map((w) => JSON.parse(w.slice('[e2e] request '.length)));

it('writes each request: its method, its path with its query, when it began, and the status it got', async () => {
  global.fetch = jest.fn(async () => ({ status: 201 })) as unknown as Fetch;
  const before = Date.now();
  await loadFetch(true)('http://10.0.2.2:54330/rest/v1/logs?select=id', { method: 'post' });
  const [line] = requests();
  expect(line).toEqual({ method: 'POST', path: '/rest/v1/logs?select=id', at: expect.any(String), status: 201 });
  expect(Date.parse(line.at)).toBeGreaterThanOrEqual(before - 1);
});

it('writes the error a request met instead of an answer, a lost connection as itself', async () => {
  global.fetch = jest.fn(async () => { throw new TypeError('Network request failed'); }) as unknown as Fetch;
  await expect(loadFetch(true)('http://10.0.2.2:54330/rest/v1/films')).rejects.toThrow('Network request failed');
  expect(requests()).toEqual([{ method: 'GET', path: '/rest/v1/films', at: expect.any(String), error: 'TypeError: Network request failed' }]);
});

it('writes a request given up at its limit as timed out', async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn((_: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
  })) as unknown as Fetch;
  const pending = loadFetch(true)('http://10.0.2.2:54330/rest/v1/logs', { method: 'PATCH' });
  const settled = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
  await jest.advanceTimersByTimeAsync(15_000);
  await settled;
  expect(requests()).toEqual([{ method: 'PATCH', path: '/rest/v1/logs', at: expect.any(String), error: 'TimeoutError: The request timed out after 15000 ms' }]);
});

it('writes nothing in any other build', async () => {
  global.fetch = jest.fn(async () => ({ status: 200 })) as unknown as Fetch;
  await loadFetch(false)('https://example.supabase.co/rest/v1/films');
  expect(requests()).toEqual([]);
});
