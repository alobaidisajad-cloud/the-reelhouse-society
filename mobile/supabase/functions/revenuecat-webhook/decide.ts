/**
 * decide.ts — whom a RevenueCat event concerns, and whether it is the store's.
 * ──────────────────────────────────────────────────────────────────────────
 * An event is a nudge, not an instruction: what a member holds is read from
 * their whole record (../_shared/storeRecord.ts), never from the event's own
 * product. So the only question here is which accounts to read again — the
 * member it names, and for a TRANSFER both sides — and order, retries and a
 * second subscription cannot mislead it.
 *
 * No imports, no Deno globals, no I/O — the Jest suite runs it as it is.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A ReelHouse account id (RevenueCat's own anonymous ids are not). */
export function isAccountId(appUserId: unknown): boolean {
  return typeof appUserId === 'string' && UUID_RE.test(appUserId);
}

/**
 * The accounts whose record this event may have changed, each once. The
 * dashboard's TEST event concerns nobody; any other type, known or new, has
 * every account it names read again — reading is always safe.
 */
export function accountsIn(event: unknown): string[] {
  const e = (event ?? {}) as Record<string, unknown>;
  if (String(e.type ?? '').toUpperCase() === 'TEST') return [];
  const named = [
    e.app_user_id,
    ...(Array.isArray(e.transferred_from) ? e.transferred_from : []),
    ...(Array.isArray(e.transferred_to) ? e.transferred_to : []),
  ];
  return [...new Set(named.filter(isAccountId).map((id) => String(id).toLowerCase()))];
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
