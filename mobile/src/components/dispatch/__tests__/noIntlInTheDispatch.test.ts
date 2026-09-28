/**
 * noIntlInTheDispatch.test.ts — the formatting that works everywhere but here.
 * ─────────────────────────────────────────────────────────────────────────────
 * Hermes ships without Intl and this app carries no polyfill. Node has a full
 * one. So anything routed through Intl is correct in every test on this machine
 * and wrong on every phone — silently, with no error to catch and nothing in a
 * screenshot to notice.
 *
 * `dayLabel.ts` was written to avoid exactly this for DATES. Nobody had looked
 * at the NUMBERS, and three `toLocaleString()` calls had gone in: the word count
 * under a dossier, and the over-limit warning in the writing room twice. On
 * device they printed `24310` where the design says `24,310`.
 *
 * THE RULE is the app-wide lint rule now (eslint.config.js: no `Intl.`, no
 * `toLocale…String`), which reaches every file — this file's own sweep reached
 * the Dispatch alone, while the log's calendar, the Lounge's clock and the
 * person page went on asking Intl beside it. THE REPLACEMENT is held here,
 * because a rule is worth nothing against a `groupDigits` that returns the
 * wrong string.
 */
import { groupDigits, formatCount } from '@/src/components/dispatch/paper/paperMetrics';

describe('groupDigits', () => {
  it('groups in threes', () => {
    expect(groupDigits(0)).toBe('0');
    expect(groupDigits(7)).toBe('7');
    expect(groupDigits(999)).toBe('999');
    expect(groupDigits(1000)).toBe('1,000');
    expect(groupDigits(24310)).toBe('24,310');
    expect(groupDigits(999999)).toBe('999,999');
    expect(groupDigits(1234567)).toBe('1,234,567');
  });

  it('keeps a minus sign outside the digits', () => {
    expect(groupDigits(-1234)).toBe('-1,234');
  });

  it('truncates rather than printing a grouped decimal', () => {
    // The one-line regex version of this groups the digits AFTER the point too,
    // turning 1234.5678 into 1,234.567,8.
    expect(groupDigits(1234.5678)).toBe('1,234');
  });

  it('is not formatCount — one groups, the other abbreviates', () => {
    // Both exist on purpose. A character count must be exact ("1,204 over"); a
    // certify count on a card must not be six digits wide.
    expect(groupDigits(24310)).toBe('24,310');
    expect(formatCount(24310)).toBe('24K');
  });
});
