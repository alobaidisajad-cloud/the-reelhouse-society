/**
 * encryptionAtRest.guard.test.ts — batch 25 · #49
 * ───────────────────────────────────────────────
 * Every other suite mocks mmkv-storage and therefore stands in for the ENCRYPTED
 * case. This file drives the real module, because the whole finding is about
 * what happens when encryption is NOT available — the path nobody exercised and
 * nobody could see, since it only ever logged under `if (__DEV__)`.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const mmkv = strip(read('src/stores/mmkv-storage.ts'));

describe('#49 · a failure to encrypt is never silent', () => {
  it('both failure paths report — neither is dev-only', () => {
    // This used to be `if (__DEV__) console.warn(...)`, so a member could run
    // permanently degraded and nobody would ever learn of it.
    expect(mmkv).not.toMatch(/if \(__DEV__\) console\.warn\('\[mmkv\]/);
    expect((mmkv.match(/captureError\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(mmkv).toMatch(/scope: 'mmkv\.initEncryptedStorage'/);
    expect(mmkv).toMatch(/scope: 'mmkv\.recrypt'/);
  });

  it('the false justification is gone', () => {
    // Two claims, both untrue: the cached data is NOT non-sensitive (the film
    // store persists logs carrying privateNotes, and the profile cache carries
    // the member's email), and it does NOT degrade to "the unencrypted
    // instance" — nothing is assigned, so `storage` stays the placeholder.
    expect(mmkv).not.toMatch(/the cached data is non-sensitive/);
    expect(mmkv).not.toMatch(/Degrade gracefully to\s*\n?\s*\/\/ the unencrypted instance/);
  });
});

describe('#49 · a failed recrypt leaves no plaintext behind', () => {
  it('clears the plaintext store before falling back', () => {
    // THE permanent exposure: recrypt fails, the code opened a fresh encrypted
    // handle and walked away — leaving the plaintext bytes on disk, readable,
    // forever. This is the one path where clearing is provably safe, because the
    // data was plaintext a moment ago: encrypting it is what just failed.
    const at = mmkv.indexOf('plain.recrypt(key)');
    expect(at).toBeGreaterThan(-1);
    const branch = mmkv.slice(at, mmkv.indexOf('} catch (e)', at));
    expect(branch.length).toBeGreaterThan(100);
    expect(branch).toMatch(/plain\.clearAll\(\)/);
  });

  it('but NEVER clears when the keystore itself failed', () => {
    // There the state is unknown — the data on disk may already be encrypted, so
    // clearing would destroy a recoverable cache to fix a problem that may not
    // exist. The distinction is the difference between a security fix and data
    // loss, so it is pinned rather than left to judgement.
    const at = mmkv.lastIndexOf('} catch (e)');
    const outer = mmkv.slice(at);
    expect(outer).not.toMatch(/clearAll\(\)/);
  });
});

describe('#49 · member content never reaches disk unencrypted', () => {
  it('fails CLOSED — unencrypted until proven otherwise', () => {
    // If this defaulted to true, everything written before init resolved would
    // leak, and a failed init would leak everything after it too.
    expect(mmkv).toMatch(/let _encrypted = false;/);
    // And it is only ever raised on a path that actually succeeded.
    expect((mmkv.match(/_encrypted = true;/g) ?? []).length).toBe(3);
    expect(mmkv).not.toMatch(/_encrypted = true[\s\S]{0,80}catch \(e\)/);
  });

  it('setSensitive refuses while unencrypted — driven, not read', () => {
    jest.isolateModules(() => {
      jest.doMock('react-native-mmkv', () => {
        const store = new Map<string, string>();
        return {
          MMKV: jest.fn().mockImplementation(() => ({
            set: (k: string, v: string) => store.set(k, v),
            getString: (k: string) => store.get(k),
            delete: (k: string) => store.delete(k),
            clearAll: () => store.clear(),
            recrypt: () => {},
            contains: (k: string) => store.has(k),
            getAllKeys: () => [...store.keys()],
            __store: store,
          })),
        };
      });
      // requireActual, NOT require: jest.setup mocks this module globally, so a
      // plain require returns the stand-in that reports `true` — and this test
      // would have passed while proving nothing about the real gate.
      const mod = jest.requireActual('../mmkv-storage') as typeof import('../mmkv-storage');
      // Never initialised, so the flag is false — exactly the degraded state.
      expect(mod.isStorageEncrypted()).toBe(false);
      mod.setSensitive('ironvault_user_cache_u1', JSON.stringify({ email: 'a@b.c' }));
      expect(mod.storage.getString('ironvault_user_cache_u1')).toBeUndefined();
      // A non-sensitive value still writes — the gate must not brick the app.
      mod.storage.set('last_user_id', 'u1');
      expect(mod.storage.getString('last_user_id')).toBe('u1');
    });
  });

  it('the stores holding member content declare themselves sensitive', () => {
    // Declared at the ONE line that decides where a store is written, so a store
    // adding a new persisted field later cannot forget it.
    expect(strip(read('src/stores/films.ts')))
      .toMatch(/createAsyncMMKVStorage\(\{ sensitive: true \}\)/);
    expect(strip(read('src/stores/notificationStore.ts')))
      .toMatch(/createJSONStorage\(\(\) => zustandMMKVStorageSensitive\)/);
  });

  it('the profile cache — which carries the member EMAIL — is gated', () => {
    // `{ ...session.user, ...profile }`, and JSON.stringify keeps every
    // property. This was the worst of the plaintext writes.
    const auth = strip(read('src/stores/auth.ts'));
    expect(auth).not.toMatch(/storage\.set\(`ironvault_user_cache_/);
    expect(auth).toMatch(/setSensitive\(`ironvault_user_cache_/);
  });

  it('but PENDING WRITES are never gated — that would be data loss', () => {
    // The line is caches versus unsynced work. A cache is refetchable, so
    // skipping it costs a slower first paint. A pending write is the member's
    // own unsaved work, so skipping it destroys it — the exact loss the offline
    // queue exists to prevent.
    const auth = strip(read('src/stores/auth.ts'));
    expect(auth).toMatch(/storage\.set\(`dirty_profile_/);
    expect(auth).toMatch(/storage\.set\(`dirty_prefs_/);
    expect(strip(read('src/utils/offlineQueue.ts'))).toMatch(/storage\.set\(QUEUE_KEY/);
  });
});
