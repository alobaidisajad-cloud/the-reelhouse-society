/**
 * A FILING'S MARK THAT LANDS LETS THE QUEUED ONE GO (review round 13, the Dispatch's acts), against
 * the house as strict as it is (test-utils/supabaseFake).
 *
 * A certification of a filing queued with a weak signal waited; the member withdrew it online; the
 * queue then sent the older certification, which reconciled to its own wish (certified) and made it
 * again. Each of the Dispatch's marks now goes online through the one door of its thing: when it
 * lands, the older mark of the same filing still queued is let go, and the queue never sends it. A
 * vote, which has no older wish to undo, goes as it is.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useAuthStore } from '@/src/stores/auth';
import { useDispatch } from '@/src/stores/dispatch';
import { storage } from '@/src/stores/mmkv-storage';
import { getOfflineQueue, type QueuedMutation } from '@/src/utils/offlineQueue';
import { QUEUE_KEY } from '@/src/utils/queueOwnership';

const ME = '33333333-3333-4333-8333-333333333333';
const POST = '66666666-6666-4666-8666-666666666666';

const mockHouse = supabaseFake({
  session: null,
  rows: { dispatch_certifications: [], dispatch_saves: [] },
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));
jest.mock('@/src/utils/reelToast', () => {
  const t = Object.assign(jest.fn(), { error: jest.fn(), info: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: t };
});

const queued = (m: Pick<QueuedMutation, 'id' | 'type' | 'payload'>): QueuedMutation => ({ ...m, timestamp: 1, owner: ME });
const settled = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => {
  storage.delete(QUEUE_KEY);
  useAuthStore.setState({ user: { id: ME, username: 'me' } as never, isAuthenticated: true } as never);
  useDispatch.setState({ certifiedIds: new Set<string>(), savedIds: new Set<string>() } as never);
});
afterEach(() => storage.delete(QUEUE_KEY));

it('a withdrawal that lands online lets go the certification still queued, so it is never made again', async () => {
  storage.set(QUEUE_KEY, JSON.stringify([queued({ id: 'older', type: 'certify_filing', payload: { post_id: POST, desired_state: true } })]));
  useDispatch.setState({ certifiedIds: new Set([POST]) } as never);
  useDispatch.getState().certify(POST, false);
  await settled();
  expect(getOfflineQueue()).toEqual([]);
  expect(useDispatch.getState().certifiedIds.has(POST)).toBe(false);
});

it('a save that lands online lets go the removal of it still queued', async () => {
  storage.set(QUEUE_KEY, JSON.stringify([queued({ id: 'older', type: 'unsave_filing', payload: { post_id: POST, user_id: ME } })]));
  useDispatch.getState().save(POST, true);
  await settled();
  expect(getOfflineQueue()).toEqual([]);
});
