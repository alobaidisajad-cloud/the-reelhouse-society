/**
 * aRequestAnsweredOpensTheFile.test.ts — review round 3
 *
 * A member's follow request, accepted: the house turned it into a follow and sent "accepted your
 * follow request. You can now view their archive." The phone's follow list was read only at boot
 * and sign-in, so their file still said REQUESTED and stood sealed under that notice, a pull too,
 * until a relaunch. The notice arriving asks the follow list again.
 */
import { supabase } from '@/src/lib/supabase';
import { useNotificationStore } from '../notificationStore';

const mockHydrate = jest.fn(async () => {});
jest.mock('../domain/socialSlice', () => ({ hydrateFollowing: () => mockHydrate() }));

let mockInsert: ((payload: { new: unknown }) => void) | null = null;
const mockChannel: Record<string, unknown> = {};
Object.assign(mockChannel, {
  on: (_kind: string, _filter: unknown, handler: (payload: { new: unknown }) => void) => { mockInsert = handler; return mockChannel; },
  subscribe: () => mockChannel,
});
beforeEach(() => {
  (supabase.channel as unknown as jest.Mock).mockImplementation(() => mockChannel);
  mockHydrate.mockClear();
});
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));

const notice = (type: string) => ({
  new: {
    id: 'n-' + type, user_id: '33333333-3333-4333-8333-333333333333', type,
    message: 'accepted your follow request. You can now view their archive.',
    from_username: 'tomasreyes', from_user_id: '44444444-4444-4444-8444-444444444444',
    is_read: false, created_at: '2026-11-15T12:00:00.000Z',
  },
});

it('a request accepted asks the follow list again, so the file opens', () => {
  const leave = useNotificationStore.getState().setupRealtime();
  mockInsert?.(notice('follow_accept'));
  expect(useNotificationStore.getState().notifications.map((n) => n.id)).toContain('n-follow_accept');
  expect(mockHydrate).toHaveBeenCalledTimes(1);
  if (typeof leave === 'function') leave();
});

it('any other notice leaves the follow list as it is', () => {
  const leave = useNotificationStore.getState().setupRealtime();
  mockInsert?.(notice('follow'));
  expect(useNotificationStore.getState().notifications.map((n) => n.id)).toContain('n-follow');
  expect(mockHydrate).not.toHaveBeenCalled();
  if (typeof leave === 'function') leave();
});
