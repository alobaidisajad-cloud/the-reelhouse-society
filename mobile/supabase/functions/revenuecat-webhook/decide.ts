/**
 * decide.ts — what a RevenueCat event means, as a pure function.
 * ──────────────────────────────────────────────────────────────
 * Deliberately separated from index.ts so the DECISIONS can be exercised by the
 * normal Jest suite. The HTTP wrapper around it is thin and boring; everything
 * subtle lives here, where it is tested on every commit.
 *
 * No imports, no Deno globals, no I/O — so it runs anywhere.
 */

export type WebhookAction =
  | { kind: 'grant'; tier: 'archivist' | 'auteur' | 'founding'; reason: string }
  | { kind: 'end'; reason: string }
  | { kind: 'ignore'; reason: string };

/** Highest entitlement wins, mirroring parseEntitlements in src/lib/revenueCat.ts. */
const TIER_PRIORITY = ['founding', 'auteur', 'archivist'] as const;

/**
 * Events that GRANT or KEEP a tier.
 *
 * ⚠️ PRODUCT_CHANGE IS DELIBERATELY ABSENT. RevenueCat fires it when a member
 * SCHEDULES a plan change, and for a downgrade the change does not take effect until
 * the next renewal date. Acting on it immediately would drop an Auteur to Archivist
 * the moment they picked the cheaper plan — while they are still paid up for the
 * current period. The following RENEWAL carries the product that actually applies, and
 * an immediate UPGRADE is already synced by the app at purchase time
 * (purchasePackage -> syncEntitlementToSupabase), so nothing is lost by waiting.
 */
const GRANTING_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',   // the Founding lifetime seat
]);

/**
 * Events that MIGHT end access — decided by the timestamp, never by the name.
 *
 * ⚠️ The naive reading is "CANCELLATION ends it". That is wrong twice over:
 *
 *   • A normal unsubscribe fires CANCELLATION while the member has PAID THROUGH the
 *     end of the period. Acting on it strips a paying member days or weeks early.
 *   • A REFUND also fires CANCELLATION — and there access really has ended, right now.
 *     Blanket-ignoring it would let a refunded annual subscriber keep a paid rank for
 *     up to a year.
 *
 * The timestamp separates them cleanly: access has ended when the event's own
 * expiry is at or before now. One rule, both cases correct.
 */
const MAYBE_ENDING_EVENTS = new Set(['EXPIRATION', 'CANCELLATION']);

/** Acknowledged and intentionally ignored — never an error, never a retry. */
const IGNORED_EVENTS = new Set([
  'PRODUCT_CHANGE',      // takes effect at renewal; see GRANTING_EVENTS above
  'BILLING_ISSUE',       // opens a grace period; EXPIRATION follows if it truly ends
  'SUBSCRIPTION_PAUSED', // same — EXPIRATION follows when access actually stops
  'SUBSCRIBER_ALIAS',    // identity bookkeeping
  'TRANSFER',            // purchases moved between accounts; needs its own design
  'TEST',                // the dashboard's "send test event" button
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAccountId(appUserId: unknown): boolean {
  return typeof appUserId === 'string' && UUID_RE.test(appUserId);
}

export function tierFromEvent(event: any): 'archivist' | 'auteur' | 'founding' | null {
  const ids: unknown[] = Array.isArray(event?.entitlement_ids)
    ? event.entitlement_ids
    : (event?.entitlement_id ? [event.entitlement_id] : []);
  const lowered = ids.map((s) => String(s).toLowerCase());
  for (const t of TIER_PRIORITY) {
    if (lowered.includes(t)) return t;
  }
  // Fall back to the product id ("auteur_annual", "founding_lifetime") for the same
  // reason selectPackageForTier matches on it: entitlement ids are dashboard
  // configuration and may simply not be set on a product.
  const productId = String(event?.product_id ?? '').toLowerCase();
  for (const t of TIER_PRIORITY) {
    if (productId.startsWith(t)) return t;
  }
  return null;
}

/**
 * Has access actually ended?
 *
 * The default differs by event, and the asymmetry is the point:
 *   • EXPIRATION with no usable timestamp — the event's whole meaning is "it ended",
 *     so absent evidence to the contrary, it ended.
 *   • CANCELLATION with no usable timestamp — the event's meaning is "auto-renew is
 *     off", which is NOT an ending, so absent proof it ended, it has not.
 * In both cases the safe default is the one that does not strip a paying member.
 */
function hasAccessEnded(type: string, event: any, now: number): boolean {
  const raw = Number(event?.expiration_at_ms);
  const known = Number.isFinite(raw) && raw > 0;
  if (type === 'EXPIRATION') return !known || raw <= now;
  return known && raw <= now;   // CANCELLATION: only a refund/immediate revocation
}

/**
 * Decide what to do with an event. `now` is injected so the timing rules are
 * testable rather than dependent on the wall clock.
 */
export function decide(event: any, now: number = Date.now()): WebhookAction {
  const type = String(event?.type ?? '').toUpperCase();

  if (!type) return { kind: 'ignore', reason: 'no event type' };
  if (IGNORED_EVENTS.has(type)) return { kind: 'ignore', reason: `${type} carries no entitlement change` };

  const maybeEnding = MAYBE_ENDING_EVENTS.has(type);
  if (!GRANTING_EVENTS.has(type) && !maybeEnding) {
    // An event type RevenueCat added after this was written. Acknowledge rather than
    // retry forever, but the caller logs it loudly — it may need a decision.
    return { kind: 'ignore', reason: `unhandled event type ${type}` };
  }

  // Identity is checked before anything else that could act on the account.
  if (!isAccountId(event?.app_user_id)) {
    return { kind: 'ignore', reason: 'app_user_id is not a ReelHouse account id' };
  }

  if (maybeEnding) {
    if (!hasAccessEnded(type, event, now)) {
      return {
        kind: 'ignore',
        reason: type === 'CANCELLATION'
          ? 'auto-renew switched off but the member is still paid up'
          // ⚠️ RevenueCat does not guarantee ordering: an EXPIRATION for an old
          // subscription can arrive AFTER the renewal that replaced it. An expiry in
          // the future means this has been overtaken by events.
          : 'expiry is in the future — stale, overtaken by a renewal',
      };
    }
    return { kind: 'end', reason: `${type} — access has ended` };
  }

  const tier = tierFromEvent(event);
  if (!tier) return { kind: 'ignore', reason: `${type} carried no recognisable tier` };
  return { kind: 'grant', tier, reason: `${type} -> ${tier}` };
}
