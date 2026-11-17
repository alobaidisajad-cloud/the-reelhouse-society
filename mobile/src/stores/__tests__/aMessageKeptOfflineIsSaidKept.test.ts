/**
 * aMessageKeptOfflineIsSaidKept.test.ts — review round 10 (B5, the store's half)
 * ─────────────────────────────────────────────────────────────────────────────
 * A message sent with no connection is kept for the queue, and the store says so: "Message saved
 * offline. Will send when connected." It then answered `true`, as for a message the house took,
 * so a share sheet that waited on it said "Shared to lounge" over a share still waiting for the
 * wire. Now the store answers 'queued' for a message kept, and `true` only once the house has it.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useLoungeStore } from '../lounge';
import { enqueueMutation } from '../../utils/offlineQueue';
import reelToast from '../../utils/reelToast';

const L1 = '11111111-1111-4111-8111-111111111111';
const U1 = '33333333-3333-4333-8333-333333333333';
const UNREACHABLE = { code: '', message: 'Failed to fetch' };

let mockHouse = supabaseFake();
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: U1, username: 'ana', role: 'cinephile' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../../utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: jest.fn().mockReturnValue([]),
}));
jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});
const toast = reelToast as unknown as jest.Mock & { error: jest.Mock; success: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  useLoungeStore.setState({
    lounges: [], currentMessages: [], currentLoungeId: L1, sending: false,
    members: {}, messagesLoading: false, messagesFailed: false, typingUsers: {},
  } as never);
});

it('a message sent with no connection answers that it is kept for the wire, never that the house has it; one the house took answers true', async () => {
  mockHouse = supabaseFake({ rows: { lounge_messages: [] } });
  expect(await useLoungeStore.getState().sendMessage(L1, 'Taken by the house.')).toBe(true);
  expect(enqueueMutation).not.toHaveBeenCalled();

  mockHouse = supabaseFake({ rows: { lounge_messages: [] }, fail: { lounge_messages: UNREACHABLE } });
  const sent = await useLoungeStore.getState().sendMessage(L1, 'Kept for the wire.');
  expect(sent).toBe('queued');
  expect(enqueueMutation).toHaveBeenCalledTimes(1);
  // Said once, by the store, as kept: never as sent.
  expect([toast.mock.calls, toast.success.mock.calls, toast.error.mock.calls]).toEqual([
    [['Message saved offline. Will send when connected.']], [], [],
  ]);
});
