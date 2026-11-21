/**
 * aBannedMemberIsToldTheDoorIsClosed.test.ts — review round 9
 * ─────────────────────────────────────────────────────────────────────────────
 * A member the host has banned who tried to take a seat, or to ask to enter a private salon, was
 * refused by the house in so many words ('You cannot join this lounge', 'You cannot request this
 * lounge', raised as P0001), and the phone said "Check your connection and try again.": sent to
 * their signal, to try again and be refused again. Now that refusal says the host has closed the
 * salon to them; any other failure is still the connection's.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { BANNED_FROM_SALON, useLoungeStore } from '../lounge';

const SALON = '11111111-1111-4111-8111-111111111111';

let mockHouse = supabaseFake({ rows: {} });
const mockToast = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [] }));
jest.mock('../../utils/reelToast', () => ({ __esModule: true, get default() { return mockToast; } }));

/** The house refusing both doors with these words. */
const refusing = (code: string, join: string, request: string) => supabaseFake({
  rpc: {
    join_public_lounge: { error: { code, message: join } },
    request_lounge_membership: { error: { code, message: request } },
  },
});
const said = () => mockToast.error.mock.calls.map(([words]) => words as string);

beforeEach(() => {
  mockToast.error.mockClear();
  mockToast.info.mockClear();
});

it('a banned member taking a seat is told the host has closed the salon to them, not to check their connection', async () => {
  mockHouse = refusing('P0001', 'You cannot join this lounge', 'You cannot request this lounge');
  await expect(useLoungeStore.getState().joinPublicLounge(SALON)).resolves.toBe(false);
  expect(said()).toEqual([BANNED_FROM_SALON]);
  expect(BANNED_FROM_SALON).toBe('The host has closed this salon to you.');
});

it('a banned member asking to enter a private salon is told the same, and their request is not drawn as sent', async () => {
  mockHouse = refusing('P0001', 'You cannot join this lounge', 'You cannot request this lounge');
  await expect(useLoungeStore.getState().requestMembership(SALON)).resolves.toBe('error');
  expect(said()).toEqual(['The host has closed this salon to you.']);
});

it('a seat or a request refused for another reason still says to check the connection, the ban’s words kept for the ban', async () => {
  mockHouse = refusing('P0001', 'You cannot join this lounge', 'You cannot request this lounge');
  await useLoungeStore.getState().joinPublicLounge(SALON);
  // The same words under another code are not the ban's refusal; nor are other words under P0001.
  mockHouse = refusing('XX000', 'You cannot join this lounge', 'You cannot request this lounge');
  await useLoungeStore.getState().joinPublicLounge(SALON);
  // (A salon not found is gone, and says so: aDissolvedSalonIsSaidAsGone, round 11.)
  mockHouse = refusing('P0001', 'Not authenticated', 'Not authenticated');
  await useLoungeStore.getState().requestMembership(SALON);
  expect(said()).toEqual([
    'The host has closed this salon to you.',
    'Could not take a seat.',
    'Could not send your request.',
  ]);
});
