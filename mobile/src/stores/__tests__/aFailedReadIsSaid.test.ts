/**
 * aFailedReadIsSaid.test.ts — the member's own collections, when a read fails.
 *
 * Each of these resolved the same way whether it read a shelf or could not:
 * the profile's own rooms could not tell an empty collection from an
 * unreachable one, and drew "empty" over a record a member has. Each now
 * answers whether its read was answered — true, or false when it failed — and
 * leaves what is on screen as it was.
 */
import { supabase } from '../../lib/supabase';
import { useFilmStore } from '../films';

jest.mock('../auth', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({ user: { id: 'test-user-id', username: 'testuser', role: 'cinephile' } })),
    subscribe: jest.fn(() => jest.fn()),
  },
}));

/** Every read, answered with \`answer\` — a chain that is itself awaitable. */
function answering(answer: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const k of ['select', 'eq', 'in', 'not', 'neq', 'order', 'limit', 'or', 'range', 'abortSignal']) chain[k] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(answer).then(resolve);
  (supabase.from as unknown) = jest.fn(() => chain);
}

const FETCHES = [
  ['logs', () => useFilmStore.getState().fetchLogs()],
  ['watchlist', () => useFilmStore.getState().fetchWatchlist()],
  ['stacks', () => useFilmStore.getState().fetchLists()],
  ['shelf', () => useFilmStore.getState().fetchPhysicalArchive()],
] as const;

beforeEach(() => {
  useFilmStore.setState({
    _fetchingLogs: false, _fetchingWatchlist: false, _fetchingLists: false, _fetchingArchive: false,
  } as never);
});

describe('a read that failed is answered as failed', () => {
  it.each(FETCHES)('%s', async (_name, read) => {
    answering({ data: null, error: { message: 'Network request failed' } });
    await expect(read()).resolves.toBe(false);
  });
});

describe('a read that was answered, even with nothing in it, is answered', () => {
  it.each(FETCHES)('%s', async (_name, read) => {
    answering({ data: [], error: null });
    await expect(read()).resolves.toBe(true);
  });
});

describe('and a failed read leaves the collection on screen as it was', () => {
  it('the watchlist', async () => {
    const held = [{ id: 603, title: 'The Matrix', poster: null, poster_path: null, year: 1999 }];
    useFilmStore.setState({ watchlist: held } as never);
    answering({ data: null, error: { message: 'Network request failed' } });
    await useFilmStore.getState().fetchWatchlist();
    expect(useFilmStore.getState().watchlist).toEqual(held);
  });
});
