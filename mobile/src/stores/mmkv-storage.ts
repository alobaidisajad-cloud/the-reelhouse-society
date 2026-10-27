import { StateStorage, PersistStorage } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';
import { InteractionManager } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
// Safe to import here: neither module imports this one (no cycle), and
// initSentry() runs before initEncryptedStorage() in the boot sequence, so
// reporting from this file actually reaches Sentry rather than being dropped.
import { logger } from '@/src/utils/logger';
import { captureError } from '@/src/lib/sentry';
import { e2eTrace } from '@/src/utils/e2eTrace';
import { bootStore } from '@/src/lib/bootStore';

// ── Encryption-at-rest (LIB-5) ───────────────────────────────────────────────
// MMKV needs its encryption key *synchronously at construction*, but the key is
// kept in the OS keystore via expo-secure-store, which is async-only. We resolve
// this with a deferred-hydration bootstrap:
//
//   1. `storage` starts as the plaintext default instance (live binding) so any
//      synchronous consumer keeps working, BUT nothing reads through it before
//      init: the persisted stores use `skipHydration` and rehydrate after init,
//      and every other consumer runs after the app-ready gate in _layout.
//   2. `initEncryptedStorage()` runs first in the boot sequence:
//        • first ever launch → generate a key, persist it, recrypt the existing
//          plaintext data in place (one-time migration, no data loss).
//        • subsequent launches → reopen the instance WITH the key.
//   3. Because `storage` is an ES `let` export (a live binding), reassigning it
//      here transparently upgrades every importer to the encrypted instance.

const KEY_NAME = 'reelhouse_mmkv_encryption_key';

// Import-time placeholder in its OWN namespace so construction can never touch —
// and therefore never fail to decrypt — the real (default-id) data on an
// already-encrypted relaunch. Nothing reads/writes through it before
// initEncryptedStorage() reassigns `storage` to the real instance (the boot
// gate + skipHydration guarantee this).
export let storage = new MMKV({ id: 'reelhouse-preinit' });
const _pendingWrites = new Map<string, any>();

/**
 * Whether `storage` is actually encrypted.
 *
 * FAIL CLOSED — false until an init path proves otherwise. Before init this is
 * correct by construction (nothing writes through `storage` that early), and if
 * init fails it stays false, which is exactly what the callers below need.
 */
let _encrypted = false;

/** True only if member content may be written to disk. */
export function isStorageEncrypted(): boolean {
    return _encrypted;
}

/**
 * Write something that identifies or belongs to the member.
 *
 * Skips entirely when storage is not encrypted. A cache is a speed
 * optimisation; the server is the source of truth, so the cost of not writing
 * is a slower cold start on a device whose keystore is broken. The cost of
 * writing is the member's data readable on disk — and until now that included
 * their EMAIL, because the cached profile is `{ ...session.user, ...profile }`
 * and JSON.stringify keeps every property.
 *
 * Use `storage.set` directly only for values that are not about the member:
 * a bare user id, a launch flag, a recovery flag.
 */
export function setSensitive(key: string, value: string): void {
    if (!_encrypted) return;
    storage.set(key, value);
}

let _initPromise: Promise<void> | null = null;
let _markReady: () => void = () => undefined;
const _ready = new Promise<void>((resolve) => { _markReady = resolve; });

/** Settles when initEncryptedStorage has, either way: `storage` is then final. */
export function storageReady(): Promise<void> {
  return _ready;
}

/**
 * MMKV refuses to OPEN a store with a key over 16 bytes; recrypt takes the first
 * 16. Earlier builds stored a 64-character key: their stores were keyed with its
 * first 16, and opening with the whole of it failed on every launch after the first.
 */
export const MMKV_KEY_BYTES = 16;

/** The key MMKV holds for a stored one: its first 16 bytes, as recrypt took them. */
export function mmkvKey(stored: string): string {
  return stored.slice(0, MMKV_KEY_BYTES);
}

/**
 * The member's store, by the id MMKV gives one opened with no configuration. Passed
 * whenever a configuration is: `new MMKV({ encryptionKey })` replaces the default
 * configuration whole, its id goes to native undefined, and the open throws.
 */
export const STORE_ID = 'mmkv.default';

/**
 * How long the keystore may take to answer before the launch goes on without it. Measured as
 * launch to `storage.opened` over 25 emulator launches (Sealed E2E run 40492844027, 2026-10-27):
 * p50 1.15 s, slowest 2.43 s, the whole of JavaScript's start included (`storage.asking` now
 * marks the keystore's own share). Ten seconds is four times the slowest, so an honest slow
 * keystore is never cut off; past it, the launch settles on the placeholder as a keystore error
 * does, where it waited on the splash for ever.
 */
export const KEYSTORE_DEADLINE_MS = 10_000;

/** The keystore did not answer within KEYSTORE_DEADLINE_MS. */
export class KeystoreSilent extends Error {
  constructor(what: string) {
    super(`KeystoreSilent: ${what} had no answer in ${KEYSTORE_DEADLINE_MS} ms`);
    this.name = 'KeystoreSilent';
  }
}

/** A keystore call, or KeystoreSilent at the deadline: an answer after it is never read. */
export function withinKeystoreDeadline<T>(ask: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const silent = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new KeystoreSilent(what)), KEYSTORE_DEADLINE_MS);
  });
  return Promise.race([ask, silent]).finally(() => clearTimeout(timer));
}

let _keystoreSilent = false;

/** Whether this launch's keystore never answered (the member is told; their session waits for the next). */
export function keystoreWasSilent(): boolean {
  return _keystoreSilent;
}

/** What the member is told when it did not: never a silent sign-out. */
export const KEYSTORE_SILENT_NOTICE =
  "The phone's secure store did not answer. Your session and drafts come back the next time the app opens; "
  + 'what you change now is sent while it stays open, and lost if it closes first.';

const KEY_ALPHABET ='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function generateKey(): string {
  // 16 characters of 64 symbols: 96 bits, the most a 16-byte key holds as text.
  return Array.from(Crypto.getRandomBytes(MMKV_KEY_BYTES), (b) => KEY_ALPHABET[b % 64]).join('');
}

/**
 * A plain mark, in a store of its own beside the member's, that the member's store was opened
 * encrypted on this install. It travels with the store's files (a backup restores both), and the
 * keychain's key may not: a launch that finds the mark and no key knows the store is unreadable.
 */
const ENCRYPTED_MARK = 'store_encrypted';

function wasEncryptedHere(): boolean {
  try { return bootStore().getBoolean(ENCRYPTED_MARK) === true; } catch { return false; }
}

function markEncryptedHere(): void {
  try { bootStore().set(ENCRYPTED_MARK, true); } catch { /* read again next launch */ }
}

let _keyWasLost = false;

/** Whether this launch found the store's key gone and began a fresh store (the member is told). */
export function storeKeyWasLost(): boolean {
  return _keyWasLost;
}

/** What the member is told when it was: one plain line, never a silent sign-out. */
export const STORE_KEY_LOST_NOTICE =
  "This phone's saved copy could not be opened after a restore, so it was cleared. Sign in, and the house brings it all back.";

/** The member's work an earlier launch may have left on the placeholder (queueOwnership's QUEUE_KEY, memberDrafts' DRAFT_PREFIX). */
export const PLACEHOLDER_KEEPS = { queue: 'reelhouse-offline-mutations', drafts: 'reelhouse_draft_' } as const;

const listIn = (raw: string | undefined): { id?: unknown; timestamp?: number }[] => {
  try { const parsed: unknown = raw ? JSON.parse(raw) : []; return Array.isArray(parsed) ? parsed : []; } catch { return []; }
};
const savedAtOf = (raw: string | undefined): number => {
  try { return Date.parse((JSON.parse(raw ?? '{}') as { savedAt?: string }).savedAt ?? '') || 0; } catch { return 0; }
};

/**
 * On a launch that opens the member's encrypted store, what an earlier launch left on the
 * placeholder is carried in, and the placeholder emptied: an older build wrote its offline queue
 * there while its store was not encrypted, and any build its drafts, both in plain text. A queued
 * write the store already holds is not doubled (by id), and the queue keeps the order the writes
 * were made in; of two drafts under one key, the later stays.
 */
function adoptThePlaceholder(from: MMKV, into: MMKV): void {
  try {
    const keys = from.getAllKeys();
    if (keys.length === 0) return;
    for (const key of keys) {
      const value = from.getString(key);
      if (value === undefined) continue;
      if (key.startsWith(PLACEHOLDER_KEEPS.queue)) {
        const held = listIn(into.getString(key));
        const ids = new Set(held.map((m) => m.id));
        const merged = [...held, ...listIn(value).filter((m) => !ids.has(m.id))].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
        if (merged.length > 0) into.set(key, JSON.stringify(merged));
      } else if (key.startsWith(PLACEHOLDER_KEEPS.drafts)) {
        const had = into.getString(key);
        if (had === undefined || savedAtOf(value) > savedAtOf(had)) into.set(key, value);
      }
    }
    from.clearAll();
    e2eTrace('storage.adopted', { keys: keys.length });
  } catch (e) {
    captureError(e, { scope: 'mmkv.adoptThePlaceholder' });
  }
}

/**
 * Initialize encryption-at-rest for the MMKV store. Idempotent; safe to await
 * multiple times. MUST be awaited before any persisted store is rehydrated and
 * before any code reads/writes `storage`.
 */
export function initEncryptedStorage(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    let step = 'read-key';
    const placeholder = storage;
    e2eTrace('storage.asking');
    try {
      const existingKey = await withinKeystoreDeadline(SecureStore.getItemAsync(KEY_NAME), step);
      if (existingKey) {
        step = 'open';
        // Data on disk is already encrypted — open the default store WITH the key.
        storage = new MMKV({ id: STORE_ID, encryptionKey: mmkvKey(existingKey) });
        _encrypted = true;
        return;
      }
      if (wasEncryptedHere()) {
        step = 'key-lost';
        // The store was encrypted on this install, and its key is gone: a restore that brought
        // the files back without the keychain (an unencrypted Mac backup). Its bytes cannot be
        // read, so they are never recrypted: cleared, and a fresh store begun. The member is told;
        // the house holds everything that mattered, and signing in brings it back.
        const key = generateKey();
        await withinKeystoreDeadline(SecureStore.setItemAsync(KEY_NAME, key), step);
        try { new MMKV({ id: STORE_ID }).clearAll(); } catch { /* opened with the key below, a fresh store either way */ }
        storage = new MMKV({ id: STORE_ID, encryptionKey: key });
        _encrypted = true;
        _keyWasLost = true;
        captureError(new Error('the store\'s key was gone; the store was cleared'), { scope: 'mmkv.keyLost' });
        return;
      }
      step = 'first-key';
      // First encryption. Persist the key FIRST so it can never be lost after a
      // successful recrypt, then open the existing plaintext default store and
      // encrypt it in place (preserves all existing data — no loss).
      const key = generateKey();
      await withinKeystoreDeadline(SecureStore.setItemAsync(KEY_NAME, key), step);
      const plain = new MMKV({ id: STORE_ID }); // currently plaintext
      try {
        plain.recrypt(key);
        storage = plain;
        _encrypted = true;
      } catch (recryptErr) {
        // recrypt failed. The plaintext data is STILL ON DISK, and walking away
        // left it there permanently — readable, including private notes. This is
        // the one path where clearing is provably safe: the data was plaintext a
        // moment ago, because encrypting it is what just failed.
        //
        // It also repairs the fallback. Opening this same file WITH a key while
        // it still holds plaintext yields a handle over bytes it cannot decrypt;
        // clearing first makes the new instance a clean, valid encrypted store.
        //
        // The cost is a cold cache, refetched from the server. The alternative
        // is the member's own writing left readable on their device forever.
        try { plain.clearAll(); } catch { /* best effort — see below */ }
        storage = new MMKV({ id: STORE_ID, encryptionKey: key });
        _encrypted = true;

        logger.error('[mmkv] recrypt failed; cleared the plaintext store and started fresh');
        captureError(recryptErr, { scope: 'mmkv.recrypt', clearedPlaintext: true });
      }
    } catch (e) {
      // Keystore unavailable (e.g. unsupported platform). Launch continues
      // rather than bricking — but the old comment here was wrong twice, and
      // both errors mattered:
      //
      //  1. It said the cached data is "non-sensitive". It is not. The film
      //     store persists up to 150 logs of the member's own reviews, and the
      //     Vault store persists their PRIVATE NOTES (a log no longer carries
      //     one — since 2026-09-18 notes live by viewing, in vaultStore). The
      //     profile cache is worse again: it is `{ ...session.user, ...profile }`,
      //     so it carries the member's EMAIL.
      //  2. It said this degrades to "the unencrypted instance". It does not —
      //     nothing is assigned here, so `storage` stays the import-time
      //     placeholder, a SEPARATE store id. The member's existing cache is
      //     invisible and that session's writes are orphaned on next launch.
      //
      // The placeholder is kept deliberately: it is the safer of the two. We
      // cannot know whether the data on disk is plaintext or already encrypted,
      // so we neither read it nor clear it — unlike the recrypt path above,
      // which has proof. `_encrypted` stays false, so `setSensitive` and the
      // member-content stores write nothing at all while we are in this state.
      //
      // Reported rather than whispered: this used to be `if (__DEV__)`, which
      // meant a member could run permanently degraded and nobody would ever know.
      if (e instanceof KeystoreSilent) _keystoreSilent = true;
      logger.error('[mmkv] encryption init failed; running on the isolated placeholder store');
      captureError(e, { scope: 'mmkv.initEncryptedStorage', degraded: true, step });
      e2eTrace('storage.failed', { step, message: String((e as { message?: unknown })?.message ?? e).slice(0, 160) });
    } finally {
      if (_encrypted) {
        markEncryptedHere();
        adoptThePlaceholder(placeholder, storage);
      }
      e2eTrace('storage.opened', { encrypted: _encrypted });
      _markReady();
    }
  })();
  return _initPromise;
}

// Legacy synchronous storage for non-monolithic stores
export const zustandMMKVStorage: StateStorage = {
  setItem: (name, value) => storage.set(name, value),
  getItem: (name) => storage.getString(name) ?? null,
  removeItem: (name) => storage.delete(name),
};

/**
 * The same adapter for stores holding MEMBER CONTENT.
 *
 * Notifications name who interacted with the member and about what — a readable
 * record of their social life. It is a cache; fetchNotifications repopulates it.
 */
export const zustandMMKVStorageSensitive: StateStorage = {
  setItem: (name, value) => { if (_encrypted) storage.set(name, value); },
  getItem: (name) => storage.getString(name) ?? null,
  removeItem: (name) => storage.delete(name),
};

// Asynchronous Deferred Serialization
// Pushes BOTH the heavy JSON.stringify of the monolithic state tree AND the
// MMKV disk write onto the InteractionManager queue. This guarantees that
// rapid store mutations (e.g. liking a film, scrolling) never block the
// UI thread's 60fps frame budget.
/**
 * `sensitive: true` means this store holds MEMBER CONTENT, and must not reach
 * disk unless storage is encrypted.
 *
 * Declared here, at the one line that decides where a store is written, rather
 * than inside each `partialize`. That placement matters: a store's partialize is
 * mocked in tests, so a gate there is both invisible to them and repeated per
 * store, while a gate here is stated once and cannot be forgotten by a store
 * that adds a new persisted field later.
 */
type StorageOptions = { sensitive?: boolean };

export const createAsyncMMKVStorage = <T>(opts: StorageOptions = {}): PersistStorage<T> => ({
  getItem: (name) => {
    const str = storage.getString(name);
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  },
  setItem: (name, newValue) => {
    // The film store persists up to 150 of the member's logs with no field
    // filtering. (Those logs used to carry `privateNotes` as well; notes now
    // live by viewing in the Vault store, which is gated the same way through
    // zustandMMKVStorageSensitive.) Writing a member's own writing in plaintext
    // because a keystore failed, silently, is the outcome worth losing a
    // cold-start optimisation to avoid. The window
    // exists "purely for instant cold-start display", so the fallback is a
    // slower first paint while fetch* repopulates from the server.
    if (opts.sensitive && !_encrypted) return;

    _pendingWrites.set(name, newValue);

    let executed = false;
    const flush = () => {
      if (executed) return;
      executed = true;
      clearTimeout(fallback);

      if (_pendingWrites.get(name) !== newValue) return;

      try {
        const str = JSON.stringify(newValue);
        storage.set(name, str);
      } catch (err) {
        if (__DEV__) console.warn('[AsyncMMKVStorage] Serialization failed', err);
      }
    };

    const task = InteractionManager.runAfterInteractions(flush);
    const fallback = setTimeout(() => {
      task.cancel();
      flush();
    }, 1500); // 1.5s fallback to prevent data loss during continuous animations
  },
  removeItem: (name) => {
    _pendingWrites.delete(name);
    storage.delete(name);
  },
});
