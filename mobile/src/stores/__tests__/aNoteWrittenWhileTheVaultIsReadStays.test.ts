/**
 * A NOTE WRITTEN WHILE THE VAULT IS READ STAYS (stage C, an older answer over a newer state), against
 * the house as strict as it is (test-utils/supabaseFake), its answers held and let go in order.
 *
 * A record's notes are read again on the way back to it (and after the queue sends one). A note
 * saved online while that read was out was neither in its answer (read before it) nor in the queue
 * (sent online), and the answer rebuilt the record's notes without it: the member's words vanished
 * until a later read. One taken back meanwhile came back. A note written or taken back since a read
 * was asked, or still on its way, now stays as the phone holds it (the acts ledger, markCounts).
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useAuthStore } from '@/src/stores/auth';
import { useVaultStore } from '@/src/stores/vaultStore';
import { resetMarkCounts } from '@/src/stores/markCounts';
import { storage } from '@/src/stores/mmkv-storage';
import { QUEUE_KEY } from '@/src/utils/queueOwnership';

const ME = '33333333-3333-4333-8333-333333333333';
const LOG_ID = '44444444-4444-4444-8444-444444444444';
const VIEWING = '55555555-5555-4555-8555-555555555555';

/** The note the house holds for the viewing when a read is asked, or none. */
let mockHeld: string | null = null;
const mockHouse = supabaseFake({
  session: { userId: ME },
  rows: { profiles: [{ id: ME, is_banned: false, suspended_until: null }] },
  answer: {
    log_private_notes: () => (mockHeld === null ? [] : [{ viewing_id: '55555555-5555-4555-8555-555555555555', log_id: '44444444-4444-4444-8444-444444444444', notes: mockHeld, updated_at: '2026-11-18T12:00:00.000Z' }]),
  },
  rpc: { viewing_note_set: () => null, viewing_note_remove: () => null },
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));

const settled = async () => { for (let i = 0; i < 6; i += 1) await new Promise<void>((resolve) => setImmediate(resolve)); };

beforeEach(() => {
  mockHeld = null;
  storage.delete(QUEUE_KEY);
  resetMarkCounts();
  useAuthStore.setState({ user: { id: ME, username: 'me' } as never, isAuthenticated: true } as never);
  useVaultStore.getState().clear();
});
afterEach(() => storage.delete(QUEUE_KEY));

it('a note saved while the record’s notes are read again is not taken away by the answer', async () => {
  await useVaultStore.getState().loadForLog(LOG_ID);
  mockHouse.hold();
  const read = useVaultStore.getState().loadForLog(LOG_ID, { force: true });
  await settled();
  const saved = useVaultStore.getState().saveNote(LOG_ID, VIEWING, 'Written just now.');
  await settled();
  // The read answers first, without the note; then the note lands.
  mockHouse.release();
  await Promise.all([read, saved]);
  expect(useVaultStore.getState().noteFor(VIEWING)).toBe('Written just now.');
});

it('a note taken back while the record’s notes are read again does not come back', async () => {
  mockHeld = 'Kept a while.';
  await useVaultStore.getState().loadForLog(LOG_ID);
  expect(useVaultStore.getState().noteFor(VIEWING)).toBe('Kept a while.');
  mockHouse.hold();
  const read = useVaultStore.getState().loadForLog(LOG_ID, { force: true });
  await settled();
  const dropped = useVaultStore.getState().dropNote(LOG_ID, VIEWING);
  await settled();
  mockHouse.release();
  await Promise.all([read, dropped]);
  expect(useVaultStore.getState().noteFor(VIEWING)).toBe('');
});

it('a read asked after the note landed is the house’s word', async () => {
  await useVaultStore.getState().loadForLog(LOG_ID);
  await useVaultStore.getState().saveNote(LOG_ID, VIEWING, 'Written.');
  // Taken away on another phone since: a read asked now holds no note, and it is laid.
  mockHeld = null;
  await new Promise((resolve) => setTimeout(resolve, 5));
  await useVaultStore.getState().loadForLog(LOG_ID, { force: true });
  expect(useVaultStore.getState().noteFor(VIEWING)).toBe('');
});
