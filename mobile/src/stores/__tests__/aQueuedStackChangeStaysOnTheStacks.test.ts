/**
 * aQueuedStackChangeStaysOnTheStacks.test.ts — the member's stacks read again keep the changes still queued.
 *
 * A film added to a stack or taken off it offline, and a stack's name changed offline, wait in the
 * queue. Read again, the stacks laid the house's copy over them: the film added vanished, the one taken
 * off came back, and the old name returned, all while the change still waited to be sent.
 */
import { supabase } from '../../lib/supabase';
import { useFilmStore } from '../films';

jest.mock('../auth', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({ user: { id: 'u1', username: 'vesper', role: 'archivist' } })),
    subscribe: jest.fn(() => jest.fn()),
  },
}));

let mockQueue: { type: string; payload: Record<string, unknown>; timestamp: number; owner?: string }[] = [];
jest.mock('../../utils/offlineQueue', () => ({ getOfflineQueue: () => mockQueue, enqueueMutation: jest.fn(() => true) }));

/** The stacks' read, answered with these rows. */
function answering(rows: Record<string, unknown>[]) {
  const chain: Record<string, unknown> = {};
  for (const k of ['select', 'eq', 'order', 'limit', 'or']) chain[k] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve);
  (supabase.from as unknown) = jest.fn(() => chain);
}

const item = (filmId: number, rank: number) => ({ id: `i${filmId}`, film_id: filmId, film_title: `Film ${filmId}`, poster_path: null, rank_position: rank });
const STACK = {
  id: 's1', user_id: 'u1', title: 'Noir', description: '', is_ranked: false, is_private: false,
  created_at: '2026-11-01T00:00:00Z', list_items: [item(1, 0), item(2, 1)],
};

beforeEach(() => {
  mockQueue = [];
  useFilmStore.setState({ lists: [], _listsCursor: null, listsHasMore: true, _fetchingLists: false } as never);
});

it('keeps a film added and one taken off offline, and a name changed, while each waits', async () => {
  mockQueue = [
    { type: 'add_film_to_list', timestamp: 1, owner: 'u1', payload: { list_id: 's1', film_id: 9, film_title: 'Late Spring', poster_path: '/l.jpg' } },
    { type: 'remove_film_from_list', timestamp: 2, owner: 'u1', payload: { list_id: 's1', film_id: 1 } },
    { type: 'update_list', timestamp: 3, owner: 'u1', payload: { list_id: 's1', user_id: 'u1', updates: { title: 'Noir, Amended', is_private: true } } },
    // Left by another member on this phone: never laid on.
    { type: 'add_film_to_list', timestamp: 4, owner: 'u2', payload: { list_id: 's1', film_id: 6, film_title: 'Not mine' } },
  ];
  answering([STACK]);
  await useFilmStore.getState().fetchLists();
  const s1 = useFilmStore.getState().lists.find((l) => l.id === 's1')!;
  expect({ title: s1.title, isPrivate: s1.isPrivate, films: s1.films.map((f) => f.id) }).toEqual({ title: 'Noir, Amended', isPrivate: true, films: [2, 9] });
});

it('a film list set by a queued edit, then a film added after it, stands in the order they were made', async () => {
  mockQueue = [
    { type: 'update_list', timestamp: 1, owner: 'u1', payload: { list_id: 's1', user_id: 'u1', updates: {}, films: [{ id: 2, title: 'Film 2' }, { id: 1, title: 'Film 1' }] } },
    { type: 'add_film_to_list', timestamp: 2, owner: 'u1', payload: { list_id: 's1', film_id: 3, film_title: 'Film 3' } },
  ];
  answering([STACK]);
  await useFilmStore.getState().fetchLists();
  expect(useFilmStore.getState().lists[0]?.films.map((f) => f.id)).toEqual([2, 1, 3]);
});
