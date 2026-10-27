/**
 * A keystore that never answers never holds the launch, and the member's work is never left on
 * disk unencrypted (P4.14).
 *
 * The store's key is asked of the keystore before anything else at launch, and the splash waits
 * for it. A keystore that never answered kept the member on the splash for good. Now the ask has
 * a deadline (KEYSTORE_DEADLINE_MS, measured): past it the launch settles on the isolated
 * placeholder, as a keystore error does, and an answer that comes later is never read, so the
 * store is never swapped mid-session. An older build wrote its offline queue to that placeholder,
 * in plain text; the next launch that opens the member's own store carries it in, with any
 * drafts left there, and empties the placeholder. Driven on the real module, the keystore's
 * timing set and each MMKV store a map of its own.
 */
type Mod = typeof import('../mmkv-storage');

const DEADLINE = 10_000;
const opened: { id?: string; encryptionKey?: string }[] = [];
const recrypted: string[] = [];
/** Each store's contents by its id, as the disk holds them. */
const disk = new Map<string, Map<string, string>>();
const onDisk = (id: string) => disk.get(id) ?? disk.set(id, new Map()).get(id)!;

function load(getItemAsync: () => Promise<string | null>): Mod {
  let mod!: Mod;
  jest.isolateModules(() => {
    jest.doMock('react-native-mmkv', () => ({
      MMKV: jest.fn().mockImplementation((config?: { id?: string; encryptionKey?: string }) => {
        opened.push(config ?? {});
        const store = onDisk(config?.id ?? 'mmkv.default');
        return {
          set: (k: string, v: string | boolean) => { store.set(k, String(v)); }, getString: (k: string) => store.get(k), delete: (k: string) => { store.delete(k); },
          getBoolean: (k: string) => (store.has(k) ? store.get(k) === 'true' : undefined),
          clearAll: () => store.clear(), recrypt: (key: string) => { recrypted.push(key); }, contains: (k: string) => store.has(k), getAllKeys: () => [...store.keys()],
        };
      }),
    }));
    jest.doMock('expo-secure-store', () => ({ getItemAsync: jest.fn(getItemAsync), setItemAsync: jest.fn(async () => {}) }));
    // requireActual: jest.setup stands in for this module everywhere else.
    mod = jest.requireActual('../mmkv-storage') as Mod;
  });
  return mod;
}

const KEY = 'k'.repeat(16);

beforeEach(() => {
  opened.length = 0;
  recrypted.length = 0;
  disk.clear();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

describe('the keystore\'s deadline', () => {
  it('never answering, the launch goes on at the deadline, on the placeholder, and says why', async () => {
    let answer: (key: string) => void = () => {};
    const mod = load(() => new Promise((resolve) => { answer = resolve; }));
    expect(mod.KEYSTORE_DEADLINE_MS).toBe(DEADLINE);
    let ready = false;
    void mod.storageReady().then(() => { ready = true; });
    void mod.initEncryptedStorage();

    await jest.advanceTimersByTimeAsync(DEADLINE - 1);
    expect(ready).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect([ready, mod.isStorageEncrypted(), mod.keystoreWasSilent()]).toEqual([true, false, true]);

    // The keystore answers after all: too late, and never read.
    const placeholder = mod.storage;
    answer('a-key-come-too-late');
    await jest.advanceTimersByTimeAsync(0);
    expect([mod.storage === placeholder, mod.isStorageEncrypted(), opened.map((o) => o.id)]).toEqual([true, false, ['reelhouse-preinit']]);
  });

  it('answering just inside the deadline, the member\'s own store opens, encrypted', async () => {
    const mod = load(() => new Promise((resolve) => { setTimeout(() => resolve(KEY), DEADLINE - 50); }));
    const init = mod.initEncryptedStorage();
    await jest.advanceTimersByTimeAsync(DEADLINE - 50);
    await init;
    expect([mod.isStorageEncrypted(), mod.keystoreWasSilent(), opened.find((o) => o.encryptionKey)]).toEqual([true, false, { id: mod.STORE_ID, encryptionKey: KEY }]);
  });

  it('an error from the keystore is not a silence: the placeholder, but no "did not answer"', async () => {
    const mod = load(() => Promise.reject(new Error('keystore unavailable')));
    await mod.initEncryptedStorage();
    expect([mod.isStorageEncrypted(), mod.keystoreWasSilent()]).toEqual([false, false]);
  });
});

describe('a store come back without its key', () => {
  it('is cleared, never recrypted over its old bytes; a fresh store begins, and the member is told', async () => {
    onDisk('reelhouse-boot').set('store_encrypted', 'true');
    onDisk('mmkv.default').set('ironvault_user_cache_m', 'bytes only the lost key could read');
    const mod = load(async () => null);
    await mod.initEncryptedStorage();
    expect([recrypted, onDisk('mmkv.default').size, mod.isStorageEncrypted(), mod.storeKeyWasLost()]).toEqual([[], 0, true, true]);
    expect(opened.find((o) => o.id === mod.STORE_ID && o.encryptionKey)?.encryptionKey).toHaveLength(16);
  });

  it('a first launch (no mark) still encrypts what is there, in place, and says nothing', async () => {
    onDisk('mmkv.default').set('last_tab', 'plain');
    const mod = load(async () => null);
    await mod.initEncryptedStorage();
    expect([recrypted.length, onDisk('mmkv.default').get('last_tab'), mod.storeKeyWasLost(), onDisk('reelhouse-boot').get('store_encrypted')])
      .toEqual([1, 'plain', false, 'true']);
  });

  it('a launch that opens the store marks it, so a later restore without the key is known', async () => {
    const mod = load(async () => KEY);
    await mod.initEncryptedStorage();
    expect(onDisk('reelhouse-boot').get('store_encrypted')).toBe('true');
  });
});

describe('what an earlier launch left on the placeholder', () => {
  const write = (id: string, timestamp: number) => ({ id, type: 'add_critique', payload: { body: id }, timestamp });

  it('is carried into the member\'s store, in the order it was made, and the placeholder emptied', async () => {
    const queue = 'reelhouse-offline-mutations';
    onDisk('reelhouse-preinit').set(queue, JSON.stringify([write('older-build', 100), write('both', 300)]));
    onDisk('reelhouse-preinit').set('reelhouse_draft_m_critique_f1', JSON.stringify({ v: 2, savedAt: '2026-10-27T10:00:00.000Z', data: { body: 'later' } }));
    onDisk('reelhouse-preinit').set('reelhouse_draft_m_log', JSON.stringify({ v: 2, savedAt: '2026-10-01T10:00:00.000Z', data: { review: 'earlier' } }));
    onDisk('reelhouse-preinit').set('last_tab', JSON.stringify({ tab: 'reels', at: 1 }));
    onDisk('mmkv.default').set(queue, JSON.stringify([write('this-build', 200), write('both', 300)]));
    onDisk('mmkv.default').set('reelhouse_draft_m_log', JSON.stringify({ v: 2, savedAt: '2026-10-20T10:00:00.000Z', data: { review: 'kept' } }));

    const mod = load(async () => KEY);
    await mod.initEncryptedStorage();
    const mine = onDisk('mmkv.default');
    expect((JSON.parse(mine.get(queue)!) as { id: string }[]).map((m) => m.id)).toEqual(['older-build', 'this-build', 'both']);
    expect(JSON.parse(mine.get('reelhouse_draft_m_critique_f1')!).data.body).toBe('later');
    expect(JSON.parse(mine.get('reelhouse_draft_m_log')!).data.review).toBe('kept');
    expect([mine.has('last_tab'), onDisk('reelhouse-preinit').size]).toEqual([false, 0]);
  });

  it('is left where it is while the store cannot be opened', async () => {
    onDisk('reelhouse-preinit').set('reelhouse-offline-mutations', JSON.stringify([write('older-build', 100)]));
    const mod = load(() => Promise.reject(new Error('keystore unavailable')));
    await mod.initEncryptedStorage();
    expect(onDisk('reelhouse-preinit').size).toBe(1);
  });

  it('names the keys the queue and the drafts are written under', () => {
    const mod = load(async () => KEY);
    expect(mod.PLACEHOLDER_KEEPS).toEqual({
      queue: jest.requireActual('@/src/utils/queueOwnership').QUEUE_KEY,
      drafts: jest.requireActual('@/src/utils/memberDrafts').DRAFT_PREFIX,
    });
  });
});
