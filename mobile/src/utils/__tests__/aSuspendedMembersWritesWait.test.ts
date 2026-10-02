/**
 * aSuspendedMembersWritesWait.test.ts — writes a suspended member made
 * offline are held until the suspension ends, not thrown away refused.
 *
 * The queue asked only whether the member was banned. A suspended member's
 * queue was sent, every write refused (enforce_not_restricted), and each one
 * dead-lettered: "could not be sent", for work that would have gone through
 * an hour later. A ban still empties it; a suspension now waits.
 */
import { enqueueMutation, flushOfflineQueue, getOfflineQueue } from '../offlineQueue';

const mockStorage = new Map<string, string>();
jest.mock('../../stores/mmkv-storage', () => ({
  storage: {
    getString: jest.fn((key: string) => mockStorage.get(key)),
    set: jest.fn((key: string, value: string) => mockStorage.set(key, value)),
    delete: jest.fn((key: string) => mockStorage.delete(key)),
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `uuid-${Math.random().toString(36).slice(2)}`) }));
jest.mock('../../lib/sentry', () => ({ addBreadcrumb: jest.fn(), captureError: jest.fn(), captureWarning: jest.fn() }));

let mockStanding: { is_banned: boolean; suspended_until: string | null } = { is_banned: false, suspended_until: null };
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'u1' }, access_token: 't' } }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockStanding, error: null }) }) }) }),
  },
}));
const mockExecute = jest.fn();
jest.mock('../mutationExecutor', () => ({
  executeMutation: (...a: unknown[]) => mockExecute(...a),
  applyIdMapToPayload: (p: Record<string, unknown>) => p,
}));
jest.mock('../reelToast', () => {
  const toast = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: toast };
});
jest.mock('../logger', () => ({ logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));

const DEAD = 'reelhouse-offline-mutations_dead_letter';
const write = () => enqueueMutation({ type: 'watchlist_add', payload: { user_id: 'u1', film_id: 42, title: 'Stalker' } } as never);

beforeEach(() => { mockStorage.clear(); mockExecute.mockReset().mockResolvedValue({}); });

it('while suspended, the queue is held: nothing sent, nothing lost', async () => {
  mockStanding = { is_banned: false, suspended_until: new Date(Date.now() + 3_600_000).toISOString() };
  write();
  await flushOfflineQueue();
  expect(mockExecute).not.toHaveBeenCalled();
  expect(getOfflineQueue()).toHaveLength(1);
  expect(mockStorage.get(DEAD)).toBeUndefined();
});

it('once it has ended, the queue is sent', async () => {
  mockStanding = { is_banned: false, suspended_until: new Date(Date.now() - 1000).toISOString() };
  write();
  await flushOfflineQueue();
  expect(mockExecute).toHaveBeenCalledTimes(1);
  expect(getOfflineQueue()).toHaveLength(0);
});

it('a ban still empties it, to the dead letter', async () => {
  mockStanding = { is_banned: true, suspended_until: null };
  write();
  await flushOfflineQueue();
  expect(mockExecute).not.toHaveBeenCalled();
  expect(getOfflineQueue()).toHaveLength(0);
  expect(JSON.parse(mockStorage.get(DEAD) ?? '[]')).toHaveLength(1);
});
