/**
 * aWordWrittenIsKept.test.tsx — useKeptWords: what a member writes in a short box (a critique under a
 * log or a stack, a salon message) is kept once the box rests, taken up when they come back to the
 * same place and never in another, and let go once the house or the queue has it (P4.14, P4.32).
 */
import { useState } from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { KEPT_WORDS_REST_MS, putBackWords, useKeptWords } from '../useKeptWords';
import { useAuthStore } from '@/src/stores/auth';

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
beforeEach(() => { mockDrafts.clear(); useAuthStore.setState({ user: { id: 'me' } } as never); });
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

/** The last second's typing was lost when the box went before it rested (review round 1, 2026-11-14). */
it('keeps the words at once when the box goes before they rest, and never for a member signed out', async () => {
  const box = await renderHook(() => useKeptWords('me', 'critique', 'log:L'));
  jest.useFakeTimers();
  await act(async () => { box.result.current[1]('Gone in a second'); });
  expect(mockDrafts.get('me|critique|log:L')).toBeUndefined();
  await act(async () => { await box.unmount(); });
  expect(mockDrafts.get('me|critique|log:L')).toBe('Gone in a second');

  // Signed out while writing: the box going keeps nothing of theirs on the phone.
  mockDrafts.clear();
  const after = await renderHook(() => useKeptWords('me', 'critique', 'log:M'));
  await act(async () => { after.result.current[1]('Not to be left'); });
  useAuthStore.setState({ user: null } as never);
  await act(async () => { await after.unmount(); });
  expect(mockDrafts.size).toBe(0);
});

it('keeps the last place\'s words at once when the box moves to another place before they rest', async () => {
  const { result, rerender } = await renderHook(({ room }: { room: string }) => useKeptWords('me', 'salon', room), { initialProps: { room: 'R1' } });
  jest.useFakeTimers();
  await act(async () => { result.current[1]('For room one'); });
  await rerender({ room: 'R2' });
  expect(mockDrafts.get('me|salon|R1')).toBe('For room one');
  expect(result.current[0]).toBe('');
});

/** A sheet closed and opened again on the same place (stage C, every word written is kept). */
it('a box closed (no place) and opened again on the same place opens on the words kept for it', async () => {
  const { result, rerender } = await renderHook(({ at }: { at: string | null }) => useKeptWords('me', 'report', at), { initialProps: { at: 'log:L' as string | null } });
  await act(async () => { result.current[1]('What was seen'); });
  await rerender({ at: null });
  // Kept once the box closed; written again elsewhere meanwhile (another phone's put-back), the box
  // opens on the words as the phone holds them.
  expect(mockDrafts.get('me|report|log:L')).toBe('What was seen');
  mockDrafts.set('me|report|log:L', 'What was seen, and more');
  await rerender({ at: 'log:L' });
  expect(result.current[0]).toBe('What was seen, and more');
});

it('words let go as the box goes in the same moment are not kept again by its going', async () => {
  // The docket holds the place, as AppealsDocket holds its hearing: let go and closed in one act.
  const { result } = await renderHook(() => {
    const [at, setAt] = useState<string | null>('A');
    return { kept: useKeptWords('me', 'hearing', at), setAt };
  });
  jest.useFakeTimers();
  await act(async () => { result.current.kept[1]('The word for the member'); });
  // Heard: let go, and the sheet closes in the same moment, before the words rested.
  await act(async () => { result.current.kept[2](); result.current.setAt(null); });
  expect(mockDrafts.has('me|hearing|A')).toBe(false);
});

it('words refused after their box went are put back, after any written there since, for the member signed in alone', () => {
  putBackWords('me', 'share', 'F', 'A word with the film');
  expect(mockDrafts.get('me|share|F')).toBe('A word with the film');
  mockDrafts.set('me|share|G', 'Newer words');
  putBackWords('me', 'share', 'G', 'The refused words');
  expect(mockDrafts.get('me|share|G')).toBe('Newer words\n\nThe refused words');
  putBackWords('me', 'share', 'H', '   ');
  useAuthStore.setState({ user: { id: 'someone-else' } } as never);
  putBackWords('me', 'share', 'I', 'Not theirs to keep');
  expect([mockDrafts.has('me|share|H'), mockDrafts.has('me|share|I')]).toEqual([false, false]);
});
