/**
 * tier.warning.test.ts — #48, the silent downgrade
 * ────────────────────────────────────────────────
 * normalizeTier used to swallow anything it did not recognise and return
 * 'cinephile'. The admin's row held tier='projectionist' — a tier removed from the
 * product — and the app reported cinephile with no error and no log.
 *
 * Harmless for that account, which is meant to be free. NOT harmless for a paying
 * member: a renamed plan, a typo from a payment webhook, or a tier the client does
 * not know yet drops them to free silently, and the only way anyone finds out is a
 * complaint.
 *
 * These tests assert the telemetry AND that the return value did not change — the
 * fix must be observable without being behavioural.
 */
import { normalizeTier, getTierWeight, resolveTier, __resetTierWarningsForTest } from '../tier';
import { logger } from '../logger';

jest.mock('../logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const warn = logger.warn as jest.Mock;

beforeEach(() => {
  warn.mockClear();
  __resetTierWarningsForTest();
});

describe('#48 — an unrecognised tier is reported, not swallowed', () => {
  it('warns for a value nobody expects', () => {
    normalizeTier('archivistt');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('archivistt');
  });

  it('warns for a tier that was removed from the product', () => {
    normalizeTier('projectionist');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('says out loud that a paying member would be downgraded', () => {
    normalizeTier('mystery_plan');
    expect(warn.mock.calls[0][0]).toMatch(/downgraded to free/i);
  });

  it('STILL returns cinephile — telemetry only, no behaviour change', () => {
    expect(normalizeTier('archivistt')).toBe('cinephile');
    expect(getTierWeight('archivistt')).toBe(0);
  });
});

describe('values that legitimately mean "no paid tier" stay silent', () => {
  it.each([undefined, null, '', 'free', 'cinephile'])('%p does not warn', (v) => {
    normalizeTier(v as string | null | undefined);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a real tier does not warn', () => {
    ['archivist', 'auteur', 'founding'].forEach(t => normalizeTier(t));
    expect(warn).not.toHaveBeenCalled();
  });

  it('the ADMIN role does not warn — scoring 0 is documented design', () => {
    // resolveTier feeds `role` through this function too, so 'admin' arrives here on
    // every resolve for the proprietor's account. Warning would fire constantly and
    // it is not a defect: user.ts:54-57 — "a duty, not a rank".
    normalizeTier('admin');
    resolveTier({ tier: 'cinephile', role: 'admin', is_founding: false });
    expect(warn).not.toHaveBeenCalled();
  });

  it('venue_owner does not warn either', () => {
    normalizeTier('venue_owner');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('the warning cannot flood', () => {
  it('reports each distinct value ONCE, however many times it is seen', () => {
    // 124 call sites, many per-render — without deduping, one bad row would bury
    // the signal under thousands of identical lines.
    for (let i = 0; i < 500; i++) normalizeTier('archivistt');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('still reports a DIFFERENT unknown value', () => {
    normalizeTier('archivistt');
    normalizeTier('auteurr');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('treats casing as the same value', () => {
    normalizeTier('Archivistt');
    normalizeTier('archivistt');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('the real-world case that prompted this', () => {
  it("the admin's old row would have been reported", () => {
    // role='admin', tier='projectionist' — the live state before the cleanup.
    // The tier is unknown (warn), the role is expected (silent), and the account
    // still resolves to cinephile exactly as before.
    expect(resolveTier({ tier: 'projectionist', role: 'admin', is_founding: false })).toBe('cinephile');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('projectionist');
  });

  it('a paying auteur is unaffected and silent', () => {
    expect(resolveTier({ tier: 'auteur', role: 'auteur', is_founding: false })).toBe('auteur');
    expect(warn).not.toHaveBeenCalled();
  });
});
