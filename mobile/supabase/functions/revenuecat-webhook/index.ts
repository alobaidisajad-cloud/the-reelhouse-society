import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { decide } from "./decide.ts"

/**
 * revenuecat-webhook — retire a subscription when it actually ends.
 * ─────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * Before this there was NO RevenueCat webhook. The only thing that ever downgraded a
 * lapsed subscription was the app's own sync, which runs when the member opens the app.
 * Someone who cancelled and never opened it again kept their paid rank indefinitely.
 *
 * ⚠️ DEPLOY WITH --no-verify-jwt. RevenueCat is a server calling a server; it has no
 * Supabase login token, so the platform gateway would reject it with 401 before this
 * code ran — the same mistake that left paytabs-handler unreachable.
 *
 * ⚠️ REQUIRES the secret REVENUECAT_WEBHOOK_SECRET, matching the Authorization header
 * configured on the webhook in the RevenueCat dashboard. Unset ⇒ everything is
 * rejected (fail closed) rather than trusting anonymous callers.
 *
 * ── WHY THE THINKING LIVES IN decide.ts ─────────────────────────────────────────
 * Everything subtle about RevenueCat's event semantics is a PURE function next door,
 * exercised by the normal Jest suite on every commit. This file is only transport:
 * authenticate, decide, apply, answer. There is nothing here to reason about that a
 * test cannot already see.
 */

const WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? ''

const ok = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  // ── Authentication: fail closed ──────────────────────────────────────────────
  // Length-checked before comparing so a wrong-length token cannot leak timing.
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

  // p_source MUST be 'revenuecat'. grant_entitlement refuses to LOWER a tier granted
  // by another provider, and refuses to take ANY member below auteur while they hold a
  // founding seat — so this can retire an App Store subscription it sold and can never
  // wipe a website purchase, a hand-granted rank, or a lifetime seat.
  // (20260803_01_entitlement_source.sql, 20260803_02_founding_seat_is_permanent.sql)
  const { data, error } = await adminClient
    .rpc('grant_entitlement', { p_user_id: appUserId, p_tier: tier, p_source: 'revenuecat' })

  if (error) {
    // ⚠️ P0002 = no profile with that id. The account was deleted, or never existed.
    // Retrying can NEVER make that succeed, and RevenueCat retries every non-2xx —
    // so returning 500 here would queue a permanent redelivery loop for every deleted
    // account. Acknowledge it instead, loudly.
    if ((error as any)?.code === 'P0002' || /no profile with id/i.test(String((error as any)?.message ?? ''))) {
      console.warn(`[revenuecat-webhook] no profile for ${appUserId} — acknowledged, not retried`)
      return ok({ ignored: 'no_such_profile' })
    }
    // A real failure: 500 so RevenueCat retries. This is the one case where retrying
    // is right — the event was valid and we simply could not record it.
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
