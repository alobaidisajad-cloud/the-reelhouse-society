/**
 * aSuspendedMembersWritesWait.test.ts — writes a suspended member made
 * offline are held until the suspension ends, not thrown away refused: the
 * queue reads the member's standing before it sends, and a write the server
 * refuses for a suspension (enforce_not_restricted) waits with every write
 * after it — when that read failed, or the suspension began mid-send. A ban,
 * or a write refused because the member was silenced, is given up.
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

let mockStanding: { is_banned: boolean; suspended_until: string | null } | null = { is_banned: false, suspended_until: null };
let mockStandingUnread: { code: string; message: string } | null = null;
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'u1' }, access_token: 't' } }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockStanding, error: mockStandingUnread }) }) }) }),
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
jest.mock('../e2eTrace', () => ({ e2eTrace: jest.fn() }));
// The member signed in, who queues these writes and whose session sends them.
jest.mock('../../stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: 'u1' } }) } }));

const DEAD = 'reelhouse-offline-mutations_dead_letter';
const write = () => enqueueMutation({ type: 'watchlist_add', payload: { user_id: 'u1', film_id: 42, title: 'Stalker' } } as never);

beforeEach(() => {
  mockStorage.clear();
  mockExecute.mockReset().mockResolvedValue({});
  mockStandingUnread = null;
});

/** The server's refusals for standing, as enforce_not_restricted words them. */
const SUSPENDED = { code: '42501', message: 'Your account is suspended until 20 Oct 2026 00:00 UTC.' };
const SILENCED = { code: '42501', message: 'Your account has been silenced by The Society.' };

it('when the standing could not be read, a write refused for a suspension waits, and every write after it', async () => {
  mockStanding = null;
  mockStandingUnread = { code: 'XX000', message: 'internal error' };
  write();
  write();
  mockExecute.mockRejectedValueOnce(SUSPENDED);
  await flushOfflineQueue();
  expect(mockExecute).toHaveBeenCalledTimes(1);
  expect(getOfflineQueue()).toHaveLength(2);
  expect(mockStorage.get(DEAD)).toBeUndefined();
  const { logger } = jest.requireMock('../logger') as { logger: { warn: jest.Mock } };
  expect(logger.warn).toHaveBeenCalledWith('[OfflineSync] Could not read the member\'s standing:', 'internal error');
});

it('a suspension that begins while the queue sends holds the rest from the write it refused', async () => {
  mockStanding = { is_banned: false, suspended_until: null };
  write();
  write();
  write();
  mockExecute.mockResolvedValueOnce({}).mockRejectedValueOnce(SUSPENDED);
  await flushOfflineQueue();
  expect(mockExecute).toHaveBeenCalledTimes(2);
  expect(getOfflineQueue()).toHaveLength(2);
  expect(mockStorage.get(DEAD)).toBeUndefined();
  const { logger } = jest.requireMock('../logger') as { logger: { warn: jest.Mock } };
  const { e2eTrace } = jest.requireMock('../e2eTrace') as { e2eTrace: jest.Mock };
  expect(logger.warn).toHaveBeenCalledWith('[OfflineSync] watchlist_add refused for a suspension. Holding the queue until it ends.');
  expect(e2eTrace).toHaveBeenCalledWith('queue.flush.halted', { type: 'watchlist_add', why: 'suspended' });
});

it('a write refused because the member was silenced is given up, as a ban gives up the queue', async () => {
  mockStanding = { is_banned: false, suspended_until: null };
  write();
  mockExecute.mockRejectedValueOnce(SILENCED);
  await flushOfflineQueue();
  expect(getOfflineQueue()).toHaveLength(0);
  expect(JSON.parse(mockStorage.get(DEAD) ?? '[]')).toEqual([expect.objectContaining({ payload: expect.objectContaining({ _failReason: SILENCED.message }) })]);
});

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
