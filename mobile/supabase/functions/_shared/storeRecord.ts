/**
 * storeRecord.ts — apply what RevenueCat says a member holds. The one home.
 * ──────────────────────────────────────────────────────────────────────────
 * Both doors use it: sync-entitlement (the member, after a purchase or a
 * restore) and revenuecat-webhook (the store, whenever anything changes). Each
 * reads the member's WHOLE record from RevenueCat, server to server, and grants
 * the highest rank still in force. Never an event's own product: a member with
 * two subscriptions whose lesser one ends keeps the greater, a retried or
 * late event cannot undo a newer one, and a transfer re-reads both accounts.
 *
 * No imports, no Deno globals: the Supabase client is handed in and `fetch` is
 * the platform's, so the Jest suite runs this file as it is.
 */

export type StoreTier = 'founding' | 'auteur' | 'archivist' | 'cinephile';

/** Highest first. 'cinephile' is the rank of a member the store holds nothing for. */
const TIERS = ['founding', 'auteur', 'archivist'] as const;

/**
 * Is one entitlement in force now? No end at all is a lifetime seat. Otherwise
 * its end, or the billing grace the store gives after a failed renewal (the
 * member keeps access while the card is retried), must still be ahead.
 */
export function inForce(entitlement: unknown, now: number): boolean {
  if (!entitlement || typeof entitlement !== 'object') return false;
  const e = entitlement as { expires_date?: unknown; grace_period_expires_date?: unknown };
  if (e.expires_date === null) return true;
  return [e.expires_date, e.grace_period_expires_date]
    .map((d) => (typeof d === 'string' ? Date.parse(d) : NaN))
    .some((t) => Number.isFinite(t) && t > now);
}

/**
 * The highest rank a RevenueCat subscriber record holds now. An entitlement
 * names its rank by its id ("auteur"), or, where the dashboard named it
 * otherwise, by its product ("auteur_annual"). Both without case.
 */
export function tierFromRecord(subscriber: unknown, now: number): StoreTier {
  const raw = (subscriber as { entitlements?: unknown } | null)?.entitlements;
  const ranks = new Set<string>();
  if (raw && typeof raw === 'object') {
    for (const [id, e] of Object.entries(raw as Record<string, unknown>)) {
      if (!inForce(e, now)) continue;
      const product = String((e as { product_identifier?: unknown }).product_identifier ?? '').toLowerCase();
      const rank = TIERS.find((t) => t === id.toLowerCase()) ?? TIERS.find((t) => product.startsWith(t));
      if (rank) ranks.add(rank);
    }
  }
  return TIERS.find((t) => ranks.has(t)) ?? 'cinephile';
}

export type Applied =
  | { ok: true; storeTier: StoreTier; tier: string | null; seatClaimed: boolean; changed: boolean }
  | { ok: false; status: number; error: string };

/**
 * Read the member's record and grant it, source 'revenuecat'. A failure to read
 * the store is never "holds nothing" (502, so the caller retries); a member with
 * no record at all (404) has bought nothing. The founding seat is claimed before
 * the rank: the cap is atomic, and a full house still grants the Auteur.
 */
export async function applyStoreRecord(
  // deno-lint-ignore no-explicit-any
  admin: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> },
  userId: string,
  storeKey: string,
  now: number = Date.now(),
): Promise<Applied> {
  let subscriber: unknown = { entitlements: {} };
  let res: Response;
  try {
    res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${storeKey}`, Accept: 'application/json' },
    });
  } catch {
    return { ok: false, status: 502, error: 'could not reach the store' };
  }
  if (res.ok) {
    try {
      subscriber = (await res.json())?.subscriber ?? { entitlements: {} };
    } catch {
      return { ok: false, status: 502, error: 'the store answered something unreadable' };
    }
  } else if (res.status !== 404) {
    return { ok: false, status: 502, error: `the store answered ${res.status}` };
  }

  const storeTier = tierFromRecord(subscriber, now);

  let seatClaimed = true;
  if (storeTier === 'founding') {
    const { data, error } = await admin.rpc('claim_founding_seat', { p_user_id: userId });
    if (error) return { ok: false, status: 500, error: 'could not claim the founding seat' };
    seatClaimed = data === true;
  }

  const { data, error } = await admin.rpc('grant_entitlement', { p_user_id: userId, p_tier: storeTier, p_source: 'revenuecat' });
  if (error) {
    if (error.code === 'P0002') return { ok: false, status: 404, error: 'no such member' };
    return { ok: false, status: 500, error: 'could not record the rank' };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, storeTier, tier: row?.out_tier ?? null, seatClaimed, changed: row?.out_applied === true };
}
