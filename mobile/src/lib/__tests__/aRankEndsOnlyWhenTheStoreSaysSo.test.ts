/**
 * aRankEndsOnlyWhenTheStoreSaysSo.test.ts — every "no store" answer, executed.
 * ─────────────────────────────────────────────────────────────────────────────
 * The coverage ratchet found `src/lib/revenueCat.ts` sliding: `reconcileRank`
 * (the only thing that can end a paid rank) arrived guarded by source-reading
 * tests, so its lines had never run.
 *
 * ── WHAT CANNOT BE EXECUTED HERE, SAID PLAINLY ──────────────────────────────
 * The CONFIGURED paths — the store answering yes, no, or failing — need the
 * SDK loaded, and the module loads it with a dynamic `import()`, which this
 * Jest environment cannot run ("invoked without --experimental-vm-modules").
 * The first draft of this file configured a stand-in SDK, and its own tripwire
 * showed the module never configured: the one "store unreachable" test that
 * passed did so vacuously. Reaching those paths needs either a build-wide Babel
 * change or a test seam inside revenueCat.ts — payments code, left alone until
 * the payments pass. `aRankIsOnlyTakenOnAnAnswer` keeps pinning them in source
 * (mutation-checked) until then.
 *
 * ── WHAT CAN, AND MATTERS ───────────────────────────────────────────────────
 * Every public function's answer when there is no store to ask — the state
 * every Android build is in today — and the parser that decides a member's
 * rank from whatever the store does say. Including the configure-FAILURE
 * branch, which this environment reproduces for real.
 */
const mockRpc = jest.fn();
jest.mock('@/src/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));

type Module = typeof import('@/src/lib/revenueCat');

/** A fresh copy of the module (its key and configured flag are module state). */
function fresh(key?: string): Module {
  let mod!: Module;
  const before = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  if (key === undefined) delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  else process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = key;
  try {
    jest.isolateModules(() => { mod = jest.requireActual('@/src/lib/revenueCat'); });
  } finally {
    if (before === undefined) delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
    else process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = before;
  }
  return mod;
}

beforeEach(() => mockRpc.mockReset());

describe('a rank ends only when the store says so', () => {
  describe('with no store to ask, nothing pretends to be an answer', () => {
    it('no key: init is a quiet no-op, and every question stays unanswered', async () => {
      const rc = fresh();
      await expect(rc.initRevenueCat('member-1')).resolves.toBeUndefined();
      expect(await rc.reconcileRank()).toBe('unknown');
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('a key whose SDK fails to load stays UNCONFIGURED — never a lapse', async () => {
      // The genuine failure branch: in this environment the SDK's dynamic
      // import throws, exactly as a broken native module would on a device.
      const rc = fresh('test_not_a_real_key');
      await rc.initRevenueCat('member-1');
      expect(await rc.reconcileRank()).toBe('unknown');
      expect(mockRpc).not.toHaveBeenCalledWith('relinquish_rank');
    });

    it('a purchase with no store returns nothing — never a false success', async () => {
      const rc = fresh();
      expect(await rc.purchasePackage({})).toBeNull();
      expect(await rc.purchaseTier('auteur', 'annual')).toBeNull();
    });

    it('a restore with no store says it could not ask — not "you own nothing"', async () => {
      const rc = fresh();
      const r = await rc.restorePurchases();
      expect(r).toMatchObject({ storeReachable: false, isActive: false, tier: 'cinephile' });
      // Nothing was retired on the strength of an unasked question.
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('entitlements, offerings and prices are empty rather than invented', async () => {
      const rc = fresh();
      expect(await rc.checkEntitlements()).toMatchObject({ isActive: false, tier: 'cinephile' });
      expect(await rc.getOfferings()).toEqual([]);
      expect(await rc.getTierPricing()).toEqual({});
    });

    it('identity changes are safe no-ops', async () => {
      const rc = fresh();
      await expect(rc.identifyUser('member-1')).resolves.toBeUndefined();
      await expect(rc.logoutRevenueCat()).resolves.toBeUndefined();
    });
  });

  describe('what the store says decides the rank, in order', () => {
    const rc = fresh();
    const active = (tiers: Record<string, object>) => ({ entitlements: { active: tiers } }) as never;

    it('founding outranks auteur outranks archivist', () => {
      expect(rc.parseEntitlements(active({ archivist: { productIdentifier: 'a' }, auteur: { productIdentifier: 'b' }, founding: { productIdentifier: 'f' } })).tier).toBe('founding');
      expect(rc.parseEntitlements(active({ archivist: { productIdentifier: 'a' }, auteur: { productIdentifier: 'b' } })).tier).toBe('auteur');
      expect(rc.parseEntitlements(active({ archivist: { productIdentifier: 'a' } })).tier).toBe('archivist');
    });

    it('a founding seat is lifetime — no expiry, nothing to renew', () => {
      expect(rc.parseEntitlements(active({ founding: { productIdentifier: 'f', expirationDate: '2027-01-01' } })))
        .toMatchObject({ tier: 'founding', isActive: true, expiresAt: null, willRenew: false });
    });

    it('renewal is assumed unless the store says it is OFF', () => {
      expect(rc.parseEntitlements(active({ auteur: { productIdentifier: 'b' } })).willRenew).toBe(true);
      expect(rc.parseEntitlements(active({ auteur: { productIdentifier: 'b', willRenew: false } })).willRenew).toBe(false);
      expect(rc.parseEntitlements(active({ archivist: { productIdentifier: 'a', expirationDate: '2026-12-01' } })))
        .toMatchObject({ expiresAt: '2026-12-01', productIdentifier: 'a' });
    });

    it('nothing active, nothing there, or nothing at all — the free rank, inactive', () => {
      for (const info of [null, { entitlements: { active: {} } }, { entitlements: {} }, {}]) {
        expect(rc.parseEntitlements(info as never)).toEqual({
          tier: 'cinephile', isActive: false, expiresAt: null, willRenew: false, productIdentifier: null,
        });
      }
    });
  });
});
