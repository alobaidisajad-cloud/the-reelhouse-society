/**
 * WORDS REFUSED FOR THE RANK ARE KEPT (P4.16).
 *
 * A salon message written offline by a member whose rank ended before it was sent was refused at
 * the flush (42501, "The Lounge is an Archivist feature"), classed as any other refusal, moved to
 * the dead letter, taken out of the room, and told as "1 change made offline could not be sent".
 * Now it is held for the member: never sent again on its own, never aged out, drawn failed in its
 * room with its words (offlineQueueStore's useHeld), and the Society's door is shown once. Their
 * own retry sends it, and takes it from the queue; a retry with no connection lets it wait as
 * any write does. The dead letter keeps a copy for diagnosis.
 */
import { enqueueMutation, flushOfflineQueue, getOfflineQueue, letHeldGo, sendHeldAgain } from '../offlineQueue';
import { stillHeld, useOfflineQueueStore } from '../../stores/offlineQueueStore';
import { supabaseFake } from '@/test-utils/supabaseFake';

/** The member, signed in, who wrote these words and whose session sends them. */
const MEMBER = '7d1c2b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
/** The house, as strict as production: the member's standing, and their session. */
const mockHouse = supabaseFake({ rows: { profiles: [{ id: MEMBER, is_banned: false, suspended_until: null }] }, session: { userId: MEMBER } });

const mockStorage = new Map<string, string>();
jest.mock('../../stores/mmkv-storage', () => ({
  isStorageEncrypted: () => true,
  withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
  storage: {
    getString: jest.fn((key: string) => mockStorage.get(key)),
    set: jest.fn((key: string, value: string) => mockStorage.set(key, value)),
    delete: jest.fn((key: string) => mockStorage.delete(key)),
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `uuid-${Math.random().toString(36).slice(2)}`) }));
jest.mock('../../lib/sentry', () => ({ addBreadcrumb: jest.fn(), captureError: jest.fn(), captureWarning: jest.fn() }));
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
const mockExecute = jest.fn();
jest.mock('../mutationExecutor', () => ({
  executeMutation: (...a: unknown[]) => mockExecute(...a),
  applyIdMapToPayload: (p: Record<string, unknown>) => p,
}));
jest.mock('../reelToast', () => {
  const toast = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: toast };
});
jest.mock('../tierDoor', () => ({ showTierDoor: jest.fn(() => true) }));
jest.mock('../logger', () => ({ logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('../e2eTrace', () => ({ e2eTrace: jest.fn() }));
jest.mock('../../stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '7d1c2b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d' } }) } }));

const DEAD = 'reelhouse-offline-mutations_dead_letter';
const RANK = { code: '42501', message: 'The Lounge is an Archivist feature' };
const { showTierDoor } = jest.requireMock('../tierDoor') as { showTierDoor: jest.Mock };
const toast = (jest.requireMock('../reelToast') as { default: jest.Mock & { error: jest.Mock } }).default;

const say = (words: string, id = 'msg-1') => enqueueMutation({
  type: 'send_lounge_message',
  payload: { id, _tempId: id, lounge_id: 'salon-9', user_id: MEMBER, content: words, type: 'text' },
});

beforeEach(() => {
  mockStorage.clear();
  useOfflineQueueStore.setState({ queued: [] });
  mockExecute.mockReset().mockResolvedValue({});
  showTierDoor.mockClear();
  toast.mockClear();
  toast.error.mockClear();
});

it('is held for the member with its words, the door shown once, and never said to be lost', async () => {
  say('Late Spring is a perfect film.');
  mockExecute.mockRejectedValueOnce(RANK);
  await flushOfflineQueue();
  const queue = getOfflineQueue();
  expect(queue).toHaveLength(1);
  expect(queue[0]).toMatchObject({ _held: 'rank', payload: { content: 'Late Spring is a perfect film.' } });
  expect(stillHeld('send_lounge_message', 'msg-1')).toBe(true);
  expect(showTierDoor).toHaveBeenCalledTimes(1);
  expect(showTierDoor).toHaveBeenCalledWith(RANK, { returnTo: '/lounge/salon-9', also: 'Your words are kept in the salon' });
  expect(toast.error).not.toHaveBeenCalled();
  // A copy for diagnosis, naming why.
  expect(JSON.parse(mockStorage.get(DEAD) ?? '[]')).toEqual([
    expect.objectContaining({ payload: expect.objectContaining({ _failReason: 'held for the rank: The Lounge is an Archivist feature' }) }),
  ]);
});

it('is never sent again on its own: at the next send, the app back in front, or a day later', async () => {
  say('Late Spring is a perfect film.');
  mockExecute.mockRejectedValueOnce(RANK);
  await flushOfflineQueue();
  expect(mockExecute).toHaveBeenCalledTimes(1);
  await flushOfflineQueue();
  const dayLater = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 24 * 60 * 60 * 1000);
  await flushOfflineQueue();
  dayLater.mockRestore();
  expect(mockExecute).toHaveBeenCalledTimes(1);
  expect(getOfflineQueue()).toHaveLength(1);
  expect(showTierDoor).toHaveBeenCalledTimes(1);
});

it('holds back no other write: the next is sent past it', async () => {
  say('Late Spring is a perfect film.');
  enqueueMutation({ type: 'endorse_log', payload: { user_id: MEMBER, type: 'certify', target_log_id: 'l1' } });
  mockExecute.mockRejectedValueOnce(RANK);
  await flushOfflineQueue();
  expect(mockExecute).toHaveBeenCalledTimes(2);
  expect(getOfflineQueue().map((m) => m.type)).toEqual(['send_lounge_message']);
});

it('another refusal on 42501, no rank in it, is given up as before', async () => {
  say('Late Spring is a perfect film.');
  mockExecute.mockRejectedValueOnce({ code: '42501', message: 'new row violates row-level security policy' });
  await flushOfflineQueue();
  expect(getOfflineQueue()).toEqual([]);
  expect(showTierDoor).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledTimes(1);
});

it('the member\'s own retry, sent, takes it from the queue; asked with no connection, it waits to be sent', async () => {
  say('First.', 'msg-1');
  say('Second.', 'msg-2');
  mockExecute.mockRejectedValueOnce(RANK).mockRejectedValueOnce(RANK);
  await flushOfflineQueue();
  expect(getOfflineQueue().every((m) => m._held === 'rank')).toBe(true);

  letHeldGo('msg-1');
  expect(getOfflineQueue().map((m) => m.payload._tempId)).toEqual(['msg-2']);

  sendHeldAgain('msg-2');
  expect(getOfflineQueue().map((m) => m._held)).toEqual([undefined]);
  await flushOfflineQueue();
  expect(mockExecute).toHaveBeenCalledTimes(3);
  expect(getOfflineQueue()).toEqual([]);
});
