/**
 * A log begun from a link takes each value in its kind (P4.4).
 *
 * `/log-modal?filmId=abc` began a log of film NaN at the rating step, and the poster path a link
 * carried went into the picture's address as it came. A film of another shape is no film: the log
 * begins at choosing one. A poster or a year of another shape is none. An amend whose id is of
 * another shape is a record withdrawn, never a new log, and the house is not asked for it.
 */
import { renderHook } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useLogFlow } from '@/src/hooks/useLogFlow';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { useVaultStore } from '@/src/stores/vaultStore';

const ME = '33333333-3333-4333-8333-333333333333';

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const begin = async (params: Record<string, string>) => {
  mockHouse = supabaseFake({ rows: { logs: [], log_private_notes: [] } });
  (useLocalSearchParams as jest.Mock).mockReturnValue(params);
  return (await renderHook(() => useLogFlow())).result;
};

beforeEach(() => {
  useVaultStore.getState().clear();
  useAuthStore.setState({ user: { id: ME, username: 'me', tier: 'cinephile', role: 'cinephile' } as never, isAuthenticated: true } as never);
  useFilmStore.setState({ logs: [], _loggedIndex: {} } as never);
});

it('a film of another shape is no film: the log begins at choosing one', async () => {
  for (const filmId of ['abc', '0', '-603', '603abc']) {
    const flow = await begin({ filmId, filmTitle: 'The Matrix' });
    expect([filmId, flow.current.step, flow.current.film]).toEqual([filmId, 0, null]);
  }
});

it('a film by its number begins at the log, its poster and year kept only in their kinds', async () => {
  const kept = await begin({ filmId: '603', filmTitle: 'The Matrix', filmPoster: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg', filmYear: '1999' });
  expect([kept.current.step, kept.current.film]).toEqual([1, { id: 603, title: 'The Matrix', poster_path: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg', release_date: '1999' }]);
  const refused = await begin({ filmId: '603', filmTitle: 'The\u0000 Matrix', filmPoster: '../../evil/x.jpg', filmYear: '99' });
  expect(refused.current.film).toEqual({ id: 603, title: 'The Matrix', poster_path: null, release_date: '' });
});

it('an amend whose id is of another shape is withdrawn, never a new log, and never asked for', async () => {
  const flow = await begin({ editLogId: 'abc', filmId: '603', filmTitle: 'The Matrix' });
  expect([flow.current.isEditing, flow.current.editRead, flow.current.editReady]).toEqual([true, 'withdrawn', false]);
  expect(mockHouse.asked.filter((a) => a.table === 'logs')).toEqual([]);
});
