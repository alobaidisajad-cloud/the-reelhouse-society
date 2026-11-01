/**
 * Where Supabase keeps the signed-in session.
 *
 * A member's session is ~2.4 KB; SecureStore holds 2,048 bytes and says larger
 * values may not be stored. So the session lives in the encrypted MMKV store,
 * whose key SecureStore holds, as Supabase advises for Expo. A session kept in
 * SecureStore by an earlier build is moved on first read, so nobody is signed out.
 *
 * With no encrypted store (a broken keystore), SecureStore is used as before.
 */
import * as SecureStore from 'expo-secure-store';
import { storage, storageReady, isStorageEncrypted, withinKeystoreDeadline } from '@/src/stores/mmkv-storage';
import { logger } from '@/src/utils/logger';
import { e2eTrace } from '@/src/utils/e2eTrace';
import { stampOwnerlessWrites } from '@/src/utils/queueOwnership';

// Each keystore call has the launch's deadline (mmkv-storage.ts): a keystore that never answers
// leaves no read, sign-in or sign-out waiting for ever.
async function readSecure(key: string): Promise<string | null> {
  try {
    return await withinKeystoreDeadline(SecureStore.getItemAsync(key), 'session read');
  } catch (e) {
    logger.error('Failed to get item from SecureStore (device might be locked)', e);
    return null;
  }
}

async function forgetSecure(key: string): Promise<void> {
  try { await withinKeystoreDeadline(SecureStore.deleteItemAsync(key), 'session forget'); } catch { /* nothing there to keep */ }
}

/** The member a stored session belongs to, or null. */
function memberOf(stored: string | null): string | null {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as { user?: { id?: unknown }; currentSession?: { user?: { id?: unknown } } };
    const id = parsed?.user?.id ?? parsed?.currentSession?.user?.id;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

// Traced for the E2E by kind, store and size alone: never a token.
async function readItem(key: string): Promise<string | null> {
  await storageReady();
  const kind = key.endsWith('-code-verifier') ? 'verifier' : 'session';
  if (!isStorageEncrypted()) {
    const secured = await readSecure(key);
    e2eTrace('auth.storage.read', { kind, from: secured === null ? 'none' : 'secure', encrypted: false });
    return secured;
  }
  const kept = storage.getString(key);
  if (kept !== undefined) {
    e2eTrace('auth.storage.read', { kind, from: 'mmkv', encrypted: true });
    return kept;
  }
  const earlier = await readSecure(key);
  if (earlier !== null) {
    storage.set(key, earlier);
    await forgetSecure(key);
  }
  e2eTrace('auth.storage.read', { kind, from: earlier === null ? 'none' : 'moved', encrypted: true });
  return earlier;
}

/** What is kept under a key now, read without moving or tracing anything: the session about to be replaced. */
async function storedNow(key: string): Promise<string | null> {
  if (!isStorageEncrypted()) return readSecure(key);
  return storage.getString(key) ?? null;
}

interface Dated { access_token?: unknown; expires_in?: unknown; expires_at?: unknown }

/** A stored session's dating fields, or null for nothing or for what is not a session. */
function sessionIn(stored: string | null): Dated | null {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Dated) : null;
  } catch {
    return null;
  }
}

/**
 * How long a token lives, in seconds: its own `exp` less its `iat`, both written by the server's
 * clock, so how far the phone's clock is off never enters it. `expires_in` only when the token
 * cannot be read: supabase-js's `setSession` (the sign-in by username) writes it as the token's
 * `exp` less the phone's now, which is the server's date again.
 */
function lifeOf(session: Dated): number | null {
  const payload = typeof session.access_token === 'string' ? session.access_token.split('.')[1] : undefined;
  if (payload && typeof globalThis.atob === 'function') {
    try {
      const padded = payload.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (payload.length % 4)) % 4);
      const claims = JSON.parse(globalThis.atob(padded)) as { exp?: unknown; iat?: unknown };
      if (typeof claims.exp === 'number' && typeof claims.iat === 'number' && claims.exp > claims.iat) return claims.exp - claims.iat;
    } catch { /* not a token this phone can read: its expires_in instead */ }
  }
  return typeof session.expires_in === 'number' && session.expires_in > 0 ? session.expires_in : null;
}

/**
 * A session dated by the phone that holds it (WORKLIST P4.32). The server dates a token by its own
 * clock (`expires_at`), and supabase-js weighs that against the phone's: a phone hours ahead saw
 * each new token as spent and asked for another at every request, and one hours behind kept a
 * token the server had already refused. So a token's life is counted from the moment this phone
 * received it. The same token saved again (its member read anew) keeps the date it was first
 * given, or every save would lengthen its life.
 */
export function datedByThePhone(written: string, before: string | null, nowMs: number = Date.now()): string {
  const next = sessionIn(written);
  const life = next && typeof next.access_token === 'string' ? lifeOf(next) : null;
  if (!next || life === null) return written;
  const prev = sessionIn(before);
  const expiresAt = prev?.access_token === next.access_token && typeof prev?.expires_at === 'number'
    ? prev.expires_at
    : Math.floor(nowMs / 1000) + life;
  return expiresAt === next.expires_at ? written : JSON.stringify({ ...next, expires_at: expiresAt });
}

/**
 * A stored session as the phone may trust it. A date further off than the token's whole life was
 * never given by this phone: a session an earlier build kept by the server's clock, or a clock
 * set back since. It is read as due now, so supabase-js renews it once and the new token is dated
 * here; a phone ahead of the server already reads such a session as spent.
 */
export function trustedByThePhone(stored: string | null, nowMs: number = Date.now()): string | null {
  const session = sessionIn(stored);
  const life = session ? lifeOf(session) : null;
  if (!session || life === null || typeof session.expires_at !== 'number') return stored;
  const nowS = Math.floor(nowMs / 1000);
  return session.expires_at - nowS > life ? JSON.stringify({ ...session, expires_at: nowS }) : stored;
}

export const authSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const read = await readItem(key);
    const value = key.endsWith('-code-verifier') ? read : trustedByThePhone(read);
    // The client reads the stored session before it may refresh (and so end)
    // it: an older build's ownerless writes take that session's member first.
    if (!key.endsWith('-code-verifier')) {
      try { stampOwnerlessWrites(memberOf(value)); } catch (e) {
        logger.warn('[auth.storage] could not stamp the queue with its member', e);
      }
    }
    return value;
  },

  async setItem(key: string, written: string): Promise<void> {
    await storageReady();
    const kind = key.endsWith('-code-verifier') ? 'verifier' : 'session';
    const value = kind === 'session' ? datedByThePhone(written, trustedByThePhone(await storedNow(key))) : written;
    if (!isStorageEncrypted()) {
      await withinKeystoreDeadline(SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }), 'session write');
      e2eTrace('auth.storage.write', { kind, to: 'secure', bytes: value.length });
      return;
    }
    storage.set(key, value);
    e2eTrace('auth.storage.write', { kind, to: 'mmkv', bytes: value.length, held: storage.getString(key) === value });
  },

  async removeItem(key: string): Promise<void> {
    await storageReady();
    if (isStorageEncrypted()) storage.delete(key);
    await forgetSecure(key);
    e2eTrace('auth.storage.remove', { kind: key.endsWith('-code-verifier') ? 'verifier' : 'session' });
  },
};
