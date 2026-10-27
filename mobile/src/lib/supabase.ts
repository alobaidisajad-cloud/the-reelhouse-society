import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform, AppState } from 'react-native';
import { authSessionStorage } from './authSessionStorage';
import { heardRefusal } from './refusalEvents';
import { E2E_BUILD, e2eTrace } from '../utils/e2eTrace';
import { captureDeadline } from './sentry';

// The anon key is public by design: RLS and column grants guard every table.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'dummy';
/** The house's address and public key, for a client of its own (endSession's owed sign-out). */
export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;

/** How long a request to the house may take, its whole answer received, before it counts as not reached. */
export const REQUEST_LIMIT_MS = 15_000;
/** The same for storage, where a picture goes up over the slowest network a member may have. */
export const STORAGE_LIMIT_MS = 90_000;

/** The statuses an answer has no body with (a Response made with one throws). */
const NO_BODY = new Set([204, 205, 304]);

/**
 * The error a request that ran out of time ends with: never a bare AbortError (a member's own
 * cancel), and coded ABORT_ERR, so postgrest-js ends the whole call at the deadline. Coded
 * otherwise, it tried a read three more times, a second, two and four apart: a read on a hung
 * connection spun 67 seconds before its screen could say it was not reached. isNetworkError reads
 * it as not reached, thrown or (as postgrest-js resolves it) by its message.
 */
export class DeadlineExceeded extends Error {
  readonly code = 'ABORT_ERR';
  constructor(ms: number) {
    super(`The request timed out after ${ms} ms`);
    this.name = 'DeadlineExceeded';
  }
}

/** One deadline hit in ten is told to Sentry, by its host and path alone: a slow road seen, never a flood. */
const DEADLINE_TOLD = 0.1;
function tellDeadline(url: string, e: DeadlineExceeded) {
  if (Math.random() >= DEADLINE_TOLD) return;
  try {
    const u = new URL(url);
    captureDeadline(e, u.host, u.pathname);
  } catch { /* an address that does not parse is not told */ }
}

/**
 * In the E2E build alone, each request the app made and how it ended: its status, or the error it
 * met. A fault run matches it to the gateway's log line by method, path and time (WORKLIST P0.75),
 * so an answer the house sent and the app never heard is seen from both sides. `ms` is how long
 * after it began the app took the answer in: the round trip, and any wait for the app's own thread,
 * which the speed lab weighs against when the screen was ready (a screen's floor).
 */
const traceRequest = (method: string | undefined, url: string, at: number, outcome: { status: number } | { error: string }) => {
  if (!E2E_BUILD) return;
  let path = url;
  try { const u = new URL(url); path = `${u.pathname}${u.search}`; } catch { /* written as given */ }
  e2eTrace('request', { method: (method ?? 'GET').toUpperCase(), path, at: new Date(at).toISOString(), ms: Date.now() - at, ...outcome });
};

/**
 * A request given up when its time runs out. Android's networking waits on a
 * connection with no limit, so a request caught by a change of network (data
 * to Wi-Fi) could wait for minutes, holding back everything queued behind it.
 * Expo's fetch settles once the headers arrive and streams the rest, so the
 * answer is read here, whole, inside the limit: the caller gets it already
 * arrived. Every answer the house gives the app is text (JSON, or nothing). A
 * caller's own signal still ends it, as itself.
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
  const at = Date.now();
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    const body = NO_BODY.has(res.status) ? null : await res.text();
    traceRequest(init?.method, url, at, { status: res.status });
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  } catch (e) {
    const ended = ranOut ? new DeadlineExceeded(ms) : e;
    if (ended instanceof DeadlineExceeded) tellDeadline(url, ended);
    traceRequest(init?.method, url, at, { error: ended instanceof Error ? `${ended.name}: ${ended.message}` : String(ended) });
    throw ended;
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
