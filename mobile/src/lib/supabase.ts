import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform, AppState } from 'react-native';
import { authSessionStorage } from './authSessionStorage';
import { heardRefusal } from './refusalEvents';

// The anon key is public by design: RLS and column grants guard every table.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'dummy';

/** How long a request to the house may take, its whole answer received, before it counts as not reached. */
export const REQUEST_LIMIT_MS = 15_000;
/** The same for storage, where a picture goes up over the slowest network a member may have. */
export const STORAGE_LIMIT_MS = 90_000;

/** The error a request that ran out of time ends with: read by isNetworkError as not reached. */
const timedOut = (ms: number) => Object.assign(new Error(`The request timed out after ${ms} ms`), { name: 'TimeoutError' });

/**
 * A request given up when its time runs out. Android's networking waits on a
 * connection with no limit, so a request caught by a change of network (data
 * to Wi-Fi) could wait for minutes, holding back everything queued behind it.
 * React Native's fetch settles only once the whole answer has arrived, so the
 * limit covers the answer too. A caller's own signal still ends it, as itself.
 */
export const fetchWithinLimit: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  const ms = url.includes('/storage/v1/') ? STORAGE_LIMIT_MS : REQUEST_LIMIT_MS;
  const controller = new AbortController();
  const theirs = init?.signal;
  const passOn = () => controller.abort(theirs?.reason);
  if (theirs?.aborted) passOn();
  else theirs?.addEventListener('abort', passOn);
  let ranOut = false;
  const timer = setTimeout(() => { ranOut = true; controller.abort(); }, ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (e) {
    throw ranOut ? timedOut(ms) : e;
  } finally {
    clearTimeout(timer);
    theirs?.removeEventListener('abort', passOn);
  }
};

/**
 * The client's fetch: each request within its time limit, and every refusal's
 * sentence (HTTP 403) told to refusalEvents; the response itself is untouched.
 */
export const fetchHearingRefusals: typeof fetch = async (input, init) => {
  const res = await fetchWithinLimit(input, init);
  if (res.status === 403) {
    // A copy is read; the caller's own response is untouched.
    res.clone().json()
      .then((body: { message?: unknown }) => { if (typeof body?.message === 'string') heardRefusal(body.message); })
      .catch(() => { /* not JSON: nothing to hear */ });
  }
  return res;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchHearingRefusals },
  auth: {
    ...(Platform.OS !== 'web' ? { storage: authSessionStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // Email links come back with ?code=, which auth-callback exchanges for a session.
    flowType: 'pkce',
  },
});

// Tells Supabase Auth to continuously refresh the session automatically if
// the app is in the foreground. When this is added, you will continue to receive
// `onAuthStateChange` events with the `TOKEN_REFRESHED` or `SIGNED_OUT` event
// if the user's session is terminated. This should only be registered once.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
