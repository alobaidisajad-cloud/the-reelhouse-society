/**
 * endSession — every sign-out on this phone ends the session here, the server reached or not (P4.1).
 *
 * supabase-js's `signOut` keeps the stored session when the server cannot be reached: it answers
 * `{ error }` and removes nothing (`GoTrueClient._signOut`). The app signed the member out on screen
 * and the next launch, or the next token refresh, signed them back in. So when the server's answer
 * is an error or is late, the session ends on the phone all the same: the refresh stops and the
 * stored session is removed here. What the server still holds is OWED: that session's refresh
 * token, and this phone's push token when its row could not be deleted, kept encrypted (in memory
 * only while the phone's storage is unencrypted). It is settled when the network returns or at the
 * next launch, in three plain requests that never touch this phone's session (a client would retry
 * a refresh for half a minute on a network still away): the old session refreshed, its push token's
 * row deleted, the session ended, the record erased. A finder holds that no `signOut` is called
 * anywhere else (everySignOutEndsTheSessionHere).
 */
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL, fetchWithinLimit } from '@/src/lib/supabase';
import { authSessionStorage } from '@/src/lib/authSessionStorage';
import { PUSH_TOKEN_KEY } from '@/src/lib/pushNotifications';
import { isStorageEncrypted, setSensitive, storage } from '@/src/stores/mmkv-storage';
import { raceDeadline } from '@/src/utils/raceDeadline';
import { e2eTrace } from '@/src/utils/e2eTrace';

/** How long the server is given to end a session before it ends on the phone alone. */
export const SIGN_OUT_DEADLINE_MS = 5000;

const OWED_KEY = 'sign_out_owed';

/** What the server still holds of a session ended on the phone alone. */
interface Owed { refreshToken: string; userId: string | null; pushToken: string | null }

let owedInMemory: Owed | null = null;

function readOwed(): Owed | null {
  if (owedInMemory) return owedInMemory;
  try {
    const kept = storage.getString(OWED_KEY);
    return kept ? (JSON.parse(kept) as Owed) : null;
  } catch {
    return null;
  }
}

function keepOwed(owed: Owed): void {
  if (isStorageEncrypted()) setSensitive(OWED_KEY, JSON.stringify(owed));
  else owedInMemory = owed;
}

function eraseOwed(): void {
  owedInMemory = null;
  try { storage.delete(OWED_KEY); } catch { /* nothing kept */ }
}

/** The key supabase-js keeps this phone's session under (its own, read from the client). */
function sessionKey(): string | null {
  const key = (supabase.auth as unknown as { storageKey?: unknown }).storageKey;
  return typeof key === 'string' && key ? key : null;
}

/**
 * Ends this phone's session. True when the server ended it too; false when it is owed, the
 * session gone from the phone all the same. `pushStillHeld`: this phone's push token row could
 * not be deleted, so it is owed with the session.
 */
export async function endSessionHere({ pushStillHeld = false }: { pushStillHeld?: boolean } = {}): Promise<boolean> {
  let held: { refresh_token?: string; user?: { id?: string } } | null = null;
  try { held = (await raceDeadline(supabase.auth.getSession(), SIGN_OUT_DEADLINE_MS)).data.session; } catch { held = null; }

  let reached = false;
  try {
    const { error } = await raceDeadline(supabase.auth.signOut({ scope: 'local' }), SIGN_OUT_DEADLINE_MS);
    reached = !error;
  } catch {
    reached = false;
  }
  if (reached) return true;

  // Not reached: the phone lets the session go itself, and nothing refreshes it back.
  try { await supabase.auth.stopAutoRefresh(); } catch { /* a client with no refresh running */ }
  const key = sessionKey();
  if (key) {
    await authSessionStorage.removeItem(key);
    await authSessionStorage.removeItem(`${key}-code-verifier`);
  }
  if (held?.refresh_token) {
    let pushToken: string | null = null;
    if (pushStillHeld) { try { pushToken = storage.getString(PUSH_TOKEN_KEY) ?? null; } catch { pushToken = null; } }
    keepOwed({ refreshToken: held.refresh_token, userId: held.user?.id ?? null, pushToken });
  }
  e2eTrace('auth.signout.owed', { push: pushStillHeld });
  return false;
}

let settling: Promise<void> | null = null;

/**
 * Settles what a sign-out left owed: the old session refreshed apart from this phone's, its push
 * token's row deleted, the session ended on the server. Kept for next time when the network is
 * still away; erased when the server no longer knows the session (400: nothing left to end).
 */
export function settleOwedSignOut(): Promise<void> {
  if (settling) return settling;
  settling = (async () => {
    const owed = readOwed();
    if (!owed) return;
    const asHouse = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
    try {
      const refreshed = await fetchWithinLimit(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', headers: asHouse, body: JSON.stringify({ refresh_token: owed.refreshToken }),
      });
      if (!refreshed.ok) {
        if (refreshed.status === 400) eraseOwed();
        return;
      }
      const { access_token: access } = (await refreshed.json()) as { access_token?: string };
      if (!access) return;
      const asThem = { ...asHouse, Authorization: `Bearer ${access}` };
      if (owed.pushToken && owed.userId) {
        const row = `user_id=eq.${encodeURIComponent(owed.userId)}&token=eq.${encodeURIComponent(owed.pushToken)}`;
        const deleted = await fetchWithinLimit(`${SUPABASE_URL}/rest/v1/push_tokens?${row}`, { method: 'DELETE', headers: asThem });
        if (!deleted.ok) return;
      }
      const ended = await fetchWithinLimit(`${SUPABASE_URL}/auth/v1/logout?scope=local`, { method: 'POST', headers: asThem });
      if (ended.ok || ended.status === 401 || ended.status === 404) eraseOwed();
    } catch {
      /* the network is still away: owed for next time */
    }
  })().finally(() => { settling = null; });
  return settling;
}

/** Ends every other session of this member (the server reached, or not and said so). */
export async function endOtherSessions(): Promise<boolean> {
  try {
    const { error } = await raceDeadline(supabase.auth.signOut({ scope: 'others' }), SIGN_OUT_DEADLINE_MS);
    return !error;
  } catch {
    return false;
  }
}

/** For tests: what is owed now. */
export const __owedForTests = readOwed;
