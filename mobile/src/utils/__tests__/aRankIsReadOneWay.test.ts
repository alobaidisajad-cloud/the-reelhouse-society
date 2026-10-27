/**
 * aRankIsReadOneWay.test.ts — utils/tier.ts, the one reading of a member's rank: every spelling it
 * meets, the weight of each rank, the highest of a member's store rank, role and founding seat, the
 * two thresholds every gate asks, the name each rank is shown by, and the one loud word for a value
 * it does not know.
 */
import {
  __resetTierWarningsForTest, getDisplayTier, getTierWeight, isArchivistPlusTier, isAuteurPlusTier, normalizeTier, resolveTier, TIER_WEIGHTS,
} from '../tier';

jest.mock('@/src/utils/logger', () => ({ logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn(), info: jest.fn() } }));
const { logger } = jest.requireMock('@/src/utils/logger') as { logger: { warn: jest.Mock } };

beforeEach(() => {
  __resetTierWarningsForTest();
  logger.warn.mockClear();
});

it('reads each rank in any case, and nothing as the free rank', () => {
  expect(['archivist', 'ARCHIVIST', 'Auteur', 'founding', 'FOUNDING'].map(normalizeTier)).toEqual(['archivist', 'archivist', 'auteur', 'founding', 'founding']);
  expect([null, undefined, '', 'free', 'cinephile', 'CINEPHILE'].map(normalizeTier)).toEqual(Array(6).fill('cinephile'));
});

it('reads a role that is no rank, and the free rank\'s old spelling in any case, as the free rank, quietly', () => {
  expect(['admin', 'venue_owner', 'Admin', 'free', 'FREE', 'Free'].map(normalizeTier)).toEqual(Array(6).fill('cinephile'));
  expect(logger.warn).not.toHaveBeenCalled();
});

it('reads a value it does not know as the free rank, and says so once a session, naming it as written', () => {
  expect(normalizeTier('Projectionist')).toBe('cinephile');
  expect(normalizeTier('projectionist')).toBe('cinephile');
  expect(normalizeTier('PROJECTIONIST')).toBe('cinephile');
  // The value named as written, after the fixed line (kept on the phone, never sent: P4.44).
  expect(logger.warn.mock.calls).toEqual([[
    '[tier] an unrecognised value was treated as cinephile: a paying member would be downgraded to free', 'Projectionist',
  ]]);
  normalizeTier('patron');
  expect(logger.warn).toHaveBeenCalledTimes(2);
  __resetTierWarningsForTest();
  normalizeTier('patron');
  expect(logger.warn).toHaveBeenCalledTimes(3);
});

it('weighs the ranks in order, the free one and its old spelling at nothing', () => {
  expect(TIER_WEIGHTS).toEqual({ free: 0, cinephile: 0, archivist: 1, auteur: 2, founding: 3 });
  expect(['cinephile', 'archivist', 'auteur', 'founding', null, 'admin'].map(getTierWeight)).toEqual([0, 1, 2, 3, 0, 0]);
});

it('takes the highest of the store\'s rank, the role and the founding seat', () => {
  expect(resolveTier(null)).toBe('cinephile');
  expect(resolveTier(undefined)).toBe('cinephile');
  expect(resolveTier('Auteur')).toBe('auteur');
  expect(resolveTier({ tier: 'archivist', role: 'auteur' })).toBe('auteur');
  expect(resolveTier({ tier: 'auteur', role: 'archivist' })).toBe('auteur');
  expect(resolveTier({ tier: 'archivist', role: 'admin' })).toBe('archivist');
  expect(resolveTier({ tier: null, role: null })).toBe('cinephile');
  expect(resolveTier({ tier: 'auteur', role: 'cinephile', is_founding: true })).toBe('founding');
  expect(resolveTier({ tier: 'founding', role: 'auteur', is_founding: false })).toBe('founding');
  expect(resolveTier({ tier: 'cinephile', role: 'auteur', is_founding: false })).toBe('auteur');
});

it('reads the store\'s spelling where the store and the role weigh the same', () => {
  expect(resolveTier({ tier: 'AUTEUR', role: 'auteur' })).toBe('auteur');
  expect(resolveTier({ tier: 'free', role: 'admin' })).toBe('cinephile');
});

it('opens the Archivist\'s door to the Archivist and every rank above, and the Auteur\'s to the Auteur and the founders', () => {
  const ranks = ['cinephile', 'archivist', 'auteur', 'founding'];
  expect(ranks.map((r) => isArchivistPlusTier(r))).toEqual([false, true, true, true]);
  expect(ranks.map((r) => isAuteurPlusTier(r))).toEqual([false, false, true, true]);
  expect(isArchivistPlusTier(null)).toBe(false);
  expect(isAuteurPlusTier({ tier: 'archivist', role: 'cinephile', is_founding: true })).toBe(true);
});

it('shows each rank by its name, a founder as an Auteur', () => {
  expect(['cinephile', 'archivist', 'auteur', 'founding', null, 'patron'].map(getDisplayTier)).toEqual(['CINEPHILE', 'ARCHIVIST', 'AUTEUR', 'AUTEUR', 'CINEPHILE', 'CINEPHILE']);
});
