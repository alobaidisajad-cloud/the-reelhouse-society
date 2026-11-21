/**
 * anOlderProfileReadIsNotLaidOver.test.ts — the member's own profile, and their rank history, are
 * laid only by the read still asked.
 *
 * The profile is read again on each return to the app; the rank history on each restore (the
 * polling after a purchase runs several). A read asked earlier, answering last, put back what a
 * newer read had laid: a bio changed here undone, the history a purchase had just written lost.
 */
import { useAuthStore } from '../auth';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { heldClient } from '@/test-utils/heldClient';

const ANA = '11111111-1111-4111-8111-111111111111';

let mockProfiles: Record<string, unknown>[] = [];
const mockHouse = supabaseFake({ answer: { profiles: () => mockProfiles as never }, session: { userId: ANA } });
const mockHeld = heldClient(mockHouse.client);
/** Each ask of the rank history, held until the test answers it. */
const mockHistory: ((source: string | null) => void)[] = [];
Object.assign(mockHouse.client, {
  rpc: (name: string) => (name === 'my_entitlement_source'
    ? new Promise((resolve) => { mockHistory.push((source) => resolve({ data: source, error: null })); })
    : Promise.resolve({ data: null, error: null })),
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHeld.client; } }));

const mockDisk = new Map<string, string>();
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: {
    getString: (k: string) => mockDisk.get(k),
    getBoolean: () => undefined,
    set: (k: string, v: string) => { mockDisk.set(k, String(v)); },
    delete: (k: string) => { mockDisk.delete(k); },
    getAllKeys: () => [...mockDisk.keys()],
    contains: (k: string) => mockDisk.has(k),
    clearAll: () => mockDisk.clear(),
  },
  setSensitive: (k: string, v: string) => { mockDisk.set(k, v); },
  isStorageEncrypted: () => true,
  storageReady: () => Promise.resolve(),
  withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
  zustandMMKVStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
  createAsyncMMKVStorage: () => ({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined }),
}));
jest.mock('@/src/lib/revenueCat', () => ({ identifyUser: jest.fn(), logoutRevenueCat: jest.fn() }));
jest.mock('@/src/lib/pushNotifications', () => ({ removePushToken: jest.fn(() => Promise.resolve(true)) }));
jest.mock('@/src/lib/sentry', () => ({ setSentryUser: jest.fn(), addBreadcrumb: jest.fn(), captureError: jest.fn(), captureWarning: jest.fn(), captureAuthRefusal: jest.fn() }));
jest.mock('@/src/lib/queryClient', () => ({ queryClient: { clear: jest.fn(), invalidateQueries: jest.fn() }, forgetCache: jest.fn() }));
jest.mock('@/src/stores/notificationStore', () => ({ teardownNotificationRealtime: jest.fn() }));
jest.mock('@/src/stores/domain/socialSlice', () => ({ hydrateFollowing: jest.fn() }));
jest.mock('@/src/stores/domain/marksLedger', () => ({ readMarks: jest.fn() }));
jest.mock('@/src/services/ProfileWriteService', () => ({
  ...jest.requireActual('@/src/services/ProfileWriteService'),
  ProfileService: { updateProfile: jest.fn(async () => undefined) },
}));
jest.mock('@/src/utils/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const ROW = { id: ANA, username: 'ana', created_at: '2026-01-01T00:00:00Z' };

beforeEach(() => {
  mockDisk.clear();
  mockHistory.length = 0;
  useAuthStore.setState({ user: { ...ROW, bio: 'first' }, isAuthenticated: true, loading: false } as never);
});

it('of two reads of the profile, the older answering last is not laid over the newer', async () => {
  mockProfiles = [{ ...ROW, bio: 'older' }];
  const first = useAuthStore.getState().rereadProfile();
  await Promise.resolve();
  mockProfiles = [{ ...ROW, bio: 'newer' }];
  const second = useAuthStore.getState().rereadProfile();
  await mockHeld.release('profiles', 1);
  await second;
  await mockHeld.release('profiles', 0);
  await first;
  expect((useAuthStore.getState().user as { bio?: string }).bio).toBe('newer');
});

it('a read asked before a change made here does not undo the change', async () => {
  mockProfiles = [{ ...ROW, bio: 'older' }];
  const reread = useAuthStore.getState().rereadProfile();
  await Promise.resolve();
  await useAuthStore.getState().updateUser({ bio: 'mine' } as never);
  await mockHeld.release('profiles', 0);
  await reread;
  expect((useAuthStore.getState().user as { bio?: string }).bio).toBe('mine');
});

it('the rank history: an older answer landing last does not put back what a newer one laid', async () => {
  mockProfiles = [ROW];
  await mockRestoreTwice();
  expect(mockHistory).toHaveLength(2);
  mockHistory[1]!('apple');
  await flush();
  mockHistory[0]!(null);
  await flush();
  expect((useAuthStore.getState().user as { entitlement_source?: string | null }).entitlement_source).toBe('apple');
});

/** Two restores, each read through to its rank history's ask. */
async function mockRestoreTwice(): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const restore = useAuthStore.getState().restoreSession();
    await mockHeld.releaseAll();
    await restore;
  }
}

async function flush(): Promise<void> { for (let i = 0; i < 10; i++) await Promise.resolve(); }
