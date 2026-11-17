/**
 * aRewatchSealedLeavesNoDraft.test.tsx — review round 10 (B3, useLogFlow)
 * ────────────────────────────────────────────────────────────────────────
 * A rewatch sealed within a second of the last tap came back as YOUR UNSENT RECORD. A new record
 * kept for sending stops the draft's timer as it is kept (onKeptAhead); a rewatch keeps no copy for
 * the queue, so that never ran, and the timer from the last tap, still out, wrote the sealed record
 * back as a draft a moment later. Now the seal stops the timer with the draft.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { useLogFlow } from '@/src/hooks/useLogFlow';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { clearDraft, readDraft } from '@/src/utils/memberDrafts';

const ME = '44444444-4444-4444-8444-444444444444';
const LOGGED = { 603: { id: 'log-1', filmId: 603, title: 'The Matrix' } };

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: ME, username: 'me', tier: 'archivist', role: 'cinephile' } as never });
  clearDraft(ME, 'log');
  clearDraft(ME, 'log', '603');
});
afterEach(() => {
  jest.useRealTimers();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  clearDraft(ME, 'log');
  clearDraft(ME, 'log', '603');
});

it('a rewatch sealed within a second of the last word leaves no unsent record behind, and the next opening offers none', async () => {
  // A rewatch, as the store files one: merged into the record the film has, nothing kept for the queue.
  const addLog = jest.fn(async (_log: unknown, _opts?: { onKeptAhead?: () => void }) => undefined);
  useFilmStore.setState({ logs: [], _loggedIndex: LOGGED, addLog } as never);
  (useLocalSearchParams as jest.Mock).mockReturnValue({ filmId: '603', filmTitle: 'The Matrix' });
  const h = await renderHook(() => useLogFlow());
  await waitFor(() => expect(h.result.current.film?.id).toBe(603));
  expect(h.result.current.isRewatchMode).toBe(true);

  jest.useFakeTimers();
  await act(async () => { h.result.current.setReview('Better the second time.'); });
  await act(async () => { h.result.current.setRating(5); });
  // Sealed at once, before the form has rested.
  await act(async () => { await h.result.current.handleLog(); });
  expect(addLog).toHaveBeenCalledTimes(1);
  // The second the form would have rested passes: nothing is written back.
  await act(async () => { jest.advanceTimersByTime(1500); });
  expect([readDraft(ME, 'log', '603'), readDraft(ME, 'log')]).toEqual([null, null]);
  await act(async () => { await h.unmount(); });
  jest.useRealTimers();

  // Opened again from the Concierge: the search, and no record waiting at its head.
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  const next = await renderHook(() => useLogFlow());
  expect(next.result.current.waitingDraft).toBeNull();
  await act(async () => { await next.unmount(); });
});
