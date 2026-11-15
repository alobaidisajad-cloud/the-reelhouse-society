/**
 * eachFilmKeepsItsOwnDraft.test.tsx — a new record's draft is kept for its film.
 *
 * One draft served every film: opening the log sheet on film B, with film A's unsent review on the
 * phone, matched neither branch of the restore, and a second later the empty form's save cleared
 * the one draft, film A's review, rating and private note gone without a word (review round 1,
 * 2026-11-14). Each film keeps its own; the latest, unscoped, is the one a sheet opened on no film
 * takes up.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { useLogFlow } from '@/src/hooks/useLogFlow';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { readDraft, writeDraft, clearDraft } from '@/src/utils/memberDrafts';

const ME = '44444444-4444-4444-8444-444444444444';
const A = { filmId: 603, filmTitle: 'The Matrix', review: 'Still the best.', rating: 4, privateNotes: 'Saw it with Dad.' };

/** The clock is stood still only after each render: the render itself settles on real timers. */
beforeEach(() => {
  useAuthStore.setState({ user: { id: ME, username: 'me', tier: 'archivist', role: 'cinephile' } as never });
  useFilmStore.setState({ logs: [], _loggedIndex: {}, addLog: jest.fn().mockResolvedValue(undefined) } as never);
  for (const scope of [undefined, '603', '550']) clearDraft(ME, 'log', scope);
});
afterEach(() => { jest.useRealTimers(); (useLocalSearchParams as jest.Mock).mockReturnValue({}); });

/** The sheet opened on film B, The Seventh Seal, from its page. */
const openOnB = async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ filmId: '550', filmTitle: 'The Seventh Seal' });
  const hook = await renderHook(() => useLogFlow());
  await waitFor(() => expect(hook.result.current.film?.id).toBe(550));
  return hook;
};

it('keeps film A\'s draft when the sheet opens on film B and stands empty', async () => {
  writeDraft(ME, 'log', A);
  await openOnB();
  jest.useFakeTimers();
  await act(async () => { jest.advanceTimersByTime(1500); });
  expect(readDraft<typeof A>(ME, 'log')?.data).toMatchObject({ filmId: 603, review: 'Still the best.', privateNotes: 'Saw it with Dad.' });
});

it('keeps film A\'s draft in its own place when film B is written, and opens each on its own', async () => {
  writeDraft(ME, 'log', A);
  const b = await openOnB();
  expect(b.result.current.review).toBe('');
  jest.useFakeTimers();
  await act(async () => { b.result.current.setReview('Death plays chess.'); });
  await act(async () => { jest.advanceTimersByTime(1500); });
  expect(readDraft<typeof A>(ME, 'log', '603')?.data).toMatchObject({ review: 'Still the best.', rating: 4 });
  expect(readDraft<typeof A>(ME, 'log', '550')?.data).toMatchObject({ review: 'Death plays chess.' });
  await act(async () => { await b.unmount(); });
  jest.useRealTimers();

  // Opened on film A again, from its page: its own words, not film B's.
  (useLocalSearchParams as jest.Mock).mockReturnValue({ filmId: '603', filmTitle: 'The Matrix' });
  const a = await renderHook(() => useLogFlow());
  await waitFor(() => expect(a.result.current.film?.id).toBe(603));
  expect(a.result.current.review).toBe('Still the best.');
  expect(a.result.current.privateNotes).toBe('Saw it with Dad.');
  await act(async () => { await a.unmount(); });
});

/** The last second's typing was lost when the sheet went before the form rested (review round 1). */
it('keeps the words at once when the sheet goes before they rest, and keeps none once sealed', async () => {
  const b = await openOnB();
  await act(async () => { b.result.current.setReview('Written, then closed.'); });
  await act(async () => { await b.unmount(); });
  expect(readDraft<typeof A>(ME, 'log', '550')?.data).toMatchObject({ review: 'Written, then closed.' });

  // Sealed, then closed at once: the record is sealed, and no draft of it is left to reopen.
  for (const scope of [undefined, '550']) clearDraft(ME, 'log', scope);
  const sealed = await openOnB();
  await act(async () => { sealed.result.current.setReview('Sealed at once.'); });
  await act(async () => { await sealed.result.current.handleLog(); });
  await act(async () => { await sealed.unmount(); });
  expect(readDraft(ME, 'log', '550')).toBeNull();
  expect(readDraft(ME, 'log')).toBeNull();
});
