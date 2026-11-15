/**
 * theLogSheetOpensWhereItWasAsked.test.tsx — the owner, 2026-11-15
 * ─────────────────────────────────────────────────────────────────
 * "When I log a film and search a film and choose it and I close it before I submit the log, when
 * I open it again I'm stuck on that movie until I log it."
 *
 * The sheet took up the last unsent record at every opening, and its film held the sheet: the
 * Concierge's "Log a Film" opened on that film, and going back to the search and closing brought
 * it back the next time. Now the sheet opens where it was asked to, on the search, and the record
 * waits at its head, one tap from where it was left. Only the launch that reopens the sheet the
 * phone closed behind the member (lastRoom.ts) takes the film up at once, as they were writing in
 * it (aRestoredNoteIsSent).
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { useLogFlow, waitingDraftOf } from '@/src/hooks/useLogFlow';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { clearDraft, readDraft, writeDraft } from '@/src/utils/memberDrafts';
import { ROOMS } from '@/src/utils/lastRoom';

const ME = '44444444-4444-4444-8444-444444444444';
const MATRIX = { filmId: 603, filmTitle: 'The Matrix', filmPoster: '/m.jpg', filmYear: '1999-03-31', review: 'Still the best.', rating: 4, privateNotes: 'Saw it with Dad.' };

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: ME, username: 'me', tier: 'archivist', role: 'cinephile' } as never });
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  clearDraft(ME, 'log');
  clearDraft(ME, 'log', '603');
  clearDraft(ME, 'log', '550');
});

it('opened with a record unsent, the sheet stands on the search and offers it', async () => {
  useFilmStore.setState({ logs: [], _loggedIndex: {} } as never);
  writeDraft(ME, 'log', MATRIX);
  const { result } = await renderHook(() => useLogFlow());
  expect([result.current.step, result.current.film]).toEqual([0, null]);
  expect(result.current.waitingDraft).toEqual({
    film: { id: 603, title: 'The Matrix', name: undefined, poster_path: '/m.jpg', release_date: '1999-03-31' },
    rating: 4,
    wrote: true,
  });
});

it('the record offered is taken up whole, words and note, and sealed as written', async () => {
  const addLog = jest.fn().mockResolvedValue(undefined);
  useFilmStore.setState({ logs: [], _loggedIndex: {}, addLog } as never);
  writeDraft(ME, 'log', MATRIX);
  const { result } = await renderHook(() => useLogFlow());
  const offered = result.current.waitingDraft!.film;
  await act(async () => { result.current.selectFilm(offered); });
  const r = result.current;
  expect([r.step, r.film?.id, r.review, r.rating, r.privateNotes]).toEqual([1, 603, 'Still the best.', 4, 'Saw it with Dad.']);
  await act(async () => { await result.current.handleLog(); });
  expect(addLog).toHaveBeenCalledWith(
    expect.objectContaining({ review: 'Still the best.', rating: 4, privateNotes: 'Saw it with Dad.' }),
    { onKeptAhead: expect.any(Function) },
  );
});

it('another film may be chosen over it, and the record still waits for its own', async () => {
  useFilmStore.setState({ logs: [], _loggedIndex: {} } as never);
  writeDraft(ME, 'log', MATRIX);
  const { result } = await renderHook(() => useLogFlow());
  await act(async () => { result.current.selectFilm({ id: 550, title: 'The Seventh Seal' }); });
  expect([result.current.film?.id, result.current.review, result.current.rating]).toEqual([550, '', 0]);
  expect(readDraft<typeof MATRIX>(ME, 'log', '603')?.data ?? readDraft<typeof MATRIX>(ME, 'log')?.data)
    .toEqual(expect.objectContaining({ filmId: 603, review: 'Still the best.' }));
});

it('back to the search keeps the words at once, and offers them as they stand', async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ filmId: '550', filmTitle: 'The Seventh Seal' });
  useFilmStore.setState({ logs: [], _loggedIndex: {} } as never);
  const { result } = await renderHook(() => useLogFlow());
  expect(result.current.step).toBe(1);
  await act(async () => { result.current.setRating(3); });
  // At once: the second the form rests has not passed.
  await act(async () => { result.current.backToSearch(); });
  expect(result.current.step).toBe(0);
  expect(result.current.waitingDraft).toEqual(expect.objectContaining({ film: expect.objectContaining({ id: 550, title: 'The Seventh Seal' }), rating: 3, wrote: false }));
});

it('another film opens a clean form: nothing of the last film is carried onto it', async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ filmId: '550', filmTitle: 'The Seventh Seal' });
  useFilmStore.setState({ logs: [], _loggedIndex: {} } as never);
  const { result } = await renderHook(() => useLogFlow());
  await act(async () => {
    result.current.setStatus('abandoned');
    result.current.setAbandonedReason('Too slow for me.');
    result.current.setWatchedWith('Ana');
    result.current.setAltPoster('/the-seventh-seal-alt.jpg');
  });
  await act(async () => { result.current.backToSearch(); });
  await act(async () => { result.current.selectFilm({ id: 603, title: 'The Matrix' }); });
  const r = result.current;
  expect([r.film?.id, r.status, r.abandonedReason, r.watchedWith, r.altPoster]).toEqual([603, 'watched', '', '', null]);
});

it('the same film taken again keeps all it holds', async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ filmId: '550', filmTitle: 'The Seventh Seal' });
  useFilmStore.setState({ logs: [], _loggedIndex: {} } as never);
  const { result } = await renderHook(() => useLogFlow());
  await act(async () => { result.current.setWatchedWith('Ana'); result.current.setRating(3); });
  await act(async () => { result.current.backToSearch(); });
  await act(async () => { result.current.selectFilm({ id: 550, title: 'The Seventh Seal' }); });
  expect([result.current.film?.id, result.current.watchedWith, result.current.rating]).toEqual([550, 'Ana', 3]);
});

it('going back from a film finds the search as it was left', async () => {
  useFilmStore.setState({ logs: [], _loggedIndex: {} } as never);
  const { result } = await renderHook(() => useLogFlow());
  await act(async () => { result.current.setSearchQuery('seventh'); });
  await act(async () => { result.current.selectFilm({ id: 550, title: 'The Seventh Seal' }); });
  await act(async () => { result.current.backToSearch(); });
  expect([result.current.step, result.current.searchQuery]).toEqual([0, 'seventh']);
});

it('a sheet with nothing unsent offers nothing', async () => {
  useFilmStore.setState({ logs: [], _loggedIndex: {} } as never);
  const { result } = await renderHook(() => useLogFlow());
  expect([result.current.step, result.current.waitingDraft]).toEqual([0, null]);
});

it('the launch that reopens the sheet asks for the draft to be taken up', async () => {
  expect(ROOMS['log-modal'].href).toBe('/log-modal?resume=draft');
  (useLocalSearchParams as jest.Mock).mockReturnValue({ resume: 'draft' });
  useFilmStore.setState({ logs: [], _loggedIndex: {} } as never);
  writeDraft(ME, 'log', MATRIX);
  const { result } = await renderHook(() => useLogFlow());
  await waitFor(() => expect(result.current.film?.id).toBe(603));
  expect([result.current.step, result.current.waitingDraft]).toEqual([1, null]);
});

it('a draft that names no film is offered as none', () => {
  expect(waitingDraftOf({ review: 'Words alone.' })).toBeNull();
  expect(waitingDraftOf({ filmId: 'abc' })).toBeNull();
  expect(waitingDraftOf({ filmId: -3 })).toBeNull();
  expect(waitingDraftOf(null)).toBeNull();
  expect(waitingDraftOf({ filmId: '603', filmTitle: '  ', rating: 0, review: ' ' }))
    .toEqual({ film: { id: 603, title: undefined, name: undefined, poster_path: null, release_date: undefined }, rating: 0, wrote: false });
});
