import * as fc from 'fast-check';
import { getTierWeight, isArchivistPlusTier, isAuteurPlusTier, normalizeTier, resolveTier } from '../tier';

const VALID_TIERS = ['cinephile', 'archivist', 'auteur', 'founding'] as const;
const TIER_STRINGS = [...VALID_TIERS, 'free', '', 'unknown', 'admin', 'moderator'];

describe('tier.ts — Property-Based Tests', () => {
  describe('resolveTier', () => {
    it('always returns a valid tier for null/undefined input', () => {
      expect(resolveTier(null)).toBe('cinephile');
      expect(resolveTier(undefined)).toBe('cinephile');
      expect(resolveTier()).toBe('cinephile');
    });

    it('property: output weight is always >= max(tier weight, role weight) — Highest Watermark Rule', () => {
      fc.assert(
        fc.property(
          fc.record({
            tier: fc.oneof(fc.constant(null), fc.constantFrom(...TIER_STRINGS)),
            role: fc.oneof(fc.constant(null), fc.constantFrom(...TIER_STRINGS)),
            is_founding: fc.oneof(fc.constant(null), fc.boolean()),
          }),
          (input) => {
            const result = resolveTier(input);
            const resultWeight = getTierWeight(result);
            const tierWeight = getTierWeight(input.tier);
            const effectiveRole = input.is_founding ? 'founding' : input.role;
            const roleWeight = getTierWeight(effectiveRole);
            const maxInput = Math.max(tierWeight, roleWeight);
            return resultWeight >= maxInput;
          }
        ),
        { numRuns: 500 }
      );
    });

    it('property: is_founding always resolves to founding regardless of other fields', () => {
      fc.assert(
        fc.property(
          fc.record({
            tier: fc.oneof(fc.constant(null), fc.constantFrom(...TIER_STRINGS)),
            role: fc.oneof(fc.constant(null), fc.constantFrom(...TIER_STRINGS)),
            is_founding: fc.constant(true),
          }),
          (input) => {
            const result = resolveTier(input);
            return result === 'founding';
          }
        ),
        { numRuns: 200 }
      );
    });

    it('property: string input always returns a valid tier', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (input) => {
            const result = resolveTier(input);
            return VALID_TIERS.includes(result as any);
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe('normalizeTier', () => {
    it('property: never returns an invalid tier string', () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)),
          (input) => {
            const result = normalizeTier(input);
            return VALID_TIERS.includes(result);
          }
        ),
        { numRuns: 300 }
      );
    });

    it('returns cinephile for null, undefined, empty, and "free"', () => {
      expect(normalizeTier(null)).toBe('cinephile');
      expect(normalizeTier(undefined)).toBe('cinephile');
      expect(normalizeTier('')).toBe('cinephile');
      expect(normalizeTier('free')).toBe('cinephile');
    });

    it('correctly normalizes valid tier strings', () => {
      expect(normalizeTier('archivist')).toBe('archivist');
      expect(normalizeTier('auteur')).toBe('auteur');
      expect(normalizeTier('founding')).toBe('founding');
    });
  });

  describe('isArchivistPlusTier', () => {
    it('returns true for archivist, auteur, and founding', () => {
      expect(isArchivistPlusTier({ tier: 'archivist', role: 'archivist' })).toBe(true);
      expect(isArchivistPlusTier({ tier: 'auteur', role: 'auteur' })).toBe(true);
      expect(isArchivistPlusTier({ tier: 'founding', role: 'founding' })).toBe(true);
      expect(isArchivistPlusTier({ is_founding: true, tier: null, role: 'cinephile' })).toBe(true);
    });

    it('returns false for cinephile and free', () => {
      expect(isArchivistPlusTier({ tier: 'cinephile', role: 'cinephile' })).toBe(false);
      expect(isArchivistPlusTier({ tier: null, role: 'free' })).toBe(false);
      expect(isArchivistPlusTier(null)).toBe(false);
      expect(isArchivistPlusTier(undefined)).toBe(false);
    });
  });

  describe('isAuteurPlusTier', () => {
    it('returns true for auteur and founding only', () => {
      expect(isAuteurPlusTier({ tier: 'auteur', role: 'auteur' })).toBe(true);
      expect(isAuteurPlusTier({ tier: 'founding', role: 'founding' })).toBe(true);
      expect(isAuteurPlusTier({ is_founding: true, tier: null, role: 'cinephile' })).toBe(true);
    });

    it('returns false for archivist and below', () => {
      expect(isAuteurPlusTier({ tier: 'archivist', role: 'archivist' })).toBe(false);
      expect(isAuteurPlusTier({ tier: 'cinephile', role: 'cinephile' })).toBe(false);
    });
  });
});
