/**
 * theRanksAreWellFormed.test.ts — the ranks the Society page sells, in shape.
 * ─────────────────────────────────────────────────────────────────────────────
 * These checks lived in PaywallModal.test.tsx. PaywallModal was a built upgrade
 * sheet that nothing in the app ever rendered — the Society page is the one
 * place ranks are sold — so the component was removed (the WEB keeps its own,
 * separate PaywallModal, which it does use). The checks were never about that
 * component: they guard the rank list itself, so they stay, under a name that
 * says so.
 */
import { RANKS, privilegesOf } from '@/src/constants/membership';

describe('the ranks are well formed', () => {
  const paid = RANKS.filter((t) => t.id !== 'cinephile');

  it('there are ranks to sell beyond the free one', () => {
    expect(paid.length).toBeGreaterThan(0);
  });

  it('every paid rank has a name, a fallback price for both periods, and privileges of its own', () => {
    for (const rank of paid) {
      expect(rank.name).toMatch(/^The /);
      // Fallbacks only — the store's localized price is preferred — but a
      // blank one would print "$" and nothing when the store is unreachable.
      expect(rank.priceMonthly).toMatch(/^\d+\.\d\d$/);
      expect(rank.priceAnnual).toMatch(/^\d+\.\d\d$/);
      expect(privilegesOf(rank.id).length).toBeGreaterThan(0);
    }
  });

  it('the fallback prices say what the page says they save', () => {
    // The switch reads "SAVE 16%" from these when the store cannot be asked,
    // so they must actually save it: twelve months against one year.
    for (const rank of paid) {
      const monthly = Number(rank.priceMonthly) * 12;
      const saved = Math.floor((1 - Number(rank.priceAnnual) / monthly) * 100);
      expect(`${rank.id} ${saved}`).toBe(`${rank.id} 16`);
    }
  });

  it('the two ranks the app gates on both exist', () => {
    const ids = RANKS.map((t) => t.id);
    expect(ids).toContain('archivist');
    expect(ids).toContain('auteur');
  });
});
