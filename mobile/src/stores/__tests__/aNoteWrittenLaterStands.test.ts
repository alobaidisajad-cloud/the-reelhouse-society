/**
 * A NOTE WRITTEN LATER STANDS (review round 13, vaultStore and the offline queue), against the house
 * as strict as it is (test-utils/supabaseFake).
 *
 * A note written with a weak signal ("A") waited in the queue; the member wrote the note again
 * online ("B") and sealed it; the queue sent "A" later and wrote it over "B" on every phone, and a
 * read on the way back to the front already laid "A" over the house's "B". Now the note that lands
 * online lets go the older one still queued, so it is never sent and never laid over the house's
 * answer; and every note is sent with the moment it was written, so the house writes it only over
 * a note written no later (a note queued on another phone included).
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

/** What the house holds of the note, and every write it was asked, in order. */
let mockNote: string | null = 'B, from before';
const mockAsked: Record<string, unknown>[] = [];
const mockHouse = supabaseFake({
  session: { userId: ME },
  rows: {
    profiles: [{ id: ME, is_banned: false, suspended_until: null }],
  },
  answer: {
    log_private_notes: () => (mockNote === null ? [] : [{ viewing_id: VIEWING, log_id: LOG_ID, notes: mockNote, updated_at: '2026-11-18T12:00:00.000Z' }]),
  },
  rpc: {
    viewing_note_set: (args: Record<string, unknown>) => { mockAsked.push(args); mockNote = String(args.p_notes); return null; },
    viewing_note_remove: (args: Record<string, unknown>) => { mockAsked.push(args); mockNote = null; return null; },
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
  payload: { log_id: LOG_ID, viewing_id: VIEWING, notes: 'A' },
};

beforeEach(() => {
  mockNote = 'B, from before';
  mockAsked.length = 0;
  storage.delete(QUEUE_KEY);
  useAuthStore.setState({ user: { id: ME, username: 'me' } as never, isAuthenticated: true } as never);
  useVaultStore.getState().clear();
});
afterEach(() => storage.delete(QUEUE_KEY));

it('a note sealed online lets go the older note still queued: the queue never sends it, and the house keeps the newer', async () => {
  storage.set(QUEUE_KEY, JSON.stringify([queuedA]));
  expect(await useVaultStore.getState().saveNote(LOG_ID, VIEWING, 'B')).toEqual({ queuedOffline: false });
  expect(getOfflineQueue()).toEqual([]);
  await flushOfflineQueue();
  expect(mockAsked.map((a) => a.p_notes)).toEqual(['B']);
  expect(mockNote).toBe('B');
});

it('read again on the way back to the front, the house\'s newer note is shown, never the older one that waited', async () => {
  storage.set(QUEUE_KEY, JSON.stringify([queuedA]));
  await useVaultStore.getState().saveNote(LOG_ID, VIEWING, 'B');
  await useVaultStore.getState().loadForLog(LOG_ID, { force: true });
  expect(useVaultStore.getState().noteFor(VIEWING)).toBe('B');
});

it('a note taken away online lets go the older note still queued too', async () => {
  storage.set(QUEUE_KEY, JSON.stringify([queuedA]));
  expect(await useVaultStore.getState().dropNote(LOG_ID, VIEWING)).toEqual({ queuedOffline: false });
  expect(getOfflineQueue()).toEqual([]);
  expect(mockNote).toBeNull();
});

it('every note is sent with the moment it was written, for the house to keep only the newest', async () => {
  await useVaultStore.getState().saveNote(LOG_ID, VIEWING, 'C');
  await useVaultStore.getState().dropNote(LOG_ID, VIEWING);
  expect(mockAsked.map((a) => [a.p_viewing_id, typeof a.p_written_at])).toEqual([[VIEWING, 'string'], [VIEWING, 'string']]);
  const [first] = mockAsked;
  expect(first).toBeDefined();
  expect(Number.isFinite(Date.parse(String(first!.p_written_at)))).toBe(true);
});
