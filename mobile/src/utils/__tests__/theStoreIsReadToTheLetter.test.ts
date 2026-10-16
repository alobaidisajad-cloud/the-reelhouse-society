/**
 * theStoreIsReadToTheLetter.test.ts — the store's two doors at every edge (revenuecat-webhook/decide.ts
 * and _shared/storeRecord.ts): an account id is the whole string and nothing else; an event's accounts
 * are named the one way; an end at this very moment has ended; a record of the wrong shape holds
 * nothing; and every answer the store, the seat and the grant can give is told by its own words.
 */
import { accountsIn, isAccountId } from '../../../supabase/functions/revenuecat-webhook/decide';
import { applyStoreRecord, inForce, tierFromRecord } from '../../../supabase/functions/_shared/storeRecord';

const UID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const NOW = Date.parse('2026-10-03T12:00:00Z');
const AHEAD = '2026-11-03T12:00:00Z';
const AT_NOW = new Date(NOW).toISOString();

describe('whom an event concerns', () => {
  it('takes an account id as the whole string, in any case, and nothing that only holds one', () => {
    expect(isAccountId(UID.toUpperCase())).toBe(true);
    expect([` ${UID}`, `${UID} `, `x${UID}`, `${UID}x`].map(isAccountId)).toEqual([false, false, false, false]);
    expect(isAccountId([UID])).toBe(false);
  });

  it('names each account one way, in small letters, however the store wrote it', () => {
    expect(accountsIn({ type: 'TRANSFER', app_user_id: UID.toUpperCase(), transferred_to: [UID] })).toEqual([UID]);
  });
});

describe('what a record grants', () => {
  it('ends an entitlement at its own moment: an end, or a grace, at this instant has ended', () => {
    expect(inForce({ expires_date: AT_NOW }, NOW)).toBe(false);
    expect(inForce({ expires_date: AT_NOW, grace_period_expires_date: AT_NOW }, NOW)).toBe(false);
    expect(inForce({ expires_date: new Date(NOW + 1).toISOString() }, NOW)).toBe(true);
  });

  it('reads only a written date as an end: a bare number, even a year ahead, is none', () => {
    expect(inForce({ expires_date: 2099 }, NOW)).toBe(false);
    expect(inForce({ grace_period_expires_date: 2099 }, NOW)).toBe(false);
  });

  it('holds nothing for a record with no entitlements, or entitlements of no shape', () => {
    expect([null, {}, { entitlements: null }, { entitlements: 'auteur' }].map((r) => tierFromRecord(r, NOW)))
      .toEqual(['cinephile', 'cinephile', 'cinephile', 'cinephile']);
  });
});

describe('applying a record', () => {
  const realFetch = global.fetch;
  const signalTimeout = (AbortSignal as unknown as { timeout?: unknown }).timeout;
  beforeEach(() => {
    (AbortSignal as unknown as { timeout: () => AbortSignal }).timeout = () => new AbortController().signal;
  });
  afterEach(() => { global.fetch = realFetch; });
  afterAll(() => { (AbortSignal as unknown as { timeout?: unknown }).timeout = signalTimeout; });

  const answer = (status: number, json: () => Promise<unknown>) => {
    global.fetch = jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json })) as never;
  };
  const record = (entitlements: Record<string, unknown>) => answer(200, async () => ({ subscriber: { entitlements } }));
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

  it('asks the store with its key, for its answer in JSON', async () => {
    answer(404, async () => ({}));
    await applyStoreRecord(admin(), UID, 'the-key', NOW);
    const [, init] = (global.fetch as unknown as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ Authorization: 'Bearer the-key', Accept: 'application/json' });
  });

  it('tells each way the store could not be read by its own words, and grants nothing', async () => {
    const said: unknown[] = [];
    global.fetch = jest.fn(async () => { throw new Error('offline'); }) as never;
    said.push(await applyStoreRecord(admin(), UID, 'k', NOW));
    answer(500, async () => ({}));
    said.push(await applyStoreRecord(admin(), UID, 'k', NOW));
    answer(200, async () => { throw new SyntaxError('Unexpected token <'); });
    said.push(await applyStoreRecord(admin(), UID, 'k', NOW));
    expect(said).toEqual([
      { ok: false, status: 502, error: 'could not reach the store' },
      { ok: false, status: 502, error: 'the store answered 500' },
      { ok: false, status: 502, error: 'the store answered something unreadable' },
    ]);
  });

  it('takes an empty answer from the store as a record that holds nothing', async () => {
    answer(200, async () => null);
    const a = admin({ grant_entitlement: { data: { out_tier: 'cinephile', out_applied: false } } });
    await expect(applyStoreRecord(a, UID, 'k', NOW))
      .resolves.toEqual({ ok: true, storeTier: 'cinephile', tier: 'cinephile', seatClaimed: true, changed: false });
  });

  it('claims the seat for this member, says when it was theirs, and stops when the claim fails', async () => {
    record({ founding: { expires_date: null } });
    const won = admin({ claim_founding_seat: { data: true }, grant_entitlement: { data: [{ out_tier: 'founding', out_applied: true }] } });
    await expect(applyStoreRecord(won, UID, 'k', NOW)).resolves.toMatchObject({ ok: true, seatClaimed: true, tier: 'founding' });
    expect(won.calls[0]).toEqual(['claim_founding_seat', { p_user_id: UID }]);

    const failed = admin({ claim_founding_seat: { error: { code: '57014' } } });
    await expect(applyStoreRecord(failed, UID, 'k', NOW)).resolves.toEqual({ ok: false, status: 500, error: 'could not claim the founding seat' });
    expect(failed.calls.map(([fn]) => fn)).toEqual(['claim_founding_seat']);
  });

  it('tells a missing member from any other failure to record the rank, by its words', async () => {
    record({});
    await expect(applyStoreRecord(admin({ grant_entitlement: { error: { code: 'P0002' } } }), UID, 'k', NOW))
      .resolves.toEqual({ ok: false, status: 404, error: 'no such member' });
    await expect(applyStoreRecord(admin({ grant_entitlement: { error: { code: '57014' } } }), UID, 'k', NOW))
      .resolves.toEqual({ ok: false, status: 500, error: 'could not record the rank' });
  });

  it('says a rank already held is unchanged, and nothing of a grant that answered no row', async () => {
    record({ auteur: { expires_date: AHEAD } });
    await expect(applyStoreRecord(admin({ grant_entitlement: { data: [{ out_tier: 'auteur', out_applied: false }] } }), UID, 'k', NOW))
      .resolves.toEqual({ ok: true, storeTier: 'auteur', tier: 'auteur', seatClaimed: true, changed: false });
    await expect(applyStoreRecord(admin({ grant_entitlement: { data: [] } }), UID, 'k', NOW))
      .resolves.toEqual({ ok: true, storeTier: 'auteur', tier: null, seatClaimed: true, changed: false });
  });
});
