/**
 * aWordWrittenIsKept.test.tsx — useKeptWords: what a member writes in a short box (a critique under a
 * log or a stack, a salon message) is kept once the box rests, taken up when they come back to the
 * same place and never in another, and let go once the house or the queue has it (P4.14, P4.32).
 */
import { act, renderHook } from '@testing-library/react-native';
import { KEPT_WORDS_REST_MS, useKeptWords } from '../useKeptWords';

const mockDrafts = new Map<string, string>();
jest.mock('@/src/utils/memberDrafts', () => ({
  readDraft: (m: string, k: string, s?: string) => {
    const body = mockDrafts.get(`${m}|${k}|${s}`);
    return body === undefined ? null : { data: { body } };
  },
  writeDraft: (m: string, k: string, d: { body: string }, s?: string) => { mockDrafts.set(`${m}|${k}|${s}`, d.body); return true; },
  clearDraft: (m: string, k: string, s?: string) => { mockDrafts.delete(`${m}|${k}|${s}`); },
}));

// The clock is stood still only after each render: the render itself settles on real timers.
beforeEach(() => { mockDrafts.clear(); });
afterEach(() => { jest.useRealTimers(); });

it('keeps the words once the box rests, and takes them up when the member comes back', async () => {
  const first = await renderHook(() => useKeptWords('me', 'critique', 'log:L'));
  jest.useFakeTimers();
  await act(async () => { first.result.current[1]('Half a thought'); });
  expect(mockDrafts.get('me|critique|log:L')).toBeUndefined();
  await act(async () => { jest.advanceTimersByTime(KEPT_WORDS_REST_MS); });
  expect(mockDrafts.get('me|critique|log:L')).toBe('Half a thought');
  jest.useRealTimers();
  const again = await renderHook(() => useKeptWords('me', 'critique', 'log:L'));
  expect(again.result.current[0]).toBe('Half a thought');
});

it('opens another place on its own words or none, and lets go of the words the house now has', async () => {
  mockDrafts.set('me|salon|R1', 'For room one');
  const { result, rerender } = await renderHook(({ room }: { room: string }) => useKeptWords('me', 'salon', room), { initialProps: { room: 'R1' } });
  expect(result.current[0]).toBe('For room one');
  await rerender({ room: 'R2' });
  expect(result.current[0]).toBe('');
  await rerender({ room: 'R1' });
  expect(result.current[0]).toBe('For room one');
  await act(async () => { result.current[2](); });
  expect([result.current[0], mockDrafts.has('me|salon|R1')]).toEqual(['', false]);
});

it('keeps nothing for no member or no place', async () => {
  const { result } = await renderHook(() => useKeptWords(null, 'critique', 'log:L'));
  jest.useFakeTimers();
  await act(async () => { result.current[1]('Words'); jest.advanceTimersByTime(KEPT_WORDS_REST_MS); });
  expect(mockDrafts.size).toBe(0);
});
