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
 * - 429 when the caller is asking too fast, here or at Supabase Auth.
 * - 503 when the house could not be asked (the database, Auth, a time limit):
 *   never "wrong password" for a failure that is ours. Both apps and build 41
 *   say "unavailable" for it.
 * - Best-effort per-IP throttle to blunt brute-force / enumeration at scale.
 *
 * Supabase Auth counts password sign-ins per address (150 every 5 minutes), and
 * each member is counted at their own: the password is checked with the
 * project's secret key (SUPABASE_SECRET_KEYS, sb_secret_…) and the member's
 * address forwarded (Sb-Forwarded-For), as Auth asks of a server signing members
 * in, with IP Address Forwarding on (Authentication → Rate Limits). With no
 * secret key, the anon key.
 *
 * Endpoint: POST /functions/v1/sign-in-with-username
 * Body: { username: string, password: string }
 * Success: { access_token, refresh_token }  ← client calls supabase.auth.setSession(...)
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

/** The caller's address, as the platform's proxy wrote it: only an address's characters pass. */
const ADDRESS = /^[0-9a-fA-F:.]{2,45}$/

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// One generic message for ALL auth failures — never reveal which part failed.
const GENERIC = { error: 'Invalid username or password.' }
const UNAVAILABLE = { error: 'Sign-in is unavailable right now. Please try again.' }
const TOO_MANY = { error: 'Too many attempts. Please wait a moment and try again.' }

// Best-effort per-IP throttle (in-memory ⇒ per edge instance, not global).
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 20 // attempts / IP / minute
const _hits = new Map<string, { count: number; resetAt: number }>()
function throttled(ip: string): boolean {
  const now = Date.now()
  const e = _hits.get(ip)
  if (!e || now > e.resetAt) {
    if (_hits.size > 5000) _hits.clear()
    _hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  e.count += 1
  return e.count > RATE_MAX
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
  if (throttled(ip)) return json(TOO_MANY, 429)

  let username = ''
  let password = ''
  try {
    const body = await req.json()
    username = String(body?.username ?? '')
    password = String(body?.password ?? '')
  } catch {
    return json(GENERIC, 401)
  }
  if (!username || !password) return json(GENERIC, 401)

  // Mirror the client's historical normalization so existing handles resolve.
  const lookupUsername = username.trim().toLowerCase().replace(/\s+/g, '_')

  try {
    // 1) Resolve email server-side (service role — the email never leaves here).
    //    A lookup that failed is the house's failure, never "no such handle".
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { global: { fetch: withinLimit } })
    const { data: email, error: lookupError } = await admin.rpc('get_email_by_username', { lookup_username: lookupUsername })
    if (lookupError) {
      console.error('[sign-in-with-username] the handle could not be looked up:', lookupError.code ?? lookupError.message)
      return json(UNAVAILABLE, 503)
    }
    if (!email) return json(GENERIC, 401)

    // 2) Verify the password at Auth's own door, counted against the member's address.
    const key = SECRET_KEY || ANON_KEY
    const res = await withinLimit(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        // A legacy key is a JWT the gateway also reads as the bearer; a secret key never is one.
        ...(SECRET_KEY ? {} : { Authorization: `Bearer ${ANON_KEY}` }),
        ...(SECRET_KEY && ADDRESS.test(ip) ? { 'Sb-Forwarded-For': ip } : {}),
      },
      body: JSON.stringify({ email: String(email), password }),
    })
    if (res.status === 429) return json(TOO_MANY, 429)
    // Auth's refusal of these credentials (invalid_credentials, an unconfirmed address) is
    // 400. A 401 is the gateway refusing the function's own key: the house's fault, so 503.
    if (res.status === 400 || res.status === 422) return json(GENERIC, 401)
    if (!res.ok) {
      console.error('[sign-in-with-username] Auth answered', res.status)
      return json(UNAVAILABLE, 503)
    }
    const session = await res.json().catch(() => null)
    if (typeof session?.access_token !== 'string' || typeof session?.refresh_token !== 'string') {
      console.error('[sign-in-with-username] Auth answered without a session')
      return json(UNAVAILABLE, 503)
    }

    // 3) Return ONLY the session tokens — client adopts them via setSession().
    return json({ access_token: session.access_token, refresh_token: session.refresh_token }, 200)
  } catch (err) {
    // The database or Auth unreachable, or past its limit: ours, so never "wrong password".
    console.error('[sign-in-with-username] the house could not be asked:', err instanceof Error ? err.name : 'unknown')
    return json(UNAVAILABLE, 503)
  }
})
