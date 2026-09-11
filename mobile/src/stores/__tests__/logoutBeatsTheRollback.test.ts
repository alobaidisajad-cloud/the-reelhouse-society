/**
 * logoutBeatsTheRollback.test.ts — the member who came back after leaving.
 * ─────────────────────────────────────────────────────────────────────────────
 * `updateUser` writes the profile optimistically, awaits the server, and on
 * failure puts the member's WHOLE user object back — into the store, and into
 * encrypted storage under their id.
 *
 * Nothing checked whether they were still signed in. A logout landing inside
 * that await meant both writes happened AFTER the reset had cleared them: the
 * departed member was restored to the store, and their profile — email included
 * — was rewritten to the very cache key the logout wipe deletes.
 *
 * The auth store was the one store staleWriteGuard never enumerated, because it
 * owns the logout and so read as the file that could not have this defect.
 */
import { useAuthStore } from '../auth';

const mockUpdateProfile = jest.fn();
jest.mock('../../services/ProfileWriteService', () => ({
  ProfileService: { updateProfile: (...a: unknown[]) => mockUpdateProfile(...a) },
  PROFILE_SELECT_COLUMNS: 'id, username',
}));

const mockSetSensitive = jest.fn();
const mockStore = new Map<string, string>();
jest.mock('../mmkv-storage', () => ({
  storage: {
    set: (k: string, v: string) => { mockStore.set(k, v); },
    getString: (k: string) => mockStore.get(k),
    delete: (k: string) => { mockStore.delete(k); },
    contains: (k: string) => mockStore.has(k),
    getAllKeys: () => [...mockStore.keys()],
    clearAll: () => { mockStore.clear(); },
  },
  setSensitive: (k: string, v: string) => mockSetSensitive(k, v),
  isStorageEncrypted: () => true,
  initEncryptedStorage: jest.fn().mockResolvedValue(undefined),
  zustandMMKVStorage: { getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() },
  zustandMMKVStorageSensitive: { getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() },
  createAsyncMMKVStorage: () => ({ getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() }),
}));

jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});

const DEPARTED = {
  id: '55555555-5555-4555-8555-555555555555',
  username: 'departed',
  email: 'departed@example.com',
  role: 'cinephile',
  preferences: {},
};

/**
 * `updateUser` throttles itself to one call per 1500ms, and `_actionThrottles`
 * is module scope — it survives between tests in this file. Without moving the
 * clock forward, the third test is simply throttled out and returns before it
 * reaches the rollback, which looks exactly like the rollback being broken.
 * (It reported precisely that on the first run.)
 */
let clock = 1_800_000_000_000;
beforeEach(() => {
  mockUpdateProfile.mockReset();
  mockSetSensitive.mockReset();
  mockStore.clear();
  clock += 60_000;
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
  useAuthStore.setState({ user: DEPARTED, isAuthenticated: true, loading: false } as never);
});

afterEach(() => { (Date.now as jest.Mock).mockRestore?.(); });

describe('a profile rollback that lands after logout', () => {
  it('does NOT put the departed member back in the store', async () => {
    let failIt: () => void = () => {};
    mockUpdateProfile.mockImplementation(
      () => new Promise((_res, rej) => { failIt = () => rej(new Error('server refused')); }),
    );

    const inFlight = useAuthStore.getState().updateUser({ username: 'renamed' });

    // They log out while the profile write is still in the air.
    useAuthStore.setState({ user: null, isAuthenticated: false } as never);

    failIt();
    await inFlight;

    expect(useAuthStore.getState().user).toBeNull();
  });

  it('does NOT rewrite their profile cache — the key logout deletes', async () => {
    let failIt: () => void = () => {};
    mockUpdateProfile.mockImplementation(
      () => new Promise((_res, rej) => { failIt = () => rej(new Error('server refused')); }),
    );

    const inFlight = useAuthStore.getState().updateUser({ username: 'renamed' });
    useAuthStore.setState({ user: null, isAuthenticated: false } as never);
    mockSetSensitive.mockClear(); // ignore the optimistic write from before the logout

    failIt();
    await inFlight;

    const wroteTheirCache = mockSetSensitive.mock.calls.some(
      ([key]) => typeof key === 'string' && key.includes(DEPARTED.id),
    );
    expect(wroteTheirCache).toBe(false);
  });

  it('STILL rolls back for a member who never left', async () => {
    // The guard must not cost the ordinary case its rollback.
    mockUpdateProfile.mockRejectedValue(new Error('server refused'));

    await useAuthStore.getState().updateUser({ username: 'renamed' });

    expect((useAuthStore.getState().user as unknown as { username: string }).username)
      .toBe('departed');
    expect(mockSetSensitive.mock.calls.some(
      ([key]) => typeof key === 'string' && key.includes(DEPARTED.id),
    )).toBe(true);
  });
});
