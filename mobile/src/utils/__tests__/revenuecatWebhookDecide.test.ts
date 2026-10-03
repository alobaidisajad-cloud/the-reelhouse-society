/**
 * revenuecatWebhookDecide.test.ts
 * ───────────────────────────────
 * The store's two doors, exercised here because neither can run here (no Deno,
 * no RevenueCat): whom a webhook event concerns (decide.ts), and what a
 * member's record grants (_shared/storeRecord.ts, used by the webhook and by
 * sync-entitlement alike).
 *
 * The rank is read from the member's WHOLE record, never from the event: the
 * cases below that cost money when an event is read on its own — a refund, a
 * second subscription, a late or retried event, a transfer — are each a
 * record, and the record answers them.
 */
import { accountsIn, authorized, isAccountId } from '../../../supabase/functions/revenuecat-webhook/decide';
import { applyStoreRecord, inForce, tierFromRecord } from '../../../supabase/functions/_shared/storeRecord';

const UID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-10-03T12:00:00Z');
const AHEAD = '2026-11-03T12:00:00Z';
const PAST = '2026-09-03T12:00:00Z';

describe('whom an event concerns', () => {
  it('the member it names, for any event, known or invented later', () => {
    for (const type of ['INITIAL_PURCHASE', 'RENEWAL', 'CANCELLATION', 'EXPIRATION', 'PRODUCT_CHANGE', 'BILLING_ISSUE', 'SOME_FUTURE_EVENT']) {
      expect(accountsIn({ type, app_user_id: UID })).toEqual([UID]);
    }
  });

  it('both sides of a transfer, each once', () => {
    expect(accountsIn({ type: 'TRANSFER', transferred_from: [UID, '$RCAnonymousID:x'], transferred_to: [OTHER, UID] }))
      .toEqual([UID, OTHER]);
  });

  it('nobody for the dashboard test, an anonymous id, or no id', () => {
    expect(accountsIn({ type: 'TEST', app_user_id: UID })).toEqual([]);
    expect(accountsIn({ type: 'RENEWAL', app_user_id: '$RCAnonymousID:abc123' })).toEqual([]);
    expect(accountsIn({ type: 'RENEWAL' })).toEqual([]);
    expect(accountsIn(null)).toEqual([]);
  });

  it('knows a ReelHouse account id', () => {
    expect(isAccountId(UID)).toBe(true);
    expect(isAccountId('$RCAnonymousID:abc')).toBe(false);
    expect(isAccountId(undefined)).toBe(false);
    expect(isAccountId(12345)).toBe(false);
  });
});

describe('what a record grants', () => {
  const ent = (o: Record<string, unknown>) => ({ product_identifier: 'x', ...o });

  it('an entitlement with an end ahead, or none at all (the lifetime seat), is in force', () => {
    expect(inForce(ent({ expires_date: AHEAD }), NOW)).toBe(true);
    expect(inForce(ent({ expires_date: null }), NOW)).toBe(true);
    expect(inForce(ent({ expires_date: PAST }), NOW)).toBe(false);
    expect(inForce(ent({}), NOW)).toBe(false);
    expect(inForce(null, NOW)).toBe(false);
  });

  it('a failed renewal in its billing grace is still in force; after the grace it is not', () => {
    expect(inForce(ent({ expires_date: PAST, grace_period_expires_date: AHEAD }), NOW)).toBe(true);
    expect(inForce(ent({ expires_date: PAST, grace_period_expires_date: PAST }), NOW)).toBe(false);
  });

  it('a refund ends it: the store dates the end to the refund', () => {
    expect(tierFromRecord({ entitlements: { auteur: ent({ expires_date: PAST }) } }, NOW)).toBe('cinephile');
  });

  it('the highest held wins, so a lesser subscription ending leaves the greater', () => {
    expect(tierFromRecord({ entitlements: {
      archivist: ent({ expires_date: PAST }),
      auteur: ent({ expires_date: AHEAD }),
    } }, NOW)).toBe('auteur');
    expect(tierFromRecord({ entitlements: {
      archivist: ent({ expires_date: AHEAD }),
      auteur: ent({ expires_date: PAST }),
    } }, NOW)).toBe('archivist');
    expect(tierFromRecord({ entitlements: {
      auteur: ent({ expires_date: AHEAD }),
      founding: ent({ expires_date: null }),
    } }, NOW)).toBe('founding');
  });

  it('reads the rank from the product when the dashboard named the entitlement otherwise, without case', () => {
    expect(tierFromRecord({ entitlements: { pro: ent({ expires_date: AHEAD, product_identifier: 'Auteur_Annual' }) } }, NOW)).toBe('auteur');
    expect(tierFromRecord({ entitlements: { AUTEUR: ent({ expires_date: AHEAD }) } }, NOW)).toBe('auteur');
  });

  it('holds nothing for an empty, unknown or malformed record, rather than guessing', () => {
    expect(tierFromRecord({ entitlements: {} }, NOW)).toBe('cinephile');
    expect(tierFromRecord({ entitlements: { gift: ent({ expires_date: AHEAD, product_identifier: 'gift_card' }) } }, NOW)).toBe('cinephile');
    expect(tierFromRecord(null, NOW)).toBe('cinephile');
  });
});

describe('applying a record', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });
  const answer = (status: number, body?: unknown) => {
    global.fetch = jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })) as any;
  };
  const admin = (replies: Record<string, { data?: unknown; error?: unknown }> = {}) => {
    const calls: [string, Record<string, unknown>][] = [];
    return {
      calls,
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.push([fn, args]);
        return Promise.resolve({ data: replies[fn]?.data ?? null, error: replies[fn]?.error ?? null });
      },
    };
  };

  it('grants what the record holds, as the store, and answers the rank in force', async () => {
    answer(200, { subscriber: { entitlements: { auteur: { expires_date: AHEAD } } } });
    const a = admin({ grant_entitlement: { data: [{ out_tier: 'auteur', out_applied: true }] } });
    await expect(applyStoreRecord(a, UID, 'k', NOW)).resolves.toEqual({ ok: true, storeTier: 'auteur', tier: 'auteur', seatClaimed: true, changed: true });
    expect(a.calls).toEqual([['grant_entitlement', { p_user_id: UID, p_tier: 'auteur', p_source: 'revenuecat' }]]);
  });

  it('claims the founding seat before the rank, and says when the house was full', async () => {
    answer(200, { subscriber: { entitlements: { founding: { expires_date: null } } } });
    const a = admin({ claim_founding_seat: { data: false }, grant_entitlement: { data: [{ out_tier: 'auteur', out_applied: true }] } });
    const r = await applyStoreRecord(a, UID, 'k', NOW);
    expect(r).toMatchObject({ ok: true, storeTier: 'founding', seatClaimed: false });
    expect(a.calls.map(([fn]) => fn)).toEqual(['claim_founding_seat', 'grant_entitlement']);
  });

  it('a member the store has never seen (404) holds nothing, and the store\'s grant ends', async () => {
    answer(404);
    const a = admin();
    await expect(applyStoreRecord(a, UID, 'k', NOW)).resolves.toMatchObject({ ok: true, storeTier: 'cinephile' });
    expect(a.calls[0][1]).toMatchObject({ p_tier: 'cinephile' });
  });

  it('a store that could not be read is never "holds nothing": nothing is granted, and the answer is retryable', async () => {
    for (const fail of [() => answer(500), () => answer(429), () => { global.fetch = jest.fn(async () => { throw new Error('offline'); }) as any; }]) {
      fail();
      const a = admin();
      await expect(applyStoreRecord(a, UID, 'k', NOW)).resolves.toMatchObject({ ok: false, status: 502 });
      expect(a.calls).toEqual([]);
    }
  });

  it('a member who does not exist is 404 (no retry can make one); any other failure is 500', async () => {
    answer(200, { subscriber: { entitlements: {} } });
    await expect(applyStoreRecord(admin({ grant_entitlement: { error: { code: 'P0002' } } }), UID, 'k', NOW))
      .resolves.toMatchObject({ ok: false, status: 404 });
    await expect(applyStoreRecord(admin({ grant_entitlement: { error: { code: '57014' } } }), UID, 'k', NOW))
      .resolves.toMatchObject({ ok: false, status: 500 });
  });
});

describe('the webhook\'s secret', () => {
  const SECRET = 'Bearer rc-webhook-7f3a';
  it('admits the secret itself', () => expect(authorized(SECRET, SECRET)).toBe(true));
  it('refuses a guess that differs anywhere — first byte, last byte, or length', () => {
    expect(authorized('Xearer rc-webhook-7f3a', SECRET)).toBe(false);
    expect(authorized('Bearer rc-webhook-7f3b', SECRET)).toBe(false);
    expect(authorized('Bearer rc-webhook-7f3', SECRET)).toBe(false);
    expect(authorized('', SECRET)).toBe(false);
  });
  it('refuses everything when no secret is configured (fail closed)', () => {
    expect(authorized('', '')).toBe(false);
    expect(authorized('anything', '')).toBe(false);
  });
});
