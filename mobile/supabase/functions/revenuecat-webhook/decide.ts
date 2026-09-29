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

// Events that GRANT or KEEP a tier. Not PRODUCT_CHANGE: it fires when a change is
// SCHEDULED, and a downgrade applies only at renewal (which carries it); an upgrade is
// synced by the app at purchase (purchasePackage -> syncEntitlementToSupabase).
const GRANTING_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',   // the Founding lifetime seat
]);

/** May end access, by its own expiry: an unsubscribe and a refund both fire CANCELLATION. */
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
  // Else the product id ("auteur_annual"): entitlement ids are dashboard config, maybe unset.
  const productId = String(event?.product_id ?? '').toLowerCase();
  for (const t of TIER_PRIORITY) {
    if (productId.startsWith(t)) return t;
  }
  return null;
}

/**
 * Has access ended? Without a usable expiry each event keeps its own meaning:
 * EXPIRATION ended; CANCELLATION (auto-renew off) did not.
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
    // An unknown type: acknowledged (never retried forever), and logged loudly by the caller.
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
          // Unordered delivery: an old EXPIRATION can arrive after the renewal.
          : 'expiry is in the future — stale, overtaken by a renewal',
      };
    }
    return { kind: 'end', reason: `${type} — access has ended` };
  }

  const tier = tierFromEvent(event);
  if (!tier) return { kind: 'ignore', reason: `${type} carried no recognisable tier` };
  return { kind: 'grant', tier, reason: `${type} -> ${tier}` };
}

/**
 * Is this the webhook's secret? In constant time: a comparison that stops at the
 * first wrong character answers sooner for a guess that starts right, and so
 * tells whoever is guessing how much of it is. Every byte is compared, whatever
 * they hold. No secret configured refuses everything (fail closed).
 */
export function authorized(presented: string, secret: string): boolean {
  if (!secret) return false;
  const a = new TextEncoder().encode(presented);
  const b = new TextEncoder().encode(secret);
  if (a.length !== b.length) return false;   // the length is not the secret
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
