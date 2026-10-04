/**
 * The signed-in session outgrows SecureStore's 2,048 bytes, so it is kept in the
 * encrypted store; a session an earlier build kept in SecureStore moves over on
 * first read, and nobody is signed out by the move.
 */
import { authSessionStorage } from '../authSessionStorage';

const mockMmkv = new Map<string, string>();
const mockSecure = new Map<string, string>();
const mockState = { encrypted: true, release: () => undefined as void, ready: Promise.resolve() };

jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: {
    getString: (k: string) => mockMmkv.get(k),
    set: (k: string, v: string) => { mockMmkv.set(k, v); },
    delete: (k: string) => { mockMmkv.delete(k); },
  },
  storageReady: () => mockState.ready,
  isStorageEncrypted: () => mockState.encrypted,
}));
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'afterFirstUnlock',
  getItemAsync: jest.fn(async (k: string) => mockSecure.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { mockSecure.set(k, v); }),
  deleteItemAsync: jest.fn(async (k: string) => { mockSecure.delete(k); }),
}));

const KEY = 'sb-project-auth-token';
const SESSION = JSON.stringify({ access_token: 'a'.repeat(1100), user: { id: 'm1', blob: 'b'.repeat(1300) } });

beforeEach(() => {
  mockMmkv.clear();
  mockSecure.clear();
  mockState.encrypted = true;
  mockState.ready = Promise.resolve();
});

describe('a member signed in by an earlier build', () => {
  it('keeps their session: it moves to the encrypted store, and the old copy goes', async () => {
    mockSecure.set(KEY, SESSION);
    await expect(authSessionStorage.getItem(KEY)).resolves.toBe(SESSION);
    expect(mockMmkv.get(KEY)).toBe(SESSION);
    expect(mockSecure.has(KEY)).toBe(false);
    // and the next read finds it where it now lives
    await expect(authSessionStorage.getItem(KEY)).resolves.toBe(SESSION);
  });
});

describe('a session of any size', () => {
  it('is written to the encrypted store, never to SecureStore', async () => {
    await authSessionStorage.setItem(KEY, SESSION);
    expect(mockMmkv.get(KEY)).toBe(SESSION);
    expect(mockSecure.has(KEY)).toBe(false);
  });

  it('signing out forgets it in both places', async () => {
    mockMmkv.set(KEY, SESSION);
    mockSecure.set(KEY, SESSION);
    await authSessionStorage.removeItem(KEY);
    expect(mockMmkv.has(KEY)).toBe(false);
    expect(mockSecure.has(KEY)).toBe(false);
  });

  it('nobody signed in reads as nobody', async () => {
    await expect(authSessionStorage.getItem(KEY)).resolves.toBeNull();
  });
});

describe('before the encrypted store has opened', () => {
  it('a read waits for it, so a session is never missed', async () => {
    let open = (): void => undefined;
    mockState.ready = new Promise<void>((r) => { open = r; });
    mockMmkv.set(KEY, SESSION);
    let got: string | null | undefined;
    const reading = authSessionStorage.getItem(KEY).then((v) => { got = v; });
    await Promise.resolve();
    expect(got).toBeUndefined();
    open();
    await reading;
    expect(got).toBe(SESSION);
  });
});

describe('the encrypted store says when it has opened', () => {
  /** The real module, with SecureStore answering or failing as asked. */
  const realStore = (keystore: 'works' | 'fails') => {
    let mod: typeof import('@/src/stores/mmkv-storage') | undefined;
    jest.isolateModules(() => {
      const secure = jest.requireMock('expo-secure-store') as Record<string, jest.Mock>;
      secure.getItemAsync.mockImplementationOnce(async () => {
        if (keystore === 'fails') throw new Error('keystore unavailable');
        return 'k'.repeat(64);
      });
      mod = jest.requireActual<typeof import('@/src/stores/mmkv-storage')>('@/src/stores/mmkv-storage');
    });
    return mod!;
  };
  /** 'settled', or 'waiting' if 50 ms pass first; the wait is cleared either way. */
  const settles = async (p: Promise<void>) => {
    let wait: ReturnType<typeof setTimeout> | undefined;
    const waiting = new Promise((r) => { wait = setTimeout(() => r('waiting'), 50); });
    return Promise.race([p.then(() => 'settled'), waiting]).finally(() => clearTimeout(wait));
  };

  // Every sign-in waits on this: if it never settled, nobody could sign in.
  it.each(['works', 'fails'] as const)('when the keystore %s, and not before it is asked', async (keystore) => {
    const m = realStore(keystore);
    await expect(settles(m.storageReady())).resolves.toBe('waiting');
    await m.initEncryptedStorage();
    await expect(settles(m.storageReady())).resolves.toBe('settled');
    expect(m.isStorageEncrypted()).toBe(keystore === 'works');
  });
});

describe('with no encrypted store (a broken keystore)', () => {
  it('SecureStore keeps the session, as before', async () => {
    mockState.encrypted = false;
    await authSessionStorage.setItem(KEY, SESSION);
    expect(mockSecure.get(KEY)).toBe(SESSION);
    expect(mockMmkv.has(KEY)).toBe(false);
    await expect(authSessionStorage.getItem(KEY)).resolves.toBe(SESSION);
    // and a read never moves it into a store that is not encrypted
    expect(mockSecure.get(KEY)).toBe(SESSION);
    expect(mockMmkv.has(KEY)).toBe(false);
  });
});
