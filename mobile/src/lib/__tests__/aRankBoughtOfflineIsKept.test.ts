/**
 * aRankBoughtOfflineIsKept.test.ts — a rank bought or restored with no signal
 * is queued for the house, not forgotten.
 *
 * The store answers a purchase on the phone; telling the house is queued, so a
 * dropped network only delays it. But whose rank it was came from
 * `auth.getUser`, which asks the network: with no signal it failed, nothing was
 * queued, and the member's new rank never reached the house. The session on the
 * phone already says who they are.
 */
import { supabase } from '@/src/lib/supabase';
import { syncEntitlementToSupabase } from '@/src/lib/revenueCat';

const mockEnqueue = jest.fn();
jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: (...a: unknown[]) => mockEnqueue(...a),
  flushOfflineQueue: jest.fn(),
}));
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'u1', role: 'cinephile', tier: 'cinephile' } }) },
}));

beforeEach(() => mockEnqueue.mockClear());

it('with no signal, the new rank is queued for the member on the phone', async () => {
  jest.spyOn(supabase.auth, 'getUser').mockRejectedValue(new TypeError('Network request failed'));
  jest.spyOn(supabase.auth, 'getSession').mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null } as never);
  await syncEntitlementToSupabase('archivist' as never);
  expect(mockEnqueue).toHaveBeenCalledWith({ type: 'sync_entitlement', payload: { tier: 'archivist', user_id: 'u1' } });
});

it('with nobody signed in, nothing is queued', async () => {
  jest.spyOn(supabase.auth, 'getSession').mockResolvedValue({ data: { session: null }, error: null } as never);
  await syncEntitlementToSupabase('archivist' as never);
  expect(mockEnqueue).not.toHaveBeenCalled();
});
