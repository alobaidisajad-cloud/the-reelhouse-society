/**
 * ReelHouse — Sign In With Username (BACKEND-EMAIL-ENUM-1)
 * ────────────────────────────────────────────────────────
 * Authenticates a user by USERNAME without ever exposing their email to the
 * client. The old flow had the client call `get_email_by_username` (which
 * returned the email and confirmed account existence) and then sign in — a
 * user-enumeration vector. This function does the lookup + sign-in entirely
 * server-side and returns ONLY session tokens.
 *
 * - One refusal (401) for a wrong handle and a wrong password alike. Handles
 *   are public (every profile shows one); the address behind one is not.
 * - 429 when the caller is asking too fast, here or at Supabase Auth; and 429
 *   naming the handle ({ paused: 'handle', from: 'here' | 'elsewhere',
 *   retry_after }, Retry-After) when the house holds this attempt back.
 * - 503 when the house could not be asked (the database, Auth, a time limit):
 *   never "wrong password" for a failure that is ours, and never counted.
 *   Both apps and build 41 say "unavailable" for it.
 * - Every attempt on a member's handle is counted at the house (sign_in_attempt,
 *   H-A1): per door, the address the platform vouches for (five wrong a day,
 *   then rests of a minute doubling to an hour: a guesser rests only their own
 *   door), and in a pail every door not known to the member shares (20, one
 *   more every five minutes: many doors at once are slowed together). The right
 *   password hands the phone a key (`device`); a phone sending it is never held
 *   by the pail, so the member's own phone always has a way in, whatever doors
 *   elsewhere have spent; and the member's email address, at Auth's own door,
 *   is never held by any of it. What an attempt the house could not answer
 *   counted is given back (sign_in_unasked).
 * - The address is only the one the platform vouches for (_shared/callerAddress.js,
 *   IPv6 by its /64); with none, no pace by address at all (never one shared by
 *   every caller), the pail alone. Every answer carries `x-rh-caller-source`
 *   (cf, xff or none: which headers came, never an address), so the first call
 *   after a deploy shows whether the pace by address is on.
 * - Deployed before the house can count (round 14's train not yet run: PostgREST
 *   answers that sign_in_attempt does not exist, PGRST202), the sign-in paces by
 *   the vouched address alone, 20 a minute as before, and signs in as before:
 *   nothing counted, so nothing given back or cleared, and no key handed. Any
 *   other failure to ask the count is still the house's: 503.
 *
 * Supabase Auth counts password sign-ins per address (150 every 5 minutes), and
 * each member is counted at their own: the password is checked with the
 * project's secret key (SUPABASE_SECRET_KEYS, sb_secret_…) and the member's
 * address forwarded (Sb-Forwarded-For): the vouched one, or with none the one
 * the caller wrote first (each honest caller's own, never one shared by all), as
 * Auth asks of a server signing members in, with IP Address Forwarding on
 * (Authentication → Rate Limits). With no secret key, the anon key.
 *
 * Endpoint: POST /functions/v1/sign-in-with-username
 * Body: { username: string, password: string, device?: string }
 * Success: { access_token, refresh_token, device? }  ← client calls supabase.auth.setSession(...)
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ADDRESS, callerAddress, paceKey } from '../_shared/callerAddress.js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

/** The project's default secret key (sb_secret_…), or '' where it has none. */
function secretKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')
    return typeof keys?.default === 'string' && keys.default.startsWith('sb_secret_') ? keys.default : ''
  } catch {
    return ''
  }
}
const SECRET_KEY = secretKey()

// How long the database and Auth may each take: past it, the house could not be asked.
const HOUSE_LIMIT_MS = 10_000
const withinLimit: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(HOUSE_LIMIT_MS) })

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  // So the website can read how long a handle is held, and which address the pace read.
  'Access-Control-Expose-Headers': 'Retry-After, x-rh-caller-source',
}

// One generic message for ALL auth failures — never reveal which part failed.
const GENERIC = { error: 'Invalid username or password.' }
const UNAVAILABLE = { error: 'Sign-in is unavailable right now. Please try again.' }
const TOO_MANY = { error: 'Too many attempts. Please wait a moment and try again.' }

// Best-effort per-address throttle (in-memory ⇒ per edge instance, not global), for a vouched
// address only; the house's count per door and per member is the limit that holds.
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 20 // attempts / address / minute
const _hits = new Map<string, { count: number; resetAt: number }>()
function throttled(key: string): boolean {
  const now = Date.now()
  const e = _hits.get(key)
  if (!e || now > e.resetAt) {
    if (_hits.size > 5000) _hits.clear()
    _hits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  e.count += 1
  return e.count > RATE_MAX
}

/** PostgREST's word for a function it does not have: the house before round 14's train. */
const NOT_BUILT = 'PGRST202'

/** A key a phone was handed: hex, its length; anything else is no key. */
const DEVICE = /^[0-9a-f]{32,128}$/

serve(async (req) => {
  const caller = callerAddress(req.headers)
  // Every answer says which headers the address could be read from (never the address).
  const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'x-rh-caller-source': caller.source, ...extra },
    })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { ...corsHeaders, 'x-rh-caller-source': caller.source } })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // The door: the vouched address, IPv6 by its /64; none, no pace by address (never a shared one).
  const door = paceKey(caller.address)
  if (door && throttled(door)) return json(TOO_MANY, 429)

  let username = ''
  let password = ''
  let device: string | null = null
  try {
    const body = await req.json()
    username = String(body?.username ?? '')
    password = String(body?.password ?? '')
    device = typeof body?.device === 'string' && DEVICE.test(body.device) ? body.device : null
  } catch {
    return json(GENERIC, 401)
  }
  if (!username || !password) return json(GENERIC, 401)

  // Mirror the client's historical normalization so existing handles resolve.
  const lookupUsername = username.trim().toLowerCase().replace(/\s+/g, '_')

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { global: { fetch: withinLimit } })
  // What this attempt counted, given back if the house or Auth could not answer it.
  let counted: { door: boolean; pail: boolean } | null = null
  const unasked = async () => {
    if (!counted || (!counted.door && !counted.pail)) return
    const { error } = await admin.rpc('sign_in_unasked', { p_handle: lookupUsername, p_door: counted.door ? door : null, p_pail: counted.pail })
      .then((r) => r, (e) => ({ error: e }))
    if (error) console.error('[sign-in-with-username] an unanswered attempt was not given back:', error.code ?? error.message ?? 'unknown')
  }

  try {
    // 0) The house counts this attempt, at its door and in the member's shared pail, before
    //    anything is tried; one it holds back is said as that, its password never tried (a right
    //    one too, or the holding would answer which guess was right). A count that could not be
    //    asked is the house's failure: the password is never tried uncounted.
    const { data: rest, error: restError } = await admin.rpc('sign_in_attempt', { p_handle: lookupUsername, p_door: door, p_device: device })
    // A house whose count is not built yet (round 14's train not run: PostgREST has no such
    // function, PGRST202) is the one exception: the door's pace above holds alone, as before.
    const counting = restError?.code !== NOT_BUILT
    if (counting) {
      if (restError || typeof rest?.wait !== 'number') {
        console.error('[sign-in-with-username] the handle\'s count could not be asked:', restError?.code ?? restError?.message ?? typeof rest)
        return json(UNAVAILABLE, 503)
      }
      if (rest.wait > 0) {
        const from = rest.from === 'here' ? 'here' : 'elsewhere'
        const said = from === 'here'
          ? 'Too many wrong passwords from here. Try again later, or sign in with your email address.'
          : 'This handle is being tried from elsewhere, so it is slowed. Try again later, or sign in with your email address.'
        return json({ error: said, paused: 'handle', from, retry_after: rest.wait }, 429, { 'Retry-After': String(rest.wait) })
      }
      counted = { door: rest.door === true, pail: rest.pail === true }
    }

    // 1) Resolve email server-side (service role — the email never leaves here).
    //    A lookup that failed is the house's failure, never "no such handle".
    const { data: email, error: lookupError } = await admin.rpc('get_email_by_username', { lookup_username: lookupUsername })
    if (lookupError) {
      console.error('[sign-in-with-username] the handle could not be looked up:', lookupError.code ?? lookupError.message)
      await unasked()
      return json(UNAVAILABLE, 503)
    }
    // 2) Verify the password at Auth's own door, counted against the member's address.
    //    A handle no one has is asked too, as an address no one can hold (a fresh one
    //    each time, at a domain that cannot exist): Auth refuses it, so a known and an
    //    unknown handle take the same time and the same road, Auth's failures included.
    const known = typeof email === 'string' && email !== ''
    const address = known ? email : `nobody-${crypto.randomUUID()}@handle.invalid`
    const key = SECRET_KEY || ANON_KEY
    const forAuth = caller.address ?? caller.written
    const res = await withinLimit(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        // A legacy key is a JWT the gateway also reads as the bearer; a secret key never is one.
        ...(SECRET_KEY ? {} : { Authorization: `Bearer ${ANON_KEY}` }),
        ...(SECRET_KEY && forAuth && ADDRESS.test(forAuth) ? { 'Sb-Forwarded-For': forAuth } : {}),
      },
      body: JSON.stringify({ email: address, password }),
    })
    if (res.status === 429) {
      await unasked()
      return json(TOO_MANY, 429)
    }
    // Auth's refusal of these credentials (invalid_credentials, an unconfirmed address) is
    // 400: a guess answered, so it stays counted. A 401 is the gateway refusing the
    // function's own key: the house's fault, so 503, given back.
    if (res.status === 400 || res.status === 422) return json(GENERIC, 401)
    if (!res.ok) {
      console.error('[sign-in-with-username] Auth answered', res.status)
      await unasked()
      return json(UNAVAILABLE, 503)
    }
    if (!known) return json(GENERIC, 401)
    const session = await res.json().catch(() => null)
    if (typeof session?.access_token !== 'string' || typeof session?.refresh_token !== 'string') {
      console.error('[sign-in-with-username] Auth answered without a session')
      await unasked()
      return json(UNAVAILABLE, 503)
    }

    // The right password: this door's count goes, the attempt is given back to the pail, and the
    // phone is handed its key. None handed (a failure here, or no count yet), the member is still signed in.
    let kept: unknown = null
    if (counted) {
      const { data, error: clearError } = await admin.rpc('sign_in_cleared', {
        p_handle: lookupUsername, p_door: counted.door ? door : null, p_pail: counted.pail, p_device: device,
      })
      if (clearError) console.error('[sign-in-with-username] the handle\'s count was not cleared:', clearError.code ?? clearError.message)
      kept = data
    }

    // 3) Return ONLY the session tokens, and the phone's key — client adopts them via setSession().
    return json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      ...(typeof kept === 'string' && DEVICE.test(kept) ? { device: kept } : {}),
    }, 200)
  } catch (err) {
    // The database or Auth unreachable, or past its limit: ours, so never "wrong password".
    console.error('[sign-in-with-username] the house could not be asked:', err instanceof Error ? err.name : 'unknown')
    await unasked()
    return json(UNAVAILABLE, 503)
  }
})
