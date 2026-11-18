/**
 * The catalogue is asked at its pace, and only what TMDB must answer is counted (review round 13).
 * ─────────────────────────────────────────────────────────────────────────────
 * The TMDB proxy let one address ask 120 times a minute, every question counted, the ones its
 * cache answered too. A member importing a few hundred films ran through it within a minute: the
 * import stopped with "check your connection", and every film page on the phone failed until the
 * minute was out, as it did for everyone behind the same carrier address. Now
 * supabase/functions/tmdb-proxy/rate.js counts only what TMDB must answer, per address, 1,200 at
 * once and then 20 a second; a caller refused is told when to ask again (Retry-After). Who asks is
 * never looked up: no question waits on the house's auth server.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { rateRule, ADDRESS_BURST } from '../../../../supabase/functions/tmdb-proxy/rate.js';
import { IMPORT_PACE } from '@/src/features/archive/archiveImport';

type Admit = (asked: { address: string; now: number }) => { ok: boolean; retryAfter?: number };

/** How many of `n` questions at `now` the rule lets through. */
const through = (admit: Admit, n: number, address: string, now: number) =>
  Array.from({ length: n }, () => admit({ address, now })).filter((v) => v.ok).length;

const PROXY = readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'functions', 'tmdb-proxy', 'index.ts'), 'utf8');

describe('the proxy\'s pace', () => {
  it('an address asks 1,200 at once, is then told when to ask again, and is let through as tokens come', () => {
    const admit = rateRule() as Admit;
    expect(through(admit, ADDRESS_BURST, '10.0.0.1', 0)).toBe(1200);
    expect(admit({ address: '10.0.0.1', now: 0 })).toEqual({ ok: false, retryAfter: 1 });
    // A twentieth of a second later, one more is due (20 a second), and the refusal took none.
    expect(admit({ address: '10.0.0.1', now: 50 })).toEqual({ ok: true });
    expect(admit({ address: '10.0.0.1', now: 50 }).ok).toBe(false);
  });

  it('one address\'s pace is not another\'s', () => {
    const admit = rateRule() as Admit;
    expect(through(admit, 1201, '100.64.0.9', 0)).toBe(1200);
    expect(through(admit, 30, '100.64.0.10', 0)).toBe(30);
  });

  it('an address asking without end is held at 1,200 a minute', () => {
    const admit = rateRule() as Admit;
    // Forty a second for two minutes: asked 4,800; the address lets 1,200 at once and 20 a second after.
    let let_ = 0;
    for (let s = 0; s < 120; s++) for (let m = 0; m < 40; m++) let_ += through(admit, 1, '198.51.100.7', s * 1000 + m * 25);
    expect(let_).toBeGreaterThanOrEqual(3550);
    expect(let_).toBeLessThanOrEqual(3650);
  });

  it('an archive import of 500 films, asked at the app\'s pace, is never told to wait', () => {
    const admit = rateRule() as Admit;
    const refused: number[] = [];
    for (let i = 0; i < 500; i++) {
      const now = i < IMPORT_PACE.burst ? 0 : Math.ceil(((i - IMPORT_PACE.burst + 1) * 1000) / IMPORT_PACE.perSecond);
      if (!admit({ address: '10.0.0.1', now }).ok) refused.push(i);
    }
    expect(refused).toEqual([]);
  });
});

/**
 * The website and TestFlight build 41 send the public key, as the app does: each question below is
 * one the proxy must take to TMDB (a miss), so these are the most each could cost.
 */
describe('the website and build 41, from one address', () => {
  /** When each question is asked: every instant, its count. */
  type Asked = { at: number; n: number }[];

  /** The website's import (src/utils/archiveImport.ts): four films at once, 300 ms between fours; every film asked with its year and, finding nothing, again without (the most it asks). Answers take no time: the fastest it can go. */
  const websiteImport = (films: number, from = 0): Asked =>
    Array.from({ length: Math.ceil(films / 4) }, (_, b) => ({ at: from + b * 300, n: Math.min(4, films - b * 4) * 2 }));

  /** The website's search: its first read, then every fallback at once (6 words dropped, 6 keywords, a discovery): 14, the most one search asks. */
  const websiteSearch = (at: number): Asked => [{ at, n: 14 }];

  /** Build 41's import: one film after another, 60 ms apart, each read 250 ms; one film in five found by no first read, so asked through every tier, with and without its year (27 more reads, in 7 steps). */
  const build41Import = (films: number): Asked => {
    const asked: Asked = [];
    let at = 0;
    for (let i = 0; i < films; i++) {
      asked.push({ at, n: 1 });
      at += 250;
      if (i % 5 === 4) {
        for (const n of [6, 6, 1, 1, 6, 6, 1]) { asked.push({ at, n }); at += 250; }
      }
      at += 60;
    }
    return asked;
  };

  /** Every question asked of one rule from one address, in time order: the ones refused. */
  const refusedOf = (...callers: Asked[]) => {
    const admit = rateRule() as Admit;
    const all = callers.flat().sort((a, b) => a.at - b.at);
    let refused = 0;
    for (const { at, n } of all) refused += n - through(admit, n, '198.51.100.20', at);
    const last = all[all.length - 1];
    expect(last).toBeDefined();
    return { refused, asked: all.reduce((s, a) => s + a.n, 0), lastAt: last!.at };
  };

  it('a website import of 500 films, every film asked twice, is never told to wait', () => {
    // 1,000 questions in 37.2 s: inside the address's first 1,200.
    expect(refusedOf(websiteImport(500))).toEqual({ refused: 0, asked: 1000, lastAt: 37_200 });
  });

  it('a website search in the middle of that import is never told to wait', () => {
    expect(refusedOf(websiteImport(500), websiteSearch(10_000), websiteSearch(20_000)).refused).toBe(0);
  });

  it('build 41\'s import of 500 films, and a website import beside it from the same address, are never told to wait', () => {
    const alone = refusedOf(build41Import(500));
    expect(alone.refused).toBe(0);
    expect(alone.asked).toBe(500 + 100 * 27);
    expect(refusedOf(build41Import(500), websiteImport(500)).refused).toBe(0);
  });
});

describe('the proxy itself', () => {
  it('asks the rule only for what its cache cannot answer', () => {
    const cache = PROXY.indexOf('const cached = getCached(cacheKey)');
    const rule = PROXY.indexOf('admit({');
    expect(cache).toBeGreaterThan(0);
    expect(rule).toBeGreaterThan(cache);
    expect(PROXY.split('admit({').length - 1).toBe(1);
  });

  it('never waits on the house\'s auth server to know who asks: a film page is TMDB\'s answer and no more', () => {
    expect(PROXY).not.toMatch(/auth\/v1|getUser|memberOf/);
  });

  it('tells a caller it refused when to ask again, and lets a website read it', () => {
    expect(PROXY).toMatch(/429, \{ 'Retry-After': String\(verdict\.retryAfter\) \}/);
    expect(PROXY).toMatch(/'Access-Control-Expose-Headers': 'Retry-After'/);
  });
});
