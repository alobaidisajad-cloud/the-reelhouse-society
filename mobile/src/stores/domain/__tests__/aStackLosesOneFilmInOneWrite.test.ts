/**
 * aStackLosesOneFilmInOneWrite.test.ts — taking a film out of a stack.
 *
 * It was two writes: delete the film, then renumber every film after it. When
 * the second was refused, the store put the film back on screen — a film the
 * server had already deleted. Now it is one write, the film alone; the films
 * after it keep their positions (a gap orders the same), and a refusal of
 * that one write is the only thing that restores the film.
 */
import { create } from 'zustand';
import { createListSlice, type ListSlice } from '../listSlice';

const mockWrites: { table: string; op: string }[] = [];
let mockDeleteError: unknown = null;
jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.eq = () => chain;
      chain.delete = () => { mockWrites.push({ table, op: 'delete' }); return chain; };
      chain.upsert = () => { mockWrites.push({ table, op: 'upsert' }); return chain; };
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: mockDeleteError }).then(res);
      return chain;
    },
    rpc: jest.fn(),
  },
}));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: 'me' } }) } }));
jest.mock('@/src/stores/domain/helpers/sessionGuard', () => ({ stillSignedIn: () => true }));
jest.mock('@/src/utils/reelToast', () => Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

const films = [1, 2, 3].map((id) => ({ id, title: `Film ${id}`, poster: null }));
const store = () => {
  const s = create<ListSlice>()((...a) => createListSlice(...a));
  s.setState({ lists: [{ id: 'stack', title: 'Silents', films: [...films] } as never] });
  return s;
};

beforeEach(() => { mockWrites.length = 0; mockDeleteError = null; });

it('deletes the one film, and writes nothing else', async () => {
  const s = store();
  await s.getState().removeFilmFromList('stack', 1);
  expect(mockWrites).toEqual([{ table: 'list_items', op: 'delete' }]);
  expect(s.getState().lists[0].films.map((f) => f.id)).toEqual([2, 3]);
});

it('a refused removal puts the film back where it was', async () => {
  mockDeleteError = { code: '42501', message: 'refused' };
  const s = store();
  await s.getState().removeFilmFromList('stack', 2);
  expect(s.getState().lists[0].films.map((f) => f.id)).toEqual([1, 2, 3]);
});
