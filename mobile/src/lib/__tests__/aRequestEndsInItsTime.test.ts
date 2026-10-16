/**
 * aRequestEndsInItsTime.test.ts — every request to the house is given up when
 * its time runs out.
 *
 * Android's networking waits on a connection with no limit of its own. In the
 * Sealed E2E (run 38837073968, offline_resilience) the phone came back on
 * mobile data and moved to Wi-Fi four seconds later; the queue's send had
 * opened its requests on the first network and nothing answered for over
 * thirty seconds, so the member's offline log was not sent in that time.
 * The client's fetch now ends each request at its limit, as a network
 * failure the queue keeps the write for; a caller's own cancel stays the
 * caller's.
 */
import { fetchHearingRefusals, fetchWithinLimit, REQUEST_LIMIT_MS, STORAGE_LIMIT_MS } from '@/src/lib/supabase';
import { isNetworkError } from '@/src/utils/networkError';

const realFetch = global.fetch;
/** A server that never answers: the request waits until its signal ends it, as fetch does (at once if already ended). */
const neverAnswers = jest.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
  const aborted = () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
  if (init?.signal?.aborted) aborted();
  else init?.signal?.addEventListener('abort', aborted);
}));

beforeEach(() => {
  jest.useFakeTimers();
  neverAnswers.mockClear();
  global.fetch = neverAnswers as unknown as typeof fetch;
});
afterEach(() => {
  jest.useRealTimers();
  global.fetch = realFetch;
});

/** How a request ended, read when it ends: 'pending' while it still waits. */
const watch = (p: Promise<unknown>) => {
  const seen = { state: 'pending' as string, error: undefined as unknown };
  p.then(() => { seen.state = 'answered'; }, (e) => { seen.state = 'failed'; seen.error = e; });
  return seen;
};
const settle = () => Promise.resolve().then(() => Promise.resolve());

describe('a request with no answer', () => {
  it('is given up at its limit as not reached, and the queue reads it as a network failure', async () => {
    const seen = watch(fetchWithinLimit('https://house.test/rest/v1/logs', { method: 'POST' }));
    jest.advanceTimersByTime(REQUEST_LIMIT_MS - 1);
    await settle();
    expect(seen.state).toBe('pending');
    jest.advanceTimersByTime(1);
    await settle();
    expect(seen.state).toBe('failed');
    expect((seen.error as Error).name).toBe('TimeoutError');
    expect(isNetworkError(seen.error)).toBe(true);
    // supabase-js answers it as { error: { message: "TimeoutError: …" } }: the same.
    expect(isNetworkError({ message: `TimeoutError: ${(seen.error as Error).message}` })).toBe(true);
  });

  it('through the client\'s own fetch too', async () => {
    const seen = watch(fetchHearingRefusals('https://house.test/rest/v1/rpc/x', { method: 'POST' }));
    jest.advanceTimersByTime(REQUEST_LIMIT_MS);
    await settle();
    expect((seen.error as Error).name).toBe('TimeoutError');
  });

  it('to storage, where a picture goes up, waits longer', async () => {
    const seen = watch(fetchWithinLimit('https://house.test/storage/v1/object/avatars/a.jpg', { method: 'POST' }));
    jest.advanceTimersByTime(REQUEST_LIMIT_MS);
    await settle();
    expect(seen.state).toBe('pending');
    jest.advanceTimersByTime(STORAGE_LIMIT_MS - REQUEST_LIMIT_MS);
    await settle();
    expect((seen.error as Error).name).toBe('TimeoutError');
  });
});

describe('a caller\'s own cancel', () => {
  it('ends the request as the caller\'s, before any limit', async () => {
    const caller = new AbortController();
    const seen = watch(fetchWithinLimit('https://house.test/rest/v1/logs', { signal: caller.signal }));
    caller.abort();
    await settle();
    expect(seen.state).toBe('failed');
    expect((seen.error as Error).name).toBe('AbortError');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('given already cancelled, sends nothing that waits', async () => {
    const caller = new AbortController();
    caller.abort();
    const seen = watch(fetchWithinLimit('https://house.test/rest/v1/logs', { signal: caller.signal }));
    await settle();
    expect((seen.error as Error).name).toBe('AbortError');
  });
});

describe('a request answered in time', () => {
  it('comes back untouched, and leaves no timer behind', async () => {
    const answer = new Response(JSON.stringify([{ id: 1 }]), { status: 200 });
    global.fetch = jest.fn().mockResolvedValue(answer) as unknown as typeof fetch;
    const res = await fetchWithinLimit('https://house.test/rest/v1/logs');
    expect(res).toBe(answer);
    expect(jest.getTimerCount()).toBe(0);
  });
});
