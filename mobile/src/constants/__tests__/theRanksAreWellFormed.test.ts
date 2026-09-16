/**
 * theRanksAreWellFormed.test.ts — the ranks the Society page sells, in shape.
 * ─────────────────────────────────────────────────────────────────────────────
 * These three checks lived in PaywallModal.test.tsx. PaywallModal was a built
 * upgrade sheet that nothing in the app ever rendered — the Society page is the
 * one place ranks are sold — so the component was removed (the WEB keeps its own,
 * separate PaywallModal, which it does use). The checks were never about that
 * component: they guard the TIERS list itself, so they stay, under a name that
 * says so.
 */
import { TIERS } from '@/src/constants/membership';

describe('the ranks are well formed', () => {
  const paid = TIERS.filter((t) => t.id !== 'cinephile');

  it('there are ranks to sell beyond the free one', () => {
    expect(paid.length).toBeGreaterThan(0);
    expect(paid.every((t) => t.id !== 'cinephile')).toBe(true);
  });

  it('every paid rank has a name, a price and a list of what it gives', () => {
    for (const tier of paid) {
      expect(tier.name).toBeDefined();
      expect(tier.price).toBeDefined();
      expect(Array.isArray(tier.features)).toBe(true);
    }
  });

  it('the two ranks the app gates on both exist', () => {
    const ids = TIERS.map((t) => t.id);
    expect(ids).toContain('archivist');
    expect(ids).toContain('auteur');
  });
});
