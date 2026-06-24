/**
 * selectPackageForTier regression test (guards LIB-1).
 *
 * Before the fix, purchaseTier matched on the *package* identifier
 * (`pkg.identifier`). RevenueCat's predefined packages use identifiers like
 * `$rc_annual` / `$rc_lifetime`, which never contain the tier name — so every
 * purchase on a standard-configured dashboard threw "No package found" and
 * nobody could subscribe. These tests assert resolution works against the
 * standard predefined layout (the broken case), custom-named packages, and the
 * one-offering-per-tier topology, by matching on `product.identifier` +
 * `packageType`.
 */
import { selectPackageForTier } from '../revenueCat';

// Minimal package factory mirroring the RevenueCat PurchasesPackage shape.
const pkg = (identifier: string, packageType: string, productId: string) => ({
  identifier,
  packageType,
  product: { identifier: productId },
});

describe('selectPackageForTier (LIB-1 regression)', () => {
  it('resolves the annual product from STANDARD predefined packages ($rc_*) — the case that was broken', () => {
    // Dashboard uses RevenueCat's predefined package identifiers; only the
    // store product id carries the tier name. The old `.identifier.includes`
    // match failed here.
    const packages = [
      pkg('$rc_monthly', 'MONTHLY', 'auteur_monthly'),
      pkg('$rc_annual', 'ANNUAL', 'auteur_annual'),
    ];
    const chosen = selectPackageForTier(packages, 'auteur');
    expect(chosen?.product.identifier).toBe('auteur_annual');
    expect(chosen?.packageType).toBe('ANNUAL');
  });

  it('resolves founding via the lifetime predefined package ($rc_lifetime)', () => {
    const packages = [pkg('$rc_lifetime', 'LIFETIME', 'founding_lifetime')];
    const chosen = selectPackageForTier(packages, 'founding');
    expect(chosen?.product.identifier).toBe('founding_lifetime');
  });

  it('prefers ANNUAL over MONTHLY for a subscription tier (UI hardcodes annual pricing)', () => {
    const packages = [
      pkg('$rc_monthly', 'MONTHLY', 'archivist_monthly'),
      pkg('$rc_annual', 'ANNUAL', 'archivist_annual'),
    ];
    expect(selectPackageForTier(packages, 'archivist')?.packageType).toBe('ANNUAL');
  });

  it('still resolves CUSTOM-named packages (legacy package-identifier path)', () => {
    // Some dashboards name packages after the tier directly.
    const packages = [
      pkg('auteur_monthly', 'CUSTOM', 'rc_prod_x1'),
      pkg('auteur_annual', 'CUSTOM', 'rc_prod_x2'),
    ];
    const chosen = selectPackageForTier(packages, 'auteur');
    expect(chosen?.identifier).toBe('auteur_annual');
  });

  it('picks the right tier when packages from multiple tiers are flattened together (one-offering-per-tier)', () => {
    const packages = [
      pkg('$rc_annual', 'ANNUAL', 'archivist_annual'),
      pkg('$rc_annual', 'ANNUAL', 'auteur_annual'),
      pkg('$rc_lifetime', 'LIFETIME', 'founding_lifetime'),
    ];
    expect(selectPackageForTier(packages, 'archivist')?.product.identifier).toBe('archivist_annual');
    expect(selectPackageForTier(packages, 'auteur')?.product.identifier).toBe('auteur_annual');
    expect(selectPackageForTier(packages, 'founding')?.product.identifier).toBe('founding_lifetime');
  });

  it('falls back to a monthly product rather than failing the sale when no annual exists', () => {
    const packages = [pkg('$rc_monthly', 'MONTHLY', 'auteur_monthly')];
    expect(selectPackageForTier(packages, 'auteur')?.product.identifier).toBe('auteur_monthly');
  });

  it('returns null when no package matches the tier (caller throws "No package found")', () => {
    const packages = [pkg('$rc_annual', 'ANNUAL', 'auteur_annual')];
    expect(selectPackageForTier(packages, 'archivist')).toBeNull();
    expect(selectPackageForTier([], 'auteur')).toBeNull();
  });
});
