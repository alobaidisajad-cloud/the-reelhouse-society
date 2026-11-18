/**
 * endSession — every sign-out on this phone ends the session here, the server reached or not (P4.1).
 *
 * supabase-js's `signOut` keeps the stored session when the server cannot be reached: it answers
 * `{ error }` and removes nothing (`GoTrueClient._signOut`). The app signed the member out on screen
 * and the next launch, or the next token refresh, signed them back in. So when the server's answer
 * is an error or is late, the session ends on the phone all the same: the refresh stops and the
 * stored session is removed here. What the server still holds is OWED: that session's refresh
 * token, and this phone's push token when its row could not be forgotten, kept encrypted (in memory
 * only while the phone's storage is unencrypted). It is settled when the network returns or at the
 * next launch, in plain requests that never touch this phone's session (a client would retry a
 * refresh for half a minute on a network still away): the push token forgotten by the token itself
 * (forget_push_token, which needs no session: a session ended elsewhere owes its token too), then
 * the old session refreshed and ended, the record erased. A finder holds that no `signOut` is called
 * anywhere else (everySignOutEndsTheSessionHere).
 */
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL, fetchWithinLimit } from '@/src/lib/supabase';
import { authSessionStorage } from '@/src/lib/authSessionStorage';
import { PUSH_TOKEN_KEY } from '@/src/lib/pushNotifications';
import { isStorageEncrypted, setSensitive, storage } from '@/src/stores/mmkv-storage';
import { raceDeadline } from '@/src/utils/raceDeadline';
import { e2eTrace } from '@/src/utils/e2eTrace';
import { logger } from '@/src/utils/logger';

/** How long the server is given to end a session before it ends on the phone alone. */
export const SIGN_OUT_DEADLINE_MS = 5000;

const OWED_KEY = 'sign_out_owed';

/**
 * What the server still holds of a session ended on the phone alone: its refresh token (none when
 * the session had already ended elsewhere), and this phone's push token with the member it was
 * registered to, when it could not be forgotten.
 */
interface Owed { refreshToken: string | null; userId: string | null; pushToken: string | null }

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

/** This phone's push token, as last registered; null when none is remembered. */
function thisPhonesToken(): string | null {
  try { return storage.getString(PUSH_TOKEN_KEY) ?? null; } catch { return null; }
}

/**
 * This phone's push token could not be forgotten (offline, or the house refused): owed, with the
 * member it was registered to, beside whatever else is owed. Settled by settleOwedSignOut.
 */
export function owePushToken(memberId: string | null): void {
  const pushToken = thisPhonesToken();
  if (!pushToken || !memberId) return;
  // The member names whose row the token is (the refresh token owed, if any, needs no member).
  keepOwed({ refreshToken: readOwed()?.refreshToken ?? null, userId: memberId, pushToken });
}

/**
 * The phone registered `token` again (for whoever is signed in now): an owed forget of the same token
 * would take the new registration with it, so it is no longer owed.
 */
export function tokenRegisteredAgain(token: string): void {
  const owed = readOwed();
  if (!owed || owed.pushToken !== token) return;
  if (owed.refreshToken) keepOwed({ ...owed, pushToken: null });
  else eraseOwed();
}

/**
 * Ends this phone's session. True when the server ended it too; false when it is owed, the
 * session gone from the phone all the same. `pushStillHeld`: this phone's push token could not be
 * forgotten, so it is owed with the session, under `memberId` when the session was already gone.
 */
export async function endSessionHere({ pushStillHeld = false, memberId = null }: { pushStillHeld?: boolean; memberId?: string | null } = {}): Promise<boolean> {
  let held: { refresh_token?: string; user?: { id?: string } } | null = null;
  try { held = (await raceDeadline(supabase.auth.getSession(), SIGN_OUT_DEADLINE_MS)).data.session; } catch { held = null; }

  let reached = false;
  try {
    const { error } = await raceDeadline(supabase.auth.signOut({ scope: 'local' }), SIGN_OUT_DEADLINE_MS);
    reached = !error;
  } catch {
    reached = false;
  }
  if (reached) {
    // The session ended at the house; a push token not forgotten is still owed, by the token.
    if (pushStillHeld) owePushToken(held?.user?.id ?? memberId);
    return true;
  }

  // Not reached: the phone lets the session go itself, and nothing refreshes it back.
  try { await supabase.auth.stopAutoRefresh(); } catch { /* a client with no refresh running */ }
  const key = sessionKey();
  if (key) {
    await authSessionStorage.removeItem(key);
    await authSessionStorage.removeItem(`${key}-code-verifier`);
  }
  const pushToken = pushStillHeld ? thisPhonesToken() : null;
  if (held?.refresh_token) {
    keepOwed({ refreshToken: held.refresh_token, userId: held.user?.id ?? memberId, pushToken });
  } else if (pushToken && memberId) {
    // The session was already gone (ended elsewhere): only the token is owed.
    keepOwed({ refreshToken: null, userId: memberId, pushToken });
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
    // The other phones' tokens a "sign out of every other device" could not forget (this phone's own session).
    try { await settleOwedOthers(); } catch { /* owed for next time */ }
    let owed = readOwed();
    if (!owed) return;
    const asHouse = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
    try {
      // The push token first, by the token itself: it needs no session, so a session that can no
      // longer be refreshed (ended elsewhere) still has its phone's token forgotten.
      if (owed.pushToken && owed.userId) {
        const forgot = await fetchWithinLimit(`${SUPABASE_URL}/rest/v1/rpc/forget_push_token`, {
          method: 'POST', headers: { ...asHouse, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ p_token: owed.pushToken, p_user: owed.userId }),
        });
        // A refusal no later try can change (anything but a busy house) is not asked again.
        if (!forgot.ok && (forgot.status >= 500 || forgot.status === 429)) return;
        owed = { ...owed, pushToken: null };
        if (owed.refreshToken) keepOwed(owed);
        else { eraseOwed(); return; }
      }
      if (!owed.refreshToken) { eraseOwed(); return; }
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
      const ended = await fetchWithinLimit(`${SUPABASE_URL}/auth/v1/logout?scope=local`, { method: 'POST', headers: asThem });
      if (ended.ok || ended.status === 401 || ended.status === 404) eraseOwed();
    } catch {
      /* the network is still away: owed for next time */
    }
  })().finally(() => { settling = null; });
  return settling;
}

/**
 * Ends every other session of this member (the server reached, or not and said so), and then every
 * other phone's push token: a phone signed out went on showing the member's notices on its lock
 * screen. This phone keeps its own, named by the token it holds (and by its session, at the house).
 * The tokens are best effort once the sessions have ended: a token left registered under an ended
 * session is never sent to (push_tokens_of), and goes at the next notice.
 */
export async function endOtherSessions(): Promise<boolean> {
  try {
    const { error } = await raceDeadline(supabase.auth.signOut({ scope: 'others' }), SIGN_OUT_DEADLINE_MS);
    if (error) return false;
  } catch {
    return false;
  }
  if (!(await forgetOtherDevices())) {
    // Owed, and asked again when the network returns or at the next launch (settleOwedSignOut): left,
    // a token from before round 13 on the phone signed out could be sent to for up to a month.
    let member: string | null = null;
    try { member = (await supabase.auth.getSession()).data.session?.user?.id ?? null; } catch { member = null; }
    if (member) {
      try { setSensitive(OTHERS_OWED_KEY, member); } catch { /* asked again at the next "sign out every other device" */ }
    }
  }
  return true;
}

const OTHERS_OWED_KEY = 'others_forget_owed';

/**
 * The house forgets every other phone's token of the member, and writes this session onto this
 * phone's own row (forget_other_devices), so its token is tied to it. True when the house answered.
 */
async function forgetOtherDevices(): Promise<boolean> {
  try {
    const { error } = await raceDeadline(
      Promise.resolve(supabase.rpc('forget_other_devices', { p_keep_token: thisPhonesToken() })), SIGN_OUT_DEADLINE_MS);
    if (error) logger.warn('[endSession] the other phones\' tokens were not forgotten:', error.message);
    return !error;
  } catch (e) {
    logger.warn('[endSession] the other phones\' tokens were not forgotten:', e);
    return false;
  }
}

/**
 * A forget of the other phones' tokens still owed: asked again under the session of the member who
 * owes it, and let go once the house has answered, or once that member is no longer signed in here
 * (their other phones' sessions ended with the sign-out, and the house sends by session).
 */
async function settleOwedOthers(): Promise<void> {
  let owedBy: string | undefined;
  try { owedBy = storage.getString(OTHERS_OWED_KEY); } catch { owedBy = undefined; }
  if (!owedBy) return;
  let member: string | null = null;
  try { member = (await supabase.auth.getSession()).data.session?.user?.id ?? null; } catch { return; }
  if (member !== owedBy) {
    try { storage.delete(OTHERS_OWED_KEY); } catch { /* nothing kept */ }
    return;
  }
  if (await forgetOtherDevices()) {
    try { storage.delete(OTHERS_OWED_KEY); } catch { /* nothing kept */ }
  }
}

/** For tests: who owes a forget of the other phones' tokens now. */
export const __othersOwedForTests = (): string | null => {
  try { return storage.getString(OTHERS_OWED_KEY) ?? null; } catch { return null; }
};

/** For tests: what is owed now. */
export const __owedForTests = readOwed;
