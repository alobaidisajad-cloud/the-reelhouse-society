/**
 * A film already logged opens as a rewatch, and is filed as one.
 *
 * The form starts a logged film as `rewatched`, and the reset meant for ANOTHER record ran on the
 * first frame too and put it back to `watched`: a rewatch was filed as a first viewing unless the
 * member noticed. The default follows the film; a status the member chose stays theirs.
 */
import { act, renderHook } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { useLogFlow } from '@/src/hooks/useLogFlow';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { clearDraft } from '@/src/utils/memberDrafts';

const ME = '33333333-3333-4333-8333-333333333333';
const MATRIX = { id: 603, title: 'The Matrix', poster_path: null, release_date: '1999' };
const LOGGED = { 603: { id: 'log-1', filmId: 603, title: 'The Matrix' } };

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: ME, username: 'me', tier: 'archivist', role: 'cinephile' } as never });
  useFilmStore.setState({ logs: [], _loggedIndex: LOGGED } as never);
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  clearDraft(ME, 'log');
});

it('opens a logged film as a rewatch, and keeps it one', async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ filmId: '603', filmTitle: 'The Matrix' });
  const { result } = await renderHook(() => useLogFlow());
  expect(result.current.isRewatchMode).toBe(true);
  expect(result.current.status).toBe('rewatched');
});

it('a logged film picked in the form becomes a rewatch', async () => {
  const { result } = await renderHook(() => useLogFlow());
  expect(result.current.status).toBe('watched');
  await act(async () => { result.current.setFilm(MATRIX); });
  expect(result.current.status).toBe('rewatched');
});

it('a status the member chose is not taken from them', async () => {
  const { result } = await renderHook(() => useLogFlow());
  await act(async () => { result.current.setStatus('abandoned'); });
  await act(async () => { result.current.setFilm(MATRIX); });
  expect(result.current.status).toBe('abandoned');
});
