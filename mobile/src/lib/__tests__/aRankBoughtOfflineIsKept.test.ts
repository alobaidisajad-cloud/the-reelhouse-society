/**
 * aRankBoughtOfflineIsKept.test.ts — a rank bought or restored is queued for
 * the account the store sold it to, whatever the network and the session say.
 *
 * The store answers a purchase on the phone; telling the house is queued, so a
 * dropped network only delays it. Whose rank it was came first from
 * `auth.getUser`, which asks the network (no signal: nothing queued), then from
 * the session, which near its expiry can answer nobody. The store on the phone
 * already knows the account it recorded the purchase against — the very record
 * sync-entitlement reads.
 */
import { supabase } from '@/src/lib/supabase';
import { initRevenueCat, syncEntitlementToSupabase } from '@/src/lib/revenueCat';

const mockEnqueue = jest.fn();
jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: (...a: unknown[]) => mockEnqueue(...a),
  flushOfflineQueue: jest.fn(),
}));

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const mockAppUserID = jest.fn();
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: { configure: jest.fn(), getAppUserID: () => mockAppUserID() },
}));

beforeAll(async () => {
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = 'k';
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY = 'k';
});
beforeEach(() => { mockEnqueue.mockClear(); mockAppUserID.mockReset(); });

it('with no signal and no session, the new rank is queued for the account the store sold it to', async () => {
  jest.resetModules();
  const { initRevenueCat: init, syncEntitlementToSupabase: sync } = require('@/src/lib/revenueCat');
  const { supabase: sb } = require('@/src/lib/supabase');
  await init(ACCOUNT);
  const getUser = jest.spyOn(sb.auth, 'getUser').mockRejectedValue(new TypeError('Network request failed'));
  const getSession = jest.spyOn(sb.auth, 'getSession').mockResolvedValue({ data: { session: null }, error: null } as never);
  mockAppUserID.mockResolvedValue(ACCOUNT.toUpperCase());
  await sync('archivist');
  expect(mockEnqueue).toHaveBeenCalledWith({ type: 'sync_entitlement', payload: { tier: 'archivist', user_id: ACCOUNT } });
  expect(getUser).not.toHaveBeenCalled();
  expect(getSession).not.toHaveBeenCalled();
});

it('an anonymous store buyer is no member: nothing is queued', async () => {
  jest.resetModules();
  const { initRevenueCat: init, syncEntitlementToSupabase: sync } = require('@/src/lib/revenueCat');
  await init();
  mockAppUserID.mockResolvedValue('$RCAnonymousID:abc');
  await sync('archivist');
  expect(mockEnqueue).not.toHaveBeenCalled();
});

it('with no store on this device, nothing is queued', async () => {
  // This module instance was never configured.
  void initRevenueCat; void supabase;
  await syncEntitlementToSupabase('archivist' as never);
  expect(mockEnqueue).not.toHaveBeenCalled();
});
