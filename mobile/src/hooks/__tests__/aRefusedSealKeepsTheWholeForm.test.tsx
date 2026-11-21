/**
 * aRefusedSealKeepsTheWholeForm.test.tsx — a record the house refused is kept as the form held it.
 *
 * The draft kept while the member wrote held the whole form (review round 10), but a seal refused
 * wrote it back with the words and stars alone: the sheet reopened unmarked, CONTAINS SPOILERS and
 * the rest of the form gone, and sealed again, the review went out unveiled.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { useLogFlow } from '@/src/hooks/useLogFlow';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { clearDraft, readDraft } from '@/src/utils/memberDrafts';

const ME = '44444444-4444-4444-8444-444444444444';
beforeEach(() => {
  useAuthStore.setState({ user: { id: ME, username: 'me', tier: 'archivist', role: 'cinephile' } as never });
  for (const s of [undefined, '603']) clearDraft(ME, 'log', s);
});
afterEach(() => { (useLocalSearchParams as jest.Mock).mockReturnValue({}); for (const s of [undefined, '603']) clearDraft(ME, 'log', s); });

it('a seal refused puts the draft back with its spoiler mark, and the sheet reopened shows it marked', async () => {
  const refused = Object.assign(new Error('permission denied for table logs'), { code: '42501' });
  // Kept ahead for the queue first (its draft let go), then refused: the catch alone writes it back.
  const addLog = jest.fn(async (_l: unknown, o?: { onKeptAhead?: () => void }) => { o?.onKeptAhead?.(); throw refused; });
  useFilmStore.setState({ logs: [], _loggedIndex: {}, addLog } as never);
  (useLocalSearchParams as jest.Mock).mockReturnValue({ filmId: '603', filmTitle: 'The Matrix' });
  const h = await renderHook(() => useLogFlow());
  await waitFor(() => expect(h.result.current.film?.id).toBe(603));
  await act(async () => { h.result.current.setReview('Neo is the One.'); });
  await act(async () => { h.result.current.setRating(4); });
  await act(async () => { h.result.current.setIsSpoiler(true); });
  await act(async () => { await h.result.current.handleLog(); });
  await act(async () => { await h.unmount(); });
  expect(readDraft(ME, 'log', '603')?.data?.isSpoiler).toBe(true);
  const back = await renderHook(() => useLogFlow());
  await waitFor(() => expect(back.result.current.film?.id).toBe(603));
  expect(back.result.current.isSpoiler).toBe(true);
  expect(back.result.current.review).toBe('Neo is the One.');
  await act(async () => { await back.unmount(); });
});
