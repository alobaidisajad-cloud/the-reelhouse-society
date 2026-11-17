/**
 * aDraftComesBackAsItWasLeft.test.tsx — review round 10 (B1, useLogFlow)
 * ───────────────────────────────────────────────────────────────────────
 * A new record's draft kept the review, the stars and the note alone. Taken up again, a review
 * marked CONTAINS SPOILERS came back unmarked, and sealed, went out unveiled; a film left
 * part-watched came back WATCHED, dated today, without its company. Now the draft keeps the whole
 * form and each of its three restores takes it up: the launch that reopens the sheet the phone
 * closed, the sheet opened on the film, and the film taken from the search. WATCHED and REWATCHED
 * stay the film's own standing, read as the sheet opens; ABANDONED is the member's.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { useLogFlow } from '@/src/hooks/useLogFlow';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { clearDraft, writeDraft } from '@/src/utils/memberDrafts';

const ME = '44444444-4444-4444-8444-444444444444';
const SCOPES = [undefined, '603', '550'] as const;

/** The whole form as the member left it: a spoiler, a film walked out of, its day, its company. */
const LEFT = {
  filmId: 603, filmTitle: 'The Matrix', filmPoster: '/m.jpg', filmYear: '1999-03-31',
  review: 'Neo is the One, and the spoon is not there.', rating: 0, privateNotes: '',
  isSpoiler: true, status: 'abandoned', abandonedReason: 'The projector failed.', date: '2024-02-29',
  watchedWith: 'Trinity', physicalMedia: '4K UHD',
  autopsy: { story: 4, script: null, acting: 5, cinematography: null, editing: null, sound: null },
  altPoster: '/alt.jpg', editorialHeader: '/header.jpg', dropCap: true, pullQuote: 'There is no spoon.',
};
type Flow = ReturnType<typeof useLogFlow>;
/** The form, read as the sheet draws it. */
const formOf = (f: Flow) => ({
  review: f.review, isSpoiler: f.isSpoiler, status: f.status, abandonedReason: f.abandonedReason, date: f.date,
  watchedWith: f.watchedWith, physicalMedia: f.physicalMedia, autopsy: f.autopsy, altPoster: f.altPoster,
  editorialHeader: f.editorialHeader, dropCap: f.dropCap, pullQuote: f.pullQuote,
});
const AS_LEFT = {
  review: LEFT.review, isSpoiler: true, status: 'abandoned', abandonedReason: 'The projector failed.', date: '2024-02-29',
  watchedWith: 'Trinity', physicalMedia: '4K UHD', autopsy: LEFT.autopsy, altPoster: '/alt.jpg',
  editorialHeader: '/header.jpg', dropCap: true, pullQuote: 'There is no spoon.',
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: ME, username: 'me', tier: 'auteur', role: 'cinephile' } as never });
  useFilmStore.setState({ logs: [], _loggedIndex: {}, addLog: jest.fn().mockResolvedValue(undefined) } as never);
  for (const scope of SCOPES) clearDraft(ME, 'log', scope);
});
afterEach(() => {
  jest.useRealTimers();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  for (const scope of SCOPES) clearDraft(ME, 'log', scope);
});

it('a review marked CONTAINS SPOILERS, left unsent, comes back marked when the phone reopens the sheet, and is sealed veiled', async () => {
  // Written on the film's page, marked, and left: the form rests, the draft is kept.
  (useLocalSearchParams as jest.Mock).mockReturnValue({ filmId: '603', filmTitle: 'The Matrix' });
  const first = await renderHook(() => useLogFlow());
  await waitFor(() => expect(first.result.current.film?.id).toBe(603));
  jest.useFakeTimers();
  await act(async () => { first.result.current.setReview('Neo is the One.'); });
  await act(async () => { first.result.current.setRating(4); });
  await act(async () => { first.result.current.setIsSpoiler(true); });
  await act(async () => { jest.advanceTimersByTime(1500); });
  await act(async () => { await first.unmount(); });
  jest.useRealTimers();

  // The launch that reopens the sheet the phone closed: the record, marked as it was.
  (useLocalSearchParams as jest.Mock).mockReturnValue({ resume: 'draft' });
  const addLog = jest.fn().mockResolvedValue(undefined);
  useFilmStore.setState({ addLog } as never);
  const back = await renderHook(() => useLogFlow());
  await waitFor(() => expect(back.result.current.film?.id).toBe(603));
  expect([back.result.current.review, back.result.current.isSpoiler]).toEqual(['Neo is the One.', true]);
  await act(async () => { await back.result.current.handleLog(); });
  expect(addLog).toHaveBeenCalledWith(expect.objectContaining({ review: 'Neo is the One.', isSpoiler: true }), expect.anything());
  await act(async () => { await back.unmount(); });
});

it('the launch that reopens the sheet brings back the whole form: the walk-out and its reason, the day, the company, the format, the autopsy and the page', async () => {
  writeDraft(ME, 'log', LEFT);
  (useLocalSearchParams as jest.Mock).mockReturnValue({ resume: 'draft' });
  const h = await renderHook(() => useLogFlow());
  await waitFor(() => expect(h.result.current.film?.id).toBe(603));
  expect(formOf(h.result.current)).toEqual(AS_LEFT);
  await act(async () => { await h.unmount(); });
});

it('the sheet opened on the film brings back its whole form', async () => {
  writeDraft(ME, 'log', LEFT, '603');
  (useLocalSearchParams as jest.Mock).mockReturnValue({ filmId: '603', filmTitle: 'The Matrix' });
  const h = await renderHook(() => useLogFlow());
  await waitFor(() => expect(h.result.current.film?.id).toBe(603));
  expect(formOf(h.result.current)).toEqual(AS_LEFT);
  await act(async () => { await h.unmount(); });
});

it('the record offered on the search, taken up, brings back its whole form', async () => {
  writeDraft(ME, 'log', LEFT);
  const h = await renderHook(() => useLogFlow());
  const waiting = h.result.current.waitingDraft;
  expect(waiting).not.toBeNull();
  await act(async () => { h.result.current.selectFilm(waiting!.film); });
  expect(h.result.current.film?.id).toBe(603);
  expect(formOf(h.result.current)).toEqual(AS_LEFT);
  await act(async () => { await h.unmount(); });
});

it('a film logged since its draft was kept opens as a rewatch, its spoiler mark still on', async () => {
  // Kept as a first viewing; the film was logged from the website meanwhile.
  writeDraft(ME, 'log', { ...LEFT, status: 'watched', abandonedReason: '' }, '603');
  useFilmStore.setState({ _loggedIndex: { 603: { id: 'log-1', filmId: 603, title: 'The Matrix' } } } as never);
  (useLocalSearchParams as jest.Mock).mockReturnValue({ filmId: '603', filmTitle: 'The Matrix' });
  const h = await renderHook(() => useLogFlow());
  await waitFor(() => expect(h.result.current.film?.id).toBe(603));
  expect([h.result.current.status, h.result.current.isSpoiler]).toEqual(['rewatched', true]);
  await act(async () => { await h.unmount(); });
});

it('a film whose record was withdrawn since its draft was kept opens as a first viewing, its spoiler mark still on', async () => {
  // Kept as a rewatch; the earlier record is gone, so this is the film's first.
  writeDraft(ME, 'log', { ...LEFT, status: 'rewatched', abandonedReason: '' }, '603');
  (useLocalSearchParams as jest.Mock).mockReturnValue({ filmId: '603', filmTitle: 'The Matrix' });
  const h = await renderHook(() => useLogFlow());
  await waitFor(() => expect(h.result.current.film?.id).toBe(603));
  expect([h.result.current.status, h.result.current.isSpoiler]).toEqual(['watched', true]);
  await act(async () => { await h.unmount(); });
});
