/**
 * revenuecat-webhook — retire a subscription when it actually ends, without the
 * member having to open the app.
 *
 * DEPLOY WITH --no-verify-jwt: RevenueCat has no Supabase login, and the gateway
 * would answer 401 before this ran. REQUIRES REVENUECAT_WEBHOOK_SECRET, matching the
 * webhook's Authorization header in the RevenueCat dashboard; unset, all is refused.
 * This file is transport only; every decision is decide.ts's, tested with the suite.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { decide } from "./decide.ts"

const WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? ''

const ok = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  // ── Authentication: fail closed (a plain comparison, not a constant-time one) ──
  const auth = req.headers.get('Authorization') ?? ''
  if (!WEBHOOK_SECRET || auth.length !== WEBHOOK_SECRET.length || auth !== WEBHOOK_SECRET) {
    console.error('[revenuecat-webhook] rejected: missing or invalid Authorization header')
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  let payload: any
  try {
    payload = await req.json()
  } catch {
    // A malformed body will never become valid — 200 so RevenueCat stops retrying it.
    console.error('[revenuecat-webhook] unparseable body')
    return ok({ ignored: 'unparseable' })
  }

  const event = payload?.event ?? {}
  const action = decide(event)

  if (action.kind === 'ignore') {
    console.log(`[revenuecat-webhook] ignored: ${action.reason}`)
    return ok({ ignored: action.reason })
  }

  const tier = action.kind === 'grant' ? action.tier : 'cinephile'
  const appUserId = String(event.app_user_id)

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // p_source MUST be 'revenuecat': grant_entitlement lowers only a tier this provider granted,
  // and never takes a founding seat below auteur, so a web or hand-granted rank survives.
  const { data, error } = await adminClient
    .rpc('grant_entitlement', { p_user_id: appUserId, p_tier: tier, p_source: 'revenuecat' })

  if (error) {
    // No such profile (P0002): a retry can never succeed, and RevenueCat retries every
    // non-2xx, so it is acknowledged, loudly.
    if ((error as any)?.code === 'P0002' || /no profile with id/i.test(String((error as any)?.message ?? ''))) {
      console.warn(`[revenuecat-webhook] no profile for ${appUserId} — acknowledged, not retried`)
      return ok({ ignored: 'no_such_profile' })
    }
    // A valid event not recorded: 500, so RevenueCat retries.
    console.error(`[revenuecat-webhook] grant_entitlement failed for ${appUserId}:`, error)
    return new Response(JSON.stringify({ error: 'Failed to apply entitlement' }), { status: 500 })
  }

  const applied = Array.isArray(data) ? data[0] : data
  console.log(`[revenuecat-webhook] ${action.reason} for ${appUserId}: ${applied?.out_reason ?? 'applied'}`)
  return ok({
    action: action.kind,
    tier,
    applied: applied?.out_applied !== false,
    reason: applied?.out_reason ?? null,
  })
})
