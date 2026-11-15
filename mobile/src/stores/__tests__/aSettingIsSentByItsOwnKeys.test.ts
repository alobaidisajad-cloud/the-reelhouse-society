/**
 * aSettingIsSentByItsOwnKeys.test.ts — a setting is sent as the keys changed, and kept offline.
 *
 * The house merges preferences key by key (update_my_preferences). The phone sent its whole copy,
 * so a key another device had changed since this phone read it was put back. A toggle made with
 * no network snapped back a second later, unsaid, and the settings sheet's SAVE filed nothing a
 * member changed there (it waited on no answer). A refusal took back every key on the screen,
 * a newer change made while it was away included.
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
  withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
  initEncryptedStorage: jest.fn().mockResolvedValue(undefined),
  zustandMMKVStorage: { getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() },
  zustandMMKVStorageSensitive: { getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() },
  createAsyncMMKVStorage: () => ({ getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() }),
}));

const MEMBER = {
  id: '77777777-7777-4777-8777-777777777777',
  username: 'member',
  role: 'cinephile',
  preferences: { theme: 'light', language: 'en', hide_slurs: false },
};
const PENDING = `dirty_prefs_${MEMBER.id}`;
const OFFLINE = { data: null, error: { message: 'TypeError: Network request failed' } };
const REFUSED = { data: null, error: { message: 'permission denied', code: '42501' } };
const TAKEN = { data: null, error: null };

const prefs = () => (useAuthStore.getState().user as unknown as { preferences: Record<string, unknown> }).preferences;
const pending = () => { const s = mockStore.get(PENDING); return s ? JSON.parse(s) as Record<string, unknown> : null; };
const sentWith = (rpc: jest.SpyInstance) => rpc.mock.calls
  .filter(([fn]) => fn === 'update_my_preferences')
  .map(([, args]) => (args as { p_preferences: Record<string, unknown> }).p_preferences);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockStore.clear();
  useAuthStore.setState({ user: { ...MEMBER, preferences: { ...MEMBER.preferences } }, isAuthenticated: true, loading: false } as never);
});

afterEach(async () => {
  await jest.runOnlyPendingTimersAsync();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('a toggle', () => {
  it('sends the key it changed, never the phone’s whole copy', async () => {
    const rpc = jest.spyOn(supabase, 'rpc').mockResolvedValue(TAKEN as never);
    await useAuthStore.getState().setPreference('theme', 'dark');
    expect(pending()).toEqual({ theme: 'dark' });
    await jest.advanceTimersByTimeAsync(1000);
    expect(sentWith(rpc)).toEqual([{ theme: 'dark' }]);
    expect(pending()).toBeNull();
  });

  it('made with no network stays on, kept to be sent, its key alone', async () => {
    jest.spyOn(supabase, 'rpc').mockResolvedValue(OFFLINE as never);
    await useAuthStore.getState().setPreference('hide_slurs', true);
    await jest.advanceTimersByTimeAsync(1000);
    expect(prefs().hide_slurs).toBe(true);
    expect(pending()).toEqual({ hide_slurs: true });
  });

  it('thrown offline (a fetch that never answered) is kept the same way', async () => {
    jest.spyOn(supabase, 'rpc').mockRejectedValue(new TypeError('Network request failed') as never);
    await useAuthStore.getState().setPreference('hide_slurs', true);
    await jest.advanceTimersByTimeAsync(1000);
    expect(prefs().hide_slurs).toBe(true);
    expect(pending()).toEqual({ hide_slurs: true });
  });

  it('refused takes back its own keys, and a key changed while it was away stays', async () => {
    let refuse: () => void = () => {};
    jest.spyOn(supabase, 'rpc')
      .mockImplementationOnce((() => new Promise((res) => { refuse = () => res(REFUSED); })) as never)
      .mockResolvedValue(TAKEN as never);
    await useAuthStore.getState().setPreference('theme', 'dark');
    await jest.advanceTimersByTimeAsync(1000);                     // the send is away
    await useAuthStore.getState().setPreference('language', 'fr'); // a window of its own
    refuse();
    await jest.advanceTimersByTimeAsync(0);

    expect(prefs().theme).toBe('light');       // the refused key, taken back
    expect(prefs().language).toBe('fr');       // the newer change, still on screen
    expect(pending()).toEqual({ language: 'fr' });
  });

  it('refused, takes back the key it changed even if the same key was sent before it', async () => {
    jest.spyOn(supabase, 'rpc').mockResolvedValue(REFUSED as never);
    await useAuthStore.getState().setPreference('theme', 'dark');
    await useAuthStore.getState().setPreference('theme', 'sepia');
    await jest.advanceTimersByTimeAsync(1000);
    expect(prefs().theme).toBe('light');
    expect(pending()).toBeNull();
  });
});

describe('the settings sheet’s save (savePreferences)', () => {
  it('files only the keys it changed and waits for the house: saved', async () => {
    const rpc = jest.spyOn(supabase, 'rpc').mockResolvedValue(TAKEN as never);
    await expect(useAuthStore.getState().savePreferences({ language: 'ar' })).resolves.toBe('saved');
    expect(sentWith(rpc)).toEqual([{ language: 'ar' }]);
    expect(prefs().language).toBe('ar');
    expect(pending()).toBeNull();
  });

  it('with no network says kept, keeps the change on screen and pending', async () => {
    jest.spyOn(supabase, 'rpc').mockResolvedValue(OFFLINE as never);
    await expect(useAuthStore.getState().savePreferences({ language: 'ar' })).resolves.toBe('kept');
    expect(prefs().language).toBe('ar');
    expect(pending()).toEqual({ language: 'ar' });
  });

  it('refused throws and takes back what it changed, nothing else', async () => {
    jest.spyOn(supabase, 'rpc').mockResolvedValue(OFFLINE as never);
    await useAuthStore.getState().setPreference('hide_slurs', true);
    await jest.advanceTimersByTimeAsync(1000);                     // kept, offline
    jest.spyOn(supabase, 'rpc').mockResolvedValue(REFUSED as never);
    await expect(useAuthStore.getState().savePreferences({ language: 'ar' })).rejects.toThrow();
    expect(prefs().language).toBe('en');
    expect(prefs().hide_slurs).toBe(true);
    expect(pending()).toEqual({ hide_slurs: true });
  });

  it('takes a toggle’s waiting window with it, in one send', async () => {
    const rpc = jest.spyOn(supabase, 'rpc').mockResolvedValue(TAKEN as never);
    await useAuthStore.getState().setPreference('theme', 'dark');
    await useAuthStore.getState().savePreferences({ language: 'ar' });
    await jest.advanceTimersByTimeAsync(1000);
    expect(sentWith(rpc)).toEqual([{ theme: 'dark', language: 'ar' }]);
  });
});

describe('the profile read again', () => {
  it('lays the keys still pending over the house’s copy, key by key', async () => {
    mockStore.set(PENDING, JSON.stringify({ hide_slurs: true }));
    jest.spyOn(supabase, 'rpc').mockResolvedValue(OFFLINE as never);
    const fromTheHouse = { ...MEMBER, preferences: { theme: 'dark', language: 'de', hide_slurs: false } };
    jest.spyOn(supabase, 'from').mockReturnValue({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: fromTheHouse, error: null }) }) }),
    } as never);
    await useAuthStore.getState().rereadProfile();
    // Another device's keys arrive; the one this phone has not yet filed stays this phone's.
    expect(prefs()).toEqual({ theme: 'dark', language: 'de', hide_slurs: true });
  });
});
