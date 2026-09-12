/**
 * aRankIsOnlyTakenOnAnAnswer.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * `reconcileRank` is the only thing in this app that can end a paid rank. The
 * obvious way to write it revokes the rank of nearly everybody who pays.
 *
 * `checkEntitlements()` returns `parseEntitlements(null)` — which reads as
 * INACTIVE — in three situations that are not alike:
 *
 *   the SDK is not configured   which on Android is ALWAYS today: there is no
 *                               EXPO_PUBLIC_REVENUECAT_ANDROID_KEY at all
 *   getCustomerInfo threw       offline, or a transient store failure
 *   the customer really has no active entitlement
 *
 * Only the third is a lapse. Acting on the first strips every Android member.
 * Acting on the second strips anyone who opens the app on a plane. "Not
 * entitled" and "I could not find out" must never be the same answer.
 *
 * This test lives in the Jest environment, where RevenueCat is never
 * configured — so the unconfigured path is simply the default here, and the
 * assertion is the real behaviour rather than a shape check: with no store to
 * ask, the server must not be told to lower anything.
 */
import { supabase } from '@/src/lib/supabase';
import { reconcileRank } from '@/src/lib/revenueCat';

describe('a rank is only taken on an answer', () => {
  let rpc: jest.SpyInstance;

  beforeEach(() => {
    rpc = jest.spyOn(supabase, 'rpc');
  });

  afterEach(() => {
    rpc.mockRestore();
  });

  it('says "unknown" when there is no store to ask, and asks the server nothing', async () => {
    // No RevenueCat key is configured under test — the same state every Android
    // build is in right now.
    const outcome = await reconcileRank();

    expect(outcome).toBe('unknown');
    // The whole point: an unanswerable question must not become a downgrade.
    const relinquishCalls = rpc.mock.calls.filter((c) => c[0] === 'relinquish_rank');
    expect(relinquishCalls).toEqual([]);
  });

  it('never reports a lapse it did not observe', async () => {
    // 'relinquished' is the only outcome that means a rank was lowered. It must
    // be unreachable without a positive answer from the store.
    for (let i = 0; i < 3; i++) {
      expect(await reconcileRank()).not.toBe('relinquished');
    }
    expect(rpc).not.toHaveBeenCalledWith('relinquish_rank');
  });

  /**
   * The two paths a test cannot reach without a real store, pinned in source so
   * that deleting either one fails the build. Both were checked by deleting
   * them and watching this go red.
   */
  it('the unconfigured and unreachable paths both return before the server call', () => {

    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'revenueCat.ts'), 'utf8',
    ) as string;

    const fn = src.slice(src.indexOf('export async function reconcileRank'));
    const body = fn.slice(0, fn.indexOf('\n}'));

    // Not configured is not an answer.
    expect(body).toMatch(/if \(!isConfigured \|\| !Purchases\) return 'unknown';/);
    // A throw is not an answer either.
    //
    // Anchored to the unique log line and forbidden from crossing a closing
    // brace. Written as `catch[\s\S]{0,200}return 'unknown';` it matched a
    // DIFFERENT `return 'unknown'` further down the function, so a mutant that
    // turned the store-failure branch into a silent lapse survived — the
    // failure mode this whole test exists to prevent.
    expect(body).toMatch(/could not reach the store[^}]*return 'unknown';/);
    // And both of those must come BEFORE anything is asked of the server.
    const rpcAt = body.indexOf("supabase.rpc('relinquish_rank')");
    expect(rpcAt).toBeGreaterThan(body.indexOf("if (!isConfigured"));
    expect(rpcAt).toBeGreaterThan(body.indexOf('catch'));
    // An active entitlement short-circuits too.
    expect(body).toMatch(/if \(info\.isActive\) return 'active';/);
    expect(rpcAt).toBeGreaterThan(body.indexOf('info.isActive'));
  });

  it('the server is the backstop, and the migration says so', () => {

    const sql = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations',
        '20260912_01_a_rank_that_ends.sql'), 'utf8',
    ) as string;

    // relinquish_rank may only ever lower the CALLER. It takes no arguments, so
    // it cannot name anybody else, and it cannot choose a tier.
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.relinquish_rank\(\)/);
    expect(sql).toMatch(/grant_entitlement\(v_uid, 'cinephile', 'revenuecat'\)/);
    // And it is not handed to anon.
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.relinquish_rank\(\) FROM PUBLIC;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.relinquish_rank\(\) TO authenticated;/);
    // The file must NOT open its own transaction — that is what wrote to
    // production during the rehearsal.
    expect(sql).not.toMatch(/^\s*BEGIN;\s*$/m);
    expect(sql).not.toMatch(/^\s*COMMIT;\s*$/m);
  });
});
