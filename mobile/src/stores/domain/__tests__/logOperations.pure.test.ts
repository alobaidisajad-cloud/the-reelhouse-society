/**
 * logOperations.pure.test.ts — Pure Logic Tests
 * ────────────────────────────────────────────────────────
 * Covers resolveFormat (physical-media → DB format code mapping) and
 * getCinephileStatsOp (the level/progress tiering shown on the profile
 * passport), both exported pure helpers from logOperations.ts that aren't
 * exercised by the existing offline-reconciliation test suite.
 */
import { resolveFormat, getCinephileStatsOp } from '../logSlice/helpers/logOperations';

describe('resolveFormat', () => {
  it('maps each known physical media label to its DB format code', () => {
    expect(resolveFormat('DVD')).toBe('dvd');
    expect(resolveFormat('Blu-Ray')).toBe('bluray');
    expect(resolveFormat('4K UHD')).toBe('4k');
    expect(resolveFormat('VHS')).toBe('vhs');
    expect(resolveFormat('Film Print')).toBe('filmprint');
  });

  it('falls back to "digital" for unknown, null, or undefined media', () => {
    expect(resolveFormat('Laserdisc')).toBe('digital');
    expect(resolveFormat(null)).toBe('digital');
    expect(resolveFormat(undefined)).toBe('digital');
    expect(resolveFormat('None')).toBe('digital');
  });
});

describe('getCinephileStatsOp', () => {
  const get = (count: number) => (() => ({ logs: Array.from({ length: count }) })) as any;
  const noopSet = (() => {}) as any;

  it('is FIRST REEL with zero progress at 0 logs', () => {
    const stats = getCinephileStatsOp(noopSet, get(0));
    expect(stats).toMatchObject({ count: 0, level: 'FIRST REEL', progress: 0 });
  });

  it('is THE INITIATE between 1 and 9 logs, progressing toward Regular', () => {
    expect(getCinephileStatsOp(noopSet, get(1))).toMatchObject({ level: 'THE INITIATE', progress: 0 });
    expect(getCinephileStatsOp(noopSet, get(5))).toMatchObject({ level: 'THE INITIATE', progress: 44 });
  });

  it('is THE REGULAR between 10 and 24 logs, progressing toward Devotee', () => {
    expect(getCinephileStatsOp(noopSet, get(10))).toMatchObject({ level: 'THE REGULAR', progress: 0 });
    expect(getCinephileStatsOp(noopSet, get(17))).toMatchObject({ level: 'THE REGULAR', progress: 47 });
  });

  it('is THE DEVOTEE between 25 and 99 logs, progressing toward Oracle', () => {
    expect(getCinephileStatsOp(noopSet, get(25))).toMatchObject({ level: 'THE DEVOTEE', progress: 0 });
    expect(getCinephileStatsOp(noopSet, get(62))).toMatchObject({ level: 'THE DEVOTEE', progress: 49 });
  });

  it('is THE ORACLE at 100+ logs, fully progressed', () => {
    expect(getCinephileStatsOp(noopSet, get(100))).toMatchObject({ level: 'THE ORACLE', progress: 100 });
    expect(getCinephileStatsOp(noopSet, get(500))).toMatchObject({ level: 'THE ORACLE', progress: 100 });
  });

  it('uses overrideCount instead of the actual logs length when provided', () => {
    const stats = getCinephileStatsOp(noopSet, get(2), 100);
    expect(stats).toMatchObject({ count: 100, level: 'THE ORACLE', progress: 100 });
  });
});
