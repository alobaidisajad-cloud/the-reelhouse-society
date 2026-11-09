/**
 * aRequestThatNeverStartedIsAskedAgain.test.ts — a request Expo's native fetch refused to start is
 * asked once more.
 *
 * The nightly's route walk (run 42602365705) opened an essay cold from its link, and the reader's
 * first read failed in Expo's native fetch before it began: "Call to function 'NativeRequest.start'
 * has been rejected … Cannot use shared object that was already released". Nothing left the phone,
 * and the member was told the filing could not be reached. Such a request is asked once more,
 * whatever its method; any other failure is the caller's to hear, and a request the caller ended is
 * not asked again.
 */
import { fetchWithinLimit, neverStarted } from '@/src/lib/supabase';

const realFetch = global.fetch;
const NEVER_STARTED = new Error("fetch failed: Call to function 'NativeRequest.start' has been rejected.\n→ Caused by: The 1st argument cannot be cast to type class expo.modules.fetch.NativeRequest (received class java.lang.Integer)\n→ Caused by: Cannot use shared object that was already released");
const answer = () => new Response('[]', { status: 200 });

afterEach(() => { global.fetch = realFetch; });

it('asks once more a request the native fetch refused to start, and hands back its answer', async () => {
  const fetchMock = jest.fn().mockRejectedValueOnce(NEVER_STARTED).mockResolvedValueOnce(answer());
  global.fetch = fetchMock as unknown as typeof fetch;
  const res = await fetchWithinLimit('https://house.test/rest/v1/dispatch_posts?id=eq.1', { method: 'POST', body: '{}' });
  expect(res.status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ method: 'POST', body: '{}' }));
});

it('asks no failure again but that one: a network failure is the caller\'s to hear', async () => {
  const fetchMock = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
  global.fetch = fetchMock as unknown as typeof fetch;
  await expect(fetchWithinLimit('https://house.test/rest/v1/logs', {})).rejects.toThrow('Network request failed');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(neverStarted(new TypeError('Network request failed'))).toBe(false);
  expect(neverStarted(NEVER_STARTED)).toBe(true);
});

it('asks nothing again once the caller has ended the request', async () => {
  const controller = new AbortController();
  const fetchMock = jest.fn(async () => { controller.abort(); throw NEVER_STARTED; });
  global.fetch = fetchMock as unknown as typeof fetch;
  await expect(fetchWithinLimit('https://house.test/rest/v1/logs', { signal: controller.signal })).rejects.toBe(NEVER_STARTED);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
