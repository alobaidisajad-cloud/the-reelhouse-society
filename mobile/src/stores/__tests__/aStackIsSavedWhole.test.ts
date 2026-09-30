/**
 * aStackIsSavedWhole.test.ts — making and editing a stack, as the store does it.
 *
 * A stack was saved in pieces: its row, then its films; its details, then an
 * upsert, then deletes worked out from the phone's copy. A refused second piece
 * left an empty stack the member could not see (the rollback's error was
 * discarded), and "remove all" discarded its error too. Now each save is ONE
 * call to save_stack (20260930_01), which the house carries out whole or not at
 * all — rehearsed against production in mobile/supabase/diagnostics/
 * stack_save_rehearsal.sql. Here: the store asks for exactly that, once, and
 * shows only what the house kept.
 */
const mockRpc = jest.fn();
const mockFrom = jest.fn();
jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (...a: unknown[]) => mockFrom(...a),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: jest.fn(),
  },
}));
jest.mock('@/src/stores/auth', () => {
  const s = { user: { id: 'member-1', username: 'kane' }, isAuthenticated: true };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useAuthStore as any).getState = () => s;
  (useAuthStore as any).subscribe = () => () => {};
  return { useAuthStore };
});
const mockEnqueue = jest.fn();
jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: (...a: unknown[]) => mockEnqueue(...a),
  flushOfflineQueue: jest.fn(), getOfflineQueue: () => [],
}));
jest.mock('@/src/utils/reelToast', () => {
  const t = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: t };
});

// eslint-disable-next-line import/first
import { useFilmStore } from '@/src/stores/films';

const FILMS = [
  { id: 11, title: 'Sunrise', poster: '/s.jpg' },
  { id: 22, title: 'Greed', poster_path: '/g.jpg' },
];
const saves = () => mockRpc.mock.calls.filter((c) => c[0] === 'save_stack');

beforeEach(() => {
  mockRpc.mockReset().mockResolvedValue({ data: { id: 'x', created_at: '2026-09-30T00:00:00Z' }, error: null });
  mockFrom.mockReset();
  mockEnqueue.mockReset();
  useFilmStore.setState({ lists: [] } as never);
});

describe('making a stack', () => {
  it('is one save of the stack and its films, in order', async () => {
    await useFilmStore.getState().createList({ title: 'Silents', description: 'Before sound.', isRanked: true, films: FILMS } as never);
    expect(saves()).toHaveLength(1);
    expect(saves()[0][1]).toEqual(expect.objectContaining({
      p_title: 'Silents', p_description: 'Before sound.', p_is_ranked: true, p_create: true,
      p_films: [
        { film_id: 11, film_title: 'Sunrise', poster_path: '/s.jpg', rank_position: 0 },
        { film_id: 22, film_title: 'Greed', poster_path: '/g.jpg', rank_position: 1 },
      ],
    }));
    // Never the old pieces.
    expect(mockFrom).not.toHaveBeenCalled();
    expect(useFilmStore.getState().lists.map((l) => l.title)).toEqual(['Silents']);
  });

  it('a refused save leaves no stack behind — on the page or in the house', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'check' } });
    await expect(useFilmStore.getState().createList({ title: 'Doomed', films: FILMS } as never)).rejects.toBeTruthy();
    expect(useFilmStore.getState().lists).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();   // no rollback to fail: nothing was kept
  });

  it('offline, it is queued whole, with its films', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Network request failed' } });
    await useFilmStore.getState().createList({ title: 'Later', films: FILMS } as never);
    expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({
      type: 'create_list',
      payload: expect.objectContaining({ title: 'Later', films: [expect.objectContaining({ film_id: 11 }), expect.objectContaining({ film_id: 22 })] }),
    }));
  });
});

describe('editing a stack', () => {
  const STACK = { id: 'stack-1', title: 'Silents', description: '', isRanked: true, isPrivate: false, films: [{ id: 11, title: 'Sunrise', poster: null }, { id: 33, title: 'Metropolis', poster: null }], userId: 'member-1' };

  it('saves exactly the films the member left, not a diff of the phone\'s copy', async () => {
    useFilmStore.setState({ lists: [STACK] } as never);
    await useFilmStore.getState().updateList('stack-1', { title: 'Silent Masters', films: [{ id: 22, title: 'Greed', poster: null }] } as never);
    expect(saves()).toHaveLength(1);
    expect(saves()[0][1]).toEqual(expect.objectContaining({
      p_id: 'stack-1', p_title: 'Silent Masters',
      p_films: [{ film_id: 22, film_title: 'Greed', poster_path: null, rank_position: 0 }],
    }));
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('a rename leaves the films alone', async () => {
    useFilmStore.setState({ lists: [STACK] } as never);
    await useFilmStore.getState().updateList('stack-1', { title: 'Renamed' } as never);
    expect(saves()[0][1]).toEqual(expect.objectContaining({ p_title: 'Renamed', p_films: null }));
  });

  it('a refused edit puts the page back as it was', async () => {
    useFilmStore.setState({ lists: [STACK] } as never);
    mockRpc.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'No such stack of yours' } });
    await expect(useFilmStore.getState().updateList('stack-1', { title: 'X', films: [] } as never)).rejects.toBeTruthy();
    const back = useFilmStore.getState().lists[0];
    expect(back.title).toBe('Silents');
    expect(back.films.map((f: { id: number }) => f.id)).toEqual([11, 33]);
  });
});
