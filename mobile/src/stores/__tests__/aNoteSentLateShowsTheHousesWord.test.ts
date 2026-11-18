/**
 * A NOTE SENT LATE SHOWS THE HOUSE'S WORD (review round 13, the offline queue and the Vault), against
 * the house as strict as it is (test-utils/supabaseFake).
 *
 * A note written on this phone waited in the queue while the member took the note away on another
 * phone. Sent late, the house does it unwritten (its removal was later), but this phone's Vault went
 * on showing the queued words, laid over every read while they waited, until some later read. Now
 * once the queue has sent a note, the Vault reads that record's notes again, the note no longer
 * waiting, and shows what the house holds: no note.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useAuthStore } from '@/src/stores/auth';
import { useVaultStore } from '@/src/stores/vaultStore';
import { storage } from '@/src/stores/mmkv-storage';
import { flushOfflineQueue, getOfflineQueue, type QueuedMutation } from '@/src/utils/offlineQueue';
import { QUEUE_KEY } from '@/src/utils/queueOwnership';

const ME = '33333333-3333-4333-8333-333333333333';
const LOG_ID = '44444444-4444-4444-8444-444444444444';
const VIEWING = '55555555-5555-4555-8555-555555555555';

let mockSent = 0;
/** The note the house holds for the viewing, or none. */
let mockHeld: string | null = null;
const mockHouse = supabaseFake({
  session: { userId: ME },
  rows: { profiles: [{ id: ME, is_banned: false, suspended_until: null }] },
  // The house holds no note: it was taken away on another phone after this one was written.
  answer: {
    log_private_notes: () => (mockHeld === null ? [] : [{ viewing_id: '55555555-5555-4555-8555-555555555555', log_id: '44444444-4444-4444-8444-444444444444', notes: mockHeld, updated_at: '2026-11-18T12:00:00.000Z' }]),
  },
  // The late note is done unwritten, as a repeat is: no error.
  rpc: {
    viewing_note_set: () => { mockSent += 1; return null; },
    viewing_note_remove: () => { mockSent += 1; return null; },
  },
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));
jest.mock('@/src/utils/reelToast', () => {
  const t = Object.assign(jest.fn(), { error: jest.fn(), info: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: t };
});

const queuedA: QueuedMutation = {
  id: 'queued-a', type: 'set_viewing_note', timestamp: 1, owner: ME,
  payload: { log_id: LOG_ID, viewing_id: VIEWING, notes: 'A', written_at: '2026-11-18T10:00:00.000Z' },
};
const settled = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => {
  mockSent = 0;
  mockHeld = null;
  storage.delete(QUEUE_KEY);
  useAuthStore.setState({ user: { id: ME, username: 'me' } as never, isAuthenticated: true } as never);
  useVaultStore.getState().clear();
});
afterEach(() => storage.delete(QUEUE_KEY));

it('once the queue has sent a note the house did not write, the Vault shows no note', async () => {
  storage.set(QUEUE_KEY, JSON.stringify([queuedA]));
  await useVaultStore.getState().loadForLog(LOG_ID);
  // While it waits, the queued words are what this phone shows.
  expect(useVaultStore.getState().noteFor(VIEWING)).toBe('A');
  await flushOfflineQueue();
  await settled();
  expect(mockSent).toBe(1);
  expect(getOfflineQueue()).toEqual([]);
  expect(useVaultStore.getState().noteFor(VIEWING)).toBe('');
});

it('a record whose notes this phone never opened is not read for it', async () => {
  storage.set(QUEUE_KEY, JSON.stringify([queuedA]));
  const before = mockHouse.asked.filter((a) => a.table === 'log_private_notes').length;
  await flushOfflineQueue();
  await settled();
  expect(mockHouse.asked.filter((a) => a.table === 'log_private_notes').length).toBe(before);
});

it('a removal sent late, done unremoved (a later note stands at the house), shows the later note', async () => {
  mockHeld = 'C, written later on another phone';
  storage.set(QUEUE_KEY, JSON.stringify([{
    id: 'queued-rm', type: 'remove_viewing_note', timestamp: 1, owner: ME,
    payload: { log_id: LOG_ID, viewing_id: VIEWING, written_at: '2026-11-18T10:00:00.000Z' },
  }]));
  await useVaultStore.getState().loadForLog(LOG_ID);
  // While it waits, the removal is what this phone shows.
  expect(useVaultStore.getState().noteFor(VIEWING)).toBe('');
  await flushOfflineQueue();
  await settled();
  expect(mockSent).toBe(1);
  expect(useVaultStore.getState().noteFor(VIEWING)).toBe('C, written later on another phone');
});

it('a read asked again while one is out is made once that one is answered, never dropped', async () => {
  const reads = () => mockHouse.asked.filter((a) => a.table === 'log_private_notes').length;
  const before = reads();
  const first = useVaultStore.getState().loadForLog(LOG_ID);
  void useVaultStore.getState().loadForLog(LOG_ID, { force: true });
  await first;
  await settled();
  expect(reads() - before).toBe(2);
});
