/**
 * aRankEndsOnlyWhenTheStoreSaysSo.test.ts — every "no store" answer, executed.
 * ─────────────────────────────────────────────────────────────────────────────
 * The coverage ratchet found `src/lib/revenueCat.ts` sliding: `reconcileRank`
 * (the only thing that can end a paid rank) arrived guarded by source-reading
 * tests, so its lines had never run.
 *
 * Every public function's answer when there is no store to ask (no key, or a
 * store that fails to start) — and, with a stand-in store, every answer a
 * configured one gives: entitled, positively not, or unreachable. The module
 * loads the SDK with a require this suite can run (it was an `import()`, which
 * Jest cannot, and those paths were only pinned in source text).
 */
const mockRpc = jest.fn();
jest.mock('@/src/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));

const mockStore = {
  configure: jest.fn(),
  getCustomerInfo: jest.fn(),
  restorePurchases: jest.fn(),
  getAppUserID: jest.fn(),
};
jest.mock('react-native-purchases', () => ({ __esModule: true, default: mockStore }));
const mockEnqueue = jest.fn();
jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: (...a: unknown[]) => mockEnqueue(...a),
  flushOfflineQueue: jest.fn(),
}));

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

beforeEach(() => {
  mockRpc.mockReset();
  mockEnqueue.mockReset();
  for (const f of Object.values(mockStore)) f.mockReset();
});

/** A copy whose store is configured, as on a phone with a key. */
async function configured(): Promise<Module> {
  const rc = fresh('test_key');
  await rc.initRevenueCat('11111111-1111-4111-8111-111111111111');
  expect(rc.isStoreReady()).toBe(true);
  return rc;
}
const holds = (tiers: Record<string, object>) => ({ entitlements: { active: tiers } });

describe('with a store to ask, its answer decides', () => {
  it('entitled: the rank stands, and the house is asked nothing', async () => {
    const rc = await configured();
    mockStore.getCustomerInfo.mockResolvedValue(holds({ auteur: { productIdentifier: 'auteur_annual' } }));
    expect(await rc.reconcileRank()).toBe('active');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('positively not entitled: the store\'s own grant is ended, and only then is it a lapse', async () => {
    const rc = await configured();
    mockStore.getCustomerInfo.mockResolvedValue(holds({}));
    mockRpc.mockResolvedValue({ data: [{ out_applied: true, out_reason: 'revenuecat: auteur -> none' }], error: null });
    expect(await rc.reconcileRank()).toBe('relinquished');
    expect(mockRpc).toHaveBeenCalledWith('relinquish_rank');
  });

  it('not entitled, and the store never ranked them: nothing was lowered, and none is reported', async () => {
    const rc = await configured();
    mockStore.getCustomerInfo.mockResolvedValue(holds({}));
    mockRpc.mockResolvedValue({ data: [{ out_applied: false }], error: null });
    expect(await rc.reconcileRank()).toBe('already-current');
  });

  it('a store that could not be reached is no answer: the house is asked nothing', async () => {
    const rc = await configured();
    mockStore.getCustomerInfo.mockRejectedValue(new Error('offline'));
    expect(await rc.reconcileRank()).toBe('unknown');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('a house that refused is no lapse either', async () => {
    const rc = await configured();
    mockStore.getCustomerInfo.mockResolvedValue(holds({}));
    mockRpc.mockResolvedValue({ data: null, error: { message: 'timeout' } });
    expect(await rc.reconcileRank()).toBe('unknown');
  });

  it('a restore the store answered is sent to the house for the account it sold to; one it could not is not', async () => {
    const rc = await configured();
    mockStore.getAppUserID.mockResolvedValue('11111111-1111-4111-8111-111111111111');
    mockStore.restorePurchases.mockResolvedValue(holds({ archivist: { productIdentifier: 'archivist_monthly' } }));
    expect(await rc.restorePurchases()).toMatchObject({ storeReachable: true, isActive: true, tier: 'archivist' });
    expect(mockEnqueue).toHaveBeenCalledWith({ type: 'sync_entitlement', payload: { tier: 'archivist', user_id: '11111111-1111-4111-8111-111111111111' } });

    mockEnqueue.mockReset();
    mockStore.restorePurchases.mockRejectedValue(new Error('offline'));
    expect(await rc.restorePurchases()).toMatchObject({ storeReachable: false });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

describe('a rank ends only when the store says so', () => {
  describe('with no store to ask, nothing pretends to be an answer', () => {
    it('no key: init is a quiet no-op, and every question stays unanswered', async () => {
      const rc = fresh();
      await expect(rc.initRevenueCat('member-1')).resolves.toBeUndefined();
      expect(await rc.reconcileRank()).toBe('unknown');
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('a key whose SDK fails to start stays UNCONFIGURED — never a lapse', async () => {
      // As a broken native module would on a device.
      mockStore.configure.mockImplementation(() => { throw new Error('no native module'); });
      const rc = fresh('test_not_a_real_key');
      await rc.initRevenueCat('member-1');
      expect(rc.isStoreReady()).toBe(false);
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
