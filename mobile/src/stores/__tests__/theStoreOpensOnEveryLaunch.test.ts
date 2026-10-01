/**
 * The encrypted store opens on every launch, not only the first.
 *
 * MMKV refuses to open a store with a key over 16 bytes (react-native-mmkv's
 * MmkvHostObject throws), while recrypt keys it with the first 16. An earlier
 * build stored a 64-character key: the first launch encrypted the store, and
 * every launch after it failed to open it and ran on the empty placeholder,
 * signing the member out. The fake below behaves as the native code does.
 */
const mockSecure = new Map<string, string>();
const mockFiles = new Map<string, string | null>(); // store id → the 16 bytes it is keyed with

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockSecure.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { mockSecure.set(k, v); }),
  deleteItemAsync: jest.fn(async (k: string) => { mockSecure.delete(k); }),
}));
let mockRecryptFails = false;

jest.mock('react-native-mmkv', () => ({
  MMKV: class {
    id: string;
    // As the library: the default configuration applies only when none is passed,
    // and native refuses an id that is not a string.
    constructor(config: { id?: string; encryptionKey?: string } = { id: 'mmkv.default' }) {
      if (typeof config.id !== 'string') throw new Error('Value is undefined, expected a String');
      this.id = config.id;
      const key = config.encryptionKey ?? null;
      if (key !== null && key.length > 16) {
        throw new Error('Failed to create MMKV instance! `encryptionKey` cannot be longer than 16 bytes!');
      }
      const held = mockFiles.get(this.id) ?? null;
      if (held !== null && held !== key) throw new Error('wrong key for this store');
    }
    recrypt(key: string) {
      if (mockRecryptFails) throw new Error('recrypt failed');
      mockFiles.set(this.id, key.slice(0, 16));
    }
    clearAll() { mockFiles.delete(this.id); }
  },
}));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

const KEY_NAME = 'reelhouse_mmkv_encryption_key';
const launch = async () => {
  let m!: typeof import('../mmkv-storage');
  jest.isolateModules(() => { m = jest.requireActual<typeof import('../mmkv-storage')>('../mmkv-storage'); });
  await m.initEncryptedStorage();
  return m;
};

beforeEach(() => { mockSecure.clear(); mockFiles.clear(); mockRecryptFails = false; });

describe('the encrypted store', () => {
  it('opens on the launch after the first, as on the first', async () => {
    expect((await launch()).isStorageEncrypted()).toBe(true);
    expect((await launch()).isStorageEncrypted()).toBe(true);
    expect(mockSecure.get(KEY_NAME)!.length).toBeLessThanOrEqual(16);
  });

  it('opens a store an earlier build keyed with a 64-character key, with no data lost', async () => {
    const earlier = 'a'.repeat(32) + 'b'.repeat(32);
    mockSecure.set(KEY_NAME, earlier);
    mockFiles.set('mmkv.default', earlier.slice(0, 16)); // what recrypt took
    expect((await launch()).isStorageEncrypted()).toBe(true);
  });

  it('opens fresh and encrypted when the first encryption fails, and again after', async () => {
    mockRecryptFails = true;
    expect((await launch()).isStorageEncrypted()).toBe(true);
    mockRecryptFails = false;
    expect((await launch()).isStorageEncrypted()).toBe(true);
  });
});
