/**
 * aStackDeletedElsewhereIsLetGo.test.ts — round 11 (listSlice.updateList, and the queue's replay of
 * update_list in utils/mutationExecutor.ts), against the house as strict as it is
 * (test-utils/supabaseFake).
 *
 * A member amended a stack on one phone while it was deleted on their other phone (or removed by
 * the house). save_stack found no stack of theirs and said so (P0002), but the store knew only "it
 * changed since" (PT412) and the network: it put the stack back as it was, the sheet said "could
 * not be saved" on every SAVE, and the stack stayed in their list for ever. Now the stack is let go
 * of on the phone, as one deleted here is, and the sheet is told it is gone (STACK_GONE). An
 * amendment queued offline that meets the same answer is let go of too, and said, never held as an
 * unsent change that can never land.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { queryClient } from '@/src/lib/queryClient';
import { WALL_KEY } from '@/src/components/lobby/wallRead';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { STACK_GONE, STACK_GONE_SAID } from '@/src/stores/domain/listSlice';
import { executeMutation } from '@/src/utils/mutationExecutor';

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/utils/reelToast', () => {
  const t = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: t };
});
const toastError = () => (jest.requireMock('@/src/utils/reelToast').default as { error: jest.Mock }).error;

const ME = '33333333-3333-4333-8333-333333333333';
const STACK_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_ID = '55555555-5555-4555-8555-555555555555';
const GONE = { error: { code: 'P0002', message: 'No such stack of yours' } };

const stack = (id: string, title: string) => ({
  id, title, description: '', isPrivate: false, isRanked: false, userId: ME,
  createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', films: [{ id: 11, title: 'Sunrise', poster: null }],
});
/** The stack's page, the Reel's STACKS and the wall, each as the phone holds it: read once. */
const holdItsPages = () => {
  queryClient.setQueryData(['stack', STACK_ID], { list: stack(STACK_ID, 'Silents') });
  queryClient.setQueryData(['feed', 'stacks', 'community'], { pages: [[]], pageParams: [undefined] });
  queryClient.setQueryData(WALL_KEY, { pieces: [] });
};
const askedAgain = (key: readonly unknown[]) => !!queryClient.getQueryState(key)?.isInvalidated;

beforeEach(() => {
  toastError().mockClear();
  useAuthStore.setState({ user: { id: ME, username: 'me', tier: 'cinephile', role: 'cinephile' } as never, isAuthenticated: true } as never);
  useFilmStore.setState({ lists: [stack(STACK_ID, 'Silents'), stack(OTHER_ID, 'Talkies')] } as never);
  holdItsPages();
});
afterEach(() => {
  queryClient.removeQueries({ queryKey: ['stack'] });
  queryClient.removeQueries({ queryKey: ['feed'] });
  queryClient.removeQueries({ queryKey: WALL_KEY });
  useFilmStore.setState({ lists: [] } as never);
});

it('an amendment of a stack deleted elsewhere is told it is gone, and the stack leaves the phone, never put back', async () => {
  mockHouse = supabaseFake({ rpc: { save_stack: GONE } });
  const amended = useFilmStore.getState().updateList(STACK_ID, { title: 'Silents, Revised' });
  await expect(amended).rejects.toMatchObject({ code: STACK_GONE, message: STACK_GONE_SAID });
  // Out of the member's stacks, the other one kept.
  expect(useFilmStore.getState().lists.map((l) => l.title)).toEqual(['Talkies']);
  // Its page reads it again (and finds none), the Reel's STACKS and the wall are asked again.
  expect([askedAgain(['stack', STACK_ID]), askedAgain(['feed', 'stacks', 'community']), askedAgain(WALL_KEY)]).toEqual([true, true, true]);
});

it('a stack changed elsewhere is still told as changed, and kept', async () => {
  mockHouse = supabaseFake({ rpc: { save_stack: { error: { code: 'PT412', message: 'This stack was changed after this phone read it.' } } } });
  await expect(useFilmStore.getState().updateList(STACK_ID, { title: 'Silents, Revised' })).rejects.not.toMatchObject({ code: STACK_GONE });
  expect(useFilmStore.getState().lists.map((l) => l.title)).toEqual(['Silents', 'Talkies']);
});

it('an amendment queued offline that finds its stack deleted is let go of, here and on the phone, and said', async () => {
  mockHouse = supabaseFake({ rpc: { save_stack: GONE } });
  const answer = await executeMutation({
    id: 'q1', type: 'update_list', timestamp: 0,
    payload: { list_id: STACK_ID, user_id: ME, updates: { title: 'Silents, Revised' }, read_at: '2026-11-01T00:00:00Z' },
  }, {});
  // Delivered nowhere, and never sent again: answered, not thrown (a throw holds it as an unsent
  // change), and answered as let go, never as sent (review round 12).
  expect(answer).toEqual({ letGo: 'STACK_GONE' });
  expect(useFilmStore.getState().lists.map((l) => l.title)).toEqual(['Talkies']);
  expect(askedAgain(['stack', STACK_ID])).toBe(true);
  expect(toastError()).toHaveBeenCalledWith('A stack amended offline is no longer in the house: the amendment was let go.');
});

it('an amendment queued offline that the house refuses for another reason is still raised', async () => {
  mockHouse = supabaseFake({ rpc: { save_stack: { error: { code: '23514', message: 'check' } } } });
  await expect(executeMutation({
    id: 'q2', type: 'update_list', timestamp: 0,
    payload: { list_id: STACK_ID, user_id: ME, updates: { title: 'Silents, Revised' } },
  }, {})).rejects.toMatchObject({ code: '23514' });
  expect(useFilmStore.getState().lists.map((l) => l.title)).toEqual(['Silents', 'Talkies']);
});
