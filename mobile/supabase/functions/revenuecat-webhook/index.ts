/**
 * revenuecat-webhook — the store tells the house something changed.
 *
 * DEPLOY WITH --no-verify-jwt: RevenueCat has no Supabase login, and the gateway
 * would answer 401 before this ran. REQUIRES REVENUECAT_WEBHOOK_SECRET, matching the
 * webhook's Authorization header in the RevenueCat dashboard (unset, all is
 * refused), and REVENUECAT_SECRET_KEY, to read the member's record.
 *
 * Each account the event names (decide.ts) is read again from RevenueCat and
 * granted what it holds (../_shared/storeRecord.ts, the same routine the app's
 * sync-entitlement uses). A failure to read or record is 500, so RevenueCat
 * retries; reading again is always safe.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { accountsIn, authorized } from "./decide.ts"
import { applyStoreRecord } from "../_shared/storeRecord.ts"

const WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? ''

const ok = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  // ── Authentication: fail closed, compared in constant time (decide.ts) ──
  if (!authorized(req.headers.get('Authorization') ?? '', WEBHOOK_SECRET)) {
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
  const accounts = accountsIn(event)
  if (!accounts.length) {
    console.log(`[revenuecat-webhook] ${event?.type ?? 'no type'}: names no ReelHouse account`)
    return ok({ ignored: 'no account' })
  }

  const storeKey = Deno.env.get('REVENUECAT_SECRET_KEY') ?? ''
  if (!storeKey) {
    console.error('[revenuecat-webhook] REVENUECAT_SECRET_KEY is not set')
    return new Response(JSON.stringify({ error: 'The store is not configured' }), { status: 500 })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const results: Record<string, unknown>[] = []
  for (const id of accounts) {
    const applied = await applyStoreRecord(admin, id, storeKey)
    if (!applied.ok && applied.status === 404) {
      // No such member: no retry can make one, so it is acknowledged, loudly.
      console.warn(`[revenuecat-webhook] ${event.type}: no member ${id} — acknowledged`)
      results.push({ id, ignored: 'no such member' })
      continue
    }
    if (!applied.ok) {
      console.error(`[revenuecat-webhook] ${event.type}: ${id}: ${applied.error}`)
      return new Response(JSON.stringify({ error: applied.error }), { status: 500 })
    }
    console.log(`[revenuecat-webhook] ${event.type}: ${id} holds ${applied.storeTier}; in force ${applied.tier}${applied.changed ? ' (changed)' : ''}`)
    results.push({ id, storeTier: applied.storeTier, tier: applied.tier, changed: applied.changed })
  }
  return ok({ type: event.type ?? null, results })
})
