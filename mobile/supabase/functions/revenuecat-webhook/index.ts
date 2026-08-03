import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/**
 * revenuecat-webhook — retire a subscription when it actually ends.
 * ─────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * Before this function there was NO RevenueCat webhook at all. The only thing that
 * ever downgraded a lapsed subscription was the app's own sync, which runs when the
 * member opens the app and taps Restore Purchases. So someone who cancelled and
 * simply never opened the app again kept their paid rank indefinitely.
 *
 * ⚠️ DEPLOY WITH --no-verify-jwt. RevenueCat is a server calling a server; it has no
 * Supabase login token, so the platform gateway would reject it with 401 before this
 * code ran. Authentication is the shared secret checked below — the same mistake that
 * left paytabs-handler unreachable.
 *
 * ⚠️ REQUIRES the secret REVENUECAT_WEBHOOK_SECRET, matching the Authorization header
 * configured on the webhook in the RevenueCat dashboard. If it is unset this function
 * rejects EVERYTHING (fail closed) rather than trusting anonymous callers.
 */

const WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? ''

/** Highest entitlement wins, mirroring parseEntitlements in src/lib/revenueCat.ts. */
const TIER_PRIORITY = ['founding', 'auteur', 'archivist'] as const

/**
 * Events that GRANT or KEEP a tier.
 *
 * ⚠️ CANCELLATION IS DELIBERATELY ABSENT, and it is the single easiest thing to get
 * wrong here. In RevenueCat, CANCELLATION means "auto-renew was switched off" — the
 * member has PAID THROUGH the end of the current period and still has access. Acting
 * on it would strip a paying member the moment they clicked cancel, days or weeks of
 * access early. EXPIRATION is the event that means access has actually ended.
 *
 * BILLING_ISSUE is absent for the same reason: it opens a grace period, it is not an
 * ending. If it turns into one, EXPIRATION follows.
 */
const GRANTING_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'NON_RENEWING_PURCHASE',   // the Founding lifetime seat
])

/** The only event that ends access. */
const ENDING_EVENTS = new Set(['EXPIRATION'])

/** Acknowledged and intentionally ignored — never an error, never a retry. */
const IGNORED_EVENTS = new Set([
  'CANCELLATION',        // still paid up; EXPIRATION will follow if it truly ends
  'BILLING_ISSUE',       // grace period
  'SUBSCRIBER_ALIAS',    // identity bookkeeping
  'TRANSFER',            // purchases moved between accounts
  'SUBSCRIPTION_PAUSED',
  'TEST',                // the dashboard's "send test event" button
])

function tierFromEvent(event: any): string | null {
  const ids: string[] = Array.isArray(event?.entitlement_ids) ? event.entitlement_ids
    : (event?.entitlement_id ? [event.entitlement_id] : [])
  const lowered = ids.map((s) => String(s).toLowerCase())
  for (const t of TIER_PRIORITY) {
    if (lowered.includes(t)) return t
  }
  // Fall back to the product id (e.g. "auteur_annual", "founding_lifetime") for the
  // same reason selectPackageForTier matches on it: entitlement ids are dashboard
  // configuration and may not be set on every product.
  const productId = String(event?.product_id ?? '').toLowerCase()
  for (const t of TIER_PRIORITY) {
    if (productId.startsWith(t)) return t
  }
  return null
}

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
    // Malformed body will never become valid — 200 so RevenueCat stops retrying it.
    console.error('[revenuecat-webhook] unparseable body')
    return ok({ ignored: 'unparseable' })
  }

  const event = payload?.event ?? {}
  const type = String(event?.type ?? '').toUpperCase()

  if (IGNORED_EVENTS.has(type)) {
    console.log(`[revenuecat-webhook] ${type} acknowledged, no entitlement change`)
    return ok({ ignored: type })
  }

  const isGrant = GRANTING_EVENTS.has(type)
  const isEnd = ENDING_EVENTS.has(type)
  if (!isGrant && !isEnd) {
    // An event type RevenueCat added after this was written. Acknowledge rather than
    // retry forever, but say so loudly — an unhandled type may need a decision.
    console.warn(`[revenuecat-webhook] unhandled event type ${type} — acknowledged, no action`)
    return ok({ ignored: type })
  }

  // ── Which account ────────────────────────────────────────────────────────────
  // app_user_id is the Supabase user id: the app configures RevenueCat with it
  // (initRevenueCat) and re-links it on every sign-in (identifyUser in stores/auth.ts).
  // An anonymous id means the purchase was made before the account was linked; there is
  // no member to act on, so acknowledge and move on rather than retrying forever.
  const appUserId = String(event?.app_user_id ?? '')
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(appUserId)
  if (!isUuid) {
    console.warn(`[revenuecat-webhook] ${type} for non-account id "${appUserId}" — ignored`)
    return ok({ ignored: 'anonymous_app_user_id' })
  }

  let tier: string
  if (isGrant) {
    const resolved = tierFromEvent(event)
    if (!resolved) {
      console.error(`[revenuecat-webhook] ${type} carried no recognisable tier`, event?.entitlement_ids, event?.product_id)
      return ok({ ignored: 'unrecognised_tier' })
    }
    tier = resolved
  } else {
    // ⚠️ Guard against a STALE expiration. RevenueCat does not guarantee ordering, so
    // an EXPIRATION for an old subscription can arrive AFTER the renewal that replaced
    // it. Acting on that would demote a member who is currently paying. If the event's
    // own expiry is still in the future, this has been overtaken by events.
    const expiresAt = Number(event?.expiration_at_ms ?? 0)
    if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
      console.warn(`[revenuecat-webhook] EXPIRATION for ${appUserId} expires in the FUTURE (${expiresAt}) — stale, ignored`)
      return ok({ ignored: 'stale_expiration' })
    }
    tier = 'cinephile'
  }

  // ── Apply ────────────────────────────────────────────────────────────────────
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // p_source MUST be 'revenuecat'. grant_entitlement refuses to LOWER a tier granted
  // by another provider, so this can retire an App Store subscription it sold and can
  // never wipe a purchase made on the website or granted by hand
  // (20260803_01_entitlement_source.sql).
  const { data, error } = await adminClient
    .rpc('grant_entitlement', { p_user_id: appUserId, p_tier: tier, p_source: 'revenuecat' })

  if (error) {
    // A real failure: 500 so RevenueCat retries. This is the one case where retrying
    // is right — the event was valid and we simply could not record it.
    console.error(`[revenuecat-webhook] grant_entitlement failed for ${appUserId}:`, error)
    return new Response(JSON.stringify({ error: 'Failed to apply entitlement' }), { status: 500 })
  }

  const applied = Array.isArray(data) ? data[0] : data
  console.log(`[revenuecat-webhook] ${type} -> ${tier} for ${appUserId}: ${applied?.out_reason ?? 'applied'}`)
  return ok({ type, tier, applied: applied?.out_applied !== false, reason: applied?.out_reason ?? null })
})
