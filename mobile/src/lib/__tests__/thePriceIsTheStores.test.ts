/**
 * thePriceIsTheStores.test.ts — every price the Society prints comes from the store.
 * ─────────────────────────────────────────────────────────────────────────────
 * `pricingFromPackages` reads the store's packages into prices per rank. The
 * rules it keeps, run here against packages shaped as RevenueCat returns them:
 *
 *   · each rank's monthly, yearly and one-time price, as the store's own
 *     localized strings — never rebuilt from a number
 *   · the yearly price's per-month figure, the store's own `pricePerMonthString`
 *     — only for a yearly product, and only when the store gave one
 *   · anything that is not a rank's product is ignored, not guessed at
 *
 * And the one store call with no store behind it: "manage subscriptions" says it
 * could not open, so the page can open the store's address instead.
 */
jest.mock('@/src/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
// eslint-disable-next-line import/first
import { pricingFromPackages, showManageSubscriptions } from '../revenueCat';

const pkg = (id: string, type: string, product: Record<string, unknown>) => ({ identifier: `$rc_${type.toLowerCase()}`, packageType: type, product: { identifier: id, ...product } });

describe('the price is the store’s', () => {
  const packages = [
    pkg('archivist_monthly', 'MONTHLY', { priceString: '£1.99', price: 1.99, currencyCode: 'GBP', pricePerMonthString: '£1.99' }),
    pkg('archivist_annual', 'ANNUAL', { priceString: '£19.99', price: 19.99, currencyCode: 'GBP', pricePerMonthString: '£1.67' }),
    pkg('auteur_annual', 'ANNUAL', { priceString: '£49.99', price: 49.99, currencyCode: 'GBP' }),
    pkg('founding_lifetime', 'LIFETIME', { priceString: '£49.00', price: 49, currencyCode: 'GBP', pricePerMonthString: null }),
    pkg('tip_jar', 'CUSTOM', { priceString: '£2.00', price: 2 }),
  ];
  const p = pricingFromPackages(packages);

  it('reads each rank’s prices as the store wrote them', () => {
    expect(p.archivist).toMatchObject({ monthly: '£1.99', annual: '£19.99', monthlyPrice: 1.99, annualPrice: 19.99, currencyCode: 'GBP' });
    expect(p.auteur).toMatchObject({ annual: '£49.99', annualPrice: 49.99 });
    expect(p.founding).toMatchObject({ lifetime: '£49.00', lifetimePrice: 49 });
  });

  it('takes the per-month figure from the store, for a yearly product only', () => {
    expect(p.archivist.annualPerMonth).toBe('£1.67');
    // A monthly product's own per-month string is not the yearly one's.
    expect(Object.values(p).some((x) => x.annualPerMonth === '£1.99')).toBe(false);
  });

  it('a monthly product never supplies the yearly per-month figure — whatever the order', () => {
    // Read alone, and read AFTER the yearly one: in both, the month's own figure
    // must not become the year's. (Read first, it would simply be overwritten,
    // which is how a first version of this test passed with the guard removed.)
    const onlyMonthly = pricingFromPackages([pkg('auteur_monthly', 'MONTHLY', { priceString: '£4.99', price: 4.99, pricePerMonthString: '£4.99' })]);
    expect(onlyMonthly.auteur.annualPerMonth).toBeUndefined();
    const yearThenMonth = pricingFromPackages([
      pkg('auteur_annual', 'ANNUAL', { priceString: '£49.99', price: 49.99, pricePerMonthString: '£4.17' }),
      pkg('auteur_monthly', 'MONTHLY', { priceString: '£4.99', price: 4.99, pricePerMonthString: '£4.99' }),
    ]);
    expect(yearThenMonth.auteur.annualPerMonth).toBe('£4.17');
  });

  it('when the store gives no per-month figure, there is none — it is not worked out', () => {
    expect(p.auteur.annualPerMonth).toBeUndefined();
    expect(p.founding.annualPerMonth).toBeUndefined();
  });

  it('ignores what is not a rank', () => {
    expect(Object.keys(p).sort()).toEqual(['archivist', 'auteur', 'founding']);
  });

  it('a package without a price string is skipped, not printed as blank', () => {
    const q = pricingFromPackages([pkg('auteur_monthly', 'MONTHLY', { price: 4.99 })]);
    expect(q.auteur).toBeUndefined();
  });

  it('no store: nothing', () => {
    expect(pricingFromPackages([])).toEqual({});
  });
});

describe('manage subscriptions, with no store to ask', () => {
  it('says it could not open, so the page opens the store’s address instead', async () => {
    await expect(showManageSubscriptions()).resolves.toBe(false);
  });
});
