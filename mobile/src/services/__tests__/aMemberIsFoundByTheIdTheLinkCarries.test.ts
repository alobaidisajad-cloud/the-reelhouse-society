/**
 * aMemberIsFoundByTheIdTheLinkCarries.test.ts — review round 11
 * ─────────────────────────────────────────────────────────────────────────────
 * A member link carries the member's id (memberPath adds ?id=), but the file was always found by
 * the handle: after the member renamed, the link opened "Member Not Found", or the file of whoever
 * took the freed handle. With the id the member it names is found, whatever they are called now; a
 * shared address with no id is found by its handle, as before.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { ProfileDataService } from '../ProfileDataService';

const RENAMED = '11111111-1111-4111-8111-111111111111';
const NEW_HOLDER = '22222222-2222-4222-8222-222222222222';
// Bob renamed to bobby, and another member took "bob" since.
const mockHouse = supabaseFake({
  rows: {
    profiles: [
      { id: RENAMED, username: 'bobby', role: 'cinephile', tier: 'cinephile', is_social_private: false, created_at: '2026-01-01T00:00:00Z' },
      { id: NEW_HOLDER, username: 'bob', role: 'cinephile', tier: 'cinephile', is_social_private: false, created_at: '2026-11-01T00:00:00Z' },
    ],
  },
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

it('a link that names a member by their id opens that member after their rename, never the new holder of the handle', async () => {
  const found = await ProfileDataService.fetchProfile('bob', false, undefined, RENAMED);
  expect(found?.id).toBe(RENAMED);
  expect(found?.username).toBe('bobby');
});

it('a link whose member has left opens no one, though another holds the handle', async () => {
  const found = await ProfileDataService.fetchProfile('bob', false, undefined, '33333333-3333-4333-8333-333333333333');
  expect(found).toBeNull();
});

it('a shared address with no id is found by its handle, as before', async () => {
  const found = await ProfileDataService.fetchProfile('bob', false);
  expect(found?.id).toBe(NEW_HOLDER);
});
