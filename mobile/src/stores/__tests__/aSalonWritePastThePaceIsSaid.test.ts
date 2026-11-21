/**
 * aSalonWritePastThePaceIsSaid.test.ts — the kinds pass (stage C, kind 9)
 * ─────────────────────────────────────────────────────────────────────────────
 * The house now paces every write a member can repeat at will (check_write_pace): opening a salon
 * and taking a seat among them. A refusal past that pace names its wait (RH429, its HINT); the phone
 * said "Failed to create lounge." and "Check your connection and try again." for it, as for any
 * failure. Now each says the pace and how long, and any other failure is said as before.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useLoungeStore } from '../lounge';

const SALON = '11111111-1111-4111-8111-111111111111';
const NEW_SALON = '22222222-2222-4222-8222-222222222222';

let mockHouse = supabaseFake({ rows: {} });
const mockToast = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [] }));
jest.mock('../../utils/reelToast', () => ({ __esModule: true, get default() { return mockToast; } }));

/** The house's pace refusing every salon door: for the member's own pace, or for the day. */
const paced = (details: 'member' | 'day', hint: string) => {
  const error = { code: 'RH429', message: 'RATE_LIMITED', details, hint };
  return supabaseFake({ rpc: { create_lounge: { error }, join_public_lounge: { error }, request_lounge_membership: { error } } });
};
const said = () => mockToast.error.mock.calls.map(([words]) => words as string);

beforeEach(() => {
  mockToast.error.mockClear();
});

it('a salon opened past the pace says the pace and how long, never that it failed', async () => {
  mockHouse = paced('member', '3600');
  await expect(useLoungeStore.getState().createLounge('The Night Room', 'Late films.', false, NEW_SALON)).resolves.toBeNull();
  expect(said()).toEqual(['The house takes no more salons from you for an hour.']);
});

it('a seat taken or asked for past the pace says so, with the day\'s wait, never the connection', async () => {
  mockHouse = paced('day', '7200');
  await expect(useLoungeStore.getState().joinPublicLounge(SALON)).resolves.toBe(false);
  await expect(useLoungeStore.getState().requestMembership(SALON)).resolves.toBe('error');
  expect(said()).toEqual([
    'The house takes no more seats from you today. More in 2 hours.',
    'The house takes no more seats from you today. More in 2 hours.',
  ]);
});
