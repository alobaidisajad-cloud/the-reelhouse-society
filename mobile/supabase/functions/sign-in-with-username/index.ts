/**
 * ReelHouse — Sign In With Username (BACKEND-EMAIL-ENUM-1)
 * ────────────────────────────────────────────────────────
 * Authenticates a user by USERNAME without ever exposing their email to the
 * client. The old flow had the client call `get_email_by_username` (which
 * returned the email and confirmed account existence) and then sign in — a
 * user-enumeration vector. This function does the lookup + sign-in entirely
 * server-side and returns ONLY session tokens.
 *
 * - Generic error for every failure path (no username / wrong password / no
 *   such user) so callers can't distinguish "account exists" from "doesn't".
 * - Best-effort per-IP throttle to blunt brute-force / enumeration at scale.
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// One generic message for ALL auth failures — never reveal which part failed.
const GENERIC = { error: 'Invalid username or password.' }

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
  if (throttled(ip)) return json({ error: 'Too many attempts. Please wait a moment and try again.' }, 429)

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
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data: email } = await admin.rpc('get_email_by_username', { lookup_username: lookupUsername })
    if (!email) return json(GENERIC, 401)

    // 2) Verify the password by actually signing in (anon client).
    const anon = createClient(SUPABASE_URL, ANON_KEY)
    const { data, error } = await anon.auth.signInWithPassword({ email: String(email), password })
    if (error || !data.session) return json(GENERIC, 401)

    // 3) Return ONLY the session tokens — client adopts them via setSession().
    return json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    }, 200)
  } catch (_err) {
    // Any unexpected server error is still surfaced generically to the caller.
    return json(GENERIC, 401)
  }
})
