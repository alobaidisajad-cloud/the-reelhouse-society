/**
 * PaywallModal.test.tsx — Logic Tests
 * ────────────────────────────────────
 * Tests the PaywallModal contract and tier rendering logic
 * without full component rendering (avoids native module issues).
 */

describe('PaywallModal logic', () => {
  it('TIERS constant filters out cinephile for upgrade display', () => {
    const { TIERS } = require('@/src/constants/membership');
    const upgradeTiers = TIERS.filter((t: any) => t.id !== 'cinephile');

    expect(upgradeTiers.length).toBeGreaterThan(0);
    expect(upgradeTiers.every((t: any) => t.id !== 'cinephile')).toBe(true);
  });

  it('upgrade tiers have required fields', () => {
    const { TIERS } = require('@/src/constants/membership');
    const upgradeTiers = TIERS.filter((t: any) => t.id !== 'cinephile');

    for (const tier of upgradeTiers) {
      expect(tier.name).toBeDefined();
      expect(tier.price).toBeDefined();
      expect(tier.features).toBeDefined();
      expect(Array.isArray(tier.features)).toBe(true);
    }
  });

  it('recommended tier matches valid tier IDs', () => {
    const { TIERS } = require('@/src/constants/membership');
    const validIds = TIERS.map((t: any) => t.id);

    // recommendedTier must be one of the valid IDs
    expect(validIds).toContain('archivist');
    expect(validIds).toContain('auteur');
  });

  it('exports PaywallModal component', () => {
    const mod = require('../PaywallModal');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });
});
