/**
 * aFailedSettingStaysUndone.test.ts — a setting the server refused is undone on
 * the screen AND on the disk.
 *
 * `setPreference` keeps the unsynced change on disk (`dirty_prefs_<id>`) so a
 * phone killed inside the one-second debounce still sends it on the next launch.
 * When the send FAILS, the screen rolls back; the disk must follow, or the next
 * launch quietly re-applies the change the member watched being undone.
 */
import { useAuthStore } from '../auth';
import { supabase } from '../../lib/supabase';

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
  setSensitive: jest.fn(),
  isStorageEncrypted: () => true,
  initEncryptedStorage: jest.fn().mockResolvedValue(undefined),
  zustandMMKVStorage: { getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() },
  zustandMMKVStorageSensitive: { getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() },
  createAsyncMMKVStorage: () => ({ getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() }),
}));

const MEMBER = {
  id: '66666666-6666-4666-8666-666666666666',
  username: 'member',
  role: 'cinephile',
  preferences: { theme: 'light' },
};
const PENDING = `dirty_prefs_${MEMBER.id}`;

beforeEach(() => {
  jest.useFakeTimers();
  mockStore.clear();
  useAuthStore.setState({ user: { ...MEMBER, preferences: { ...MEMBER.preferences } }, isAuthenticated: true, loading: false } as never);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const theme = () => (useAuthStore.getState().user as unknown as { preferences: { theme: string } }).preferences.theme;

describe('a setting that fails to save', () => {
  it('is kept on disk while the debounce is open (so a killed phone still sends it)', async () => {
    jest.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: null } as never);
    await useAuthStore.getState().setPreference('theme', 'dark');
    expect(mockStore.get(PENDING)).toContain('dark');
  });

  it('is undone on screen AND on disk when the server refuses it', async () => {
    jest.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: { message: 'refused' } } as never);
    await useAuthStore.getState().setPreference('theme', 'dark');
    await jest.advanceTimersByTimeAsync(1000);

    expect(theme()).toBe('light');           // undone on screen
    expect(mockStore.has(PENDING)).toBe(false); // and the next launch will not re-apply it
  });

  it('but keeps a NEWER change made while the refused one was in flight', async () => {
    let refuse: () => void = () => {};
    jest.spyOn(supabase, 'rpc')
      .mockImplementationOnce((() => new Promise((res) => {
        refuse = () => res({ data: null, error: { message: 'refused' } });
      })) as never)
      .mockResolvedValue({ data: null, error: null } as never);
    await useAuthStore.getState().setPreference('theme', 'dark');
    await jest.advanceTimersByTimeAsync(1000);            // the first send is in the air
    await useAuthStore.getState().setPreference('language', 'fr'); // a new window opens

    refuse();
    await jest.advanceTimersByTimeAsync(0);

    expect(mockStore.get(PENDING)).toContain('fr');       // still pending, still sent later
  });

  it('and a setting the server accepts leaves nothing pending', async () => {
    jest.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: null } as never);
    await useAuthStore.getState().setPreference('theme', 'dark');
    await jest.advanceTimersByTimeAsync(1000);

    expect(theme()).toBe('dark');
    expect(mockStore.has(PENDING)).toBe(false);
  });
});
