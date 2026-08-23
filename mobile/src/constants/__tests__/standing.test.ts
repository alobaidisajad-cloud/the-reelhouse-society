/**
 * standing.test.ts — the app must call a member ONE thing.
 *
 * There were three ladders. At sixty films the Projector Room crowned a member
 * THE ORACLE while the badge grid on the same screen showed The Oracle locked,
 * and the film store called them THE DEVOTEE. At zero films all three
 * congratulated them on FIRST REEL — a badge that requires one.
 *
 * These are not tests of an implementation. They pin the AGREEMENT.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { STANDING_LADDER, standingFor, rungAt } from '../standing';

const ROOT = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('the ladder and the badge grid tell the same story', () => {
  /**
   * Read out of the badge grid itself, not copied. The grid shows the member a
   * PROMISE — "Log 100 films" — and a rank that contradicts a printed promise
   * is the rank that is wrong. If someone edits that sentence, this fails.
   */
  const badges = read('src/components/profile/Achievements.tsx');
  const promises = [...badges.matchAll(/title:\s*'([^']+)',\s*\n\s*desc:\s*'Log (?:your )?(\d+|first) films?'/g)]
    .map((m) => ({ title: m[1], at: m[2] === 'first' ? 1 : Number(m[2]) }));

  it('finds the promises at all', () => {
    // A regex that matched nothing would make every assertion below vacuous.
    expect(promises.length).toBeGreaterThanOrEqual(4);
  });

  it('every badge that promises a film count sits on the ladder at that count', () => {
    const disagreements = promises
      .filter((p) => rungAt(p.title) !== p.at)
      .map((p) => `${p.title}: the grid promises ${p.at}, the ladder says ${rungAt(p.title)}`);
    expect(disagreements).toEqual([]);
  });

  it('the badge checks read their thresholds from the ladder, not from literals', () => {
    // The thresholds must not be typed out again in the grid — that is exactly
    // how the two drifted apart the first time.
    const counts = badges.match(/desc: 'Log (?:your )?(\d+|first) films?'/g) ?? [];
    for (const c of counts) {
      const n = /(\d+)/.exec(c)?.[1];
      if (!n) continue;
      // The number may appear in the DESCRIPTION (it is the promise) but never
      // in the check beside it.
      const check = badges.slice(badges.indexOf(c), badges.indexOf(c) + 400);
      expect(check).toMatch(/rungAt\(/);
      expect(check).not.toMatch(new RegExp(`>=\\s*${n}\\b`));
    }
  });
});

describe('the rung at zero', () => {
  it('is not a badge — nothing has been earned yet', () => {
    // The whole point. FIRST REEL is earned at one film, so it cannot also be
    // what a member is called before logging any.
    expect(standingFor(0).name).toBe('UNSEATED');
    expect(standingFor(0).name).not.toBe('FIRST REEL');
    expect(rungAt('UNSEATED')).toBe(0);
  });

  it('becomes FIRST REEL the moment a film is logged', () => {
    expect(standingFor(1).name).toBe('FIRST REEL');
  });
});

describe('a member is never promoted early or late', () => {
  it.each(STANDING_LADDER.map((r) => [r.at, r.name]))('at exactly %i films the standing is %s', (at, name) => {
    expect(standingFor(at as number).name).toBe(name);
  });

  it.each(STANDING_LADDER.filter((r) => r.at > 0).map((r) => [r.at, r.name]))(
    'one film short of %i is NOT yet %s', (at, name) => {
      expect(standingFor((at as number) - 1).name).not.toBe(name);
    },
  );

  it('the ladder ascends and never repeats a threshold', () => {
    for (let i = 1; i < STANDING_LADDER.length; i++) {
      expect(STANDING_LADDER[i].at).toBeGreaterThan(STANDING_LADDER[i - 1].at);
    }
  });

  it('every rung has a distinct name', () => {
    const names = STANDING_LADDER.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('progress means distance along the CURRENT rung', () => {
  it('is never the old sawtooth', () => {
    // `(films % 20) * 5` reset to zero every twenty films, so it read 95% at
    // nineteen and 0% at twenty — while the rank name moved at neither. Worst
    // of all it showed EMPTY for a member with 2,481 films.
    expect(standingFor(2481).progress).toBe(100);
    expect(standingFor(60).progress).toBeGreaterThan(0);
    expect(standingFor(20).progress).toBeGreaterThan(0);
  });

  it('rises monotonically within a rung and never exceeds 100', () => {
    let last = -1;
    for (let n = 25; n <= 99; n++) {
      const p = standingFor(n).progress;
      expect(p).toBeGreaterThanOrEqual(last);
      expect(p).toBeLessThanOrEqual(100);
      last = p;
    }
  });

  it('is 0 at the foot of a rung', () => {
    for (const rung of STANDING_LADDER) {
      if (rung.at === STANDING_LADDER[STANDING_LADDER.length - 1].at) continue;
      expect(standingFor(rung.at).progress).toBe(0);
    }
  });

  it('counts down the films still to log, and reaches zero at the next rung', () => {
    expect(standingFor(90).toNext).toBe(10);
    expect(standingFor(99).toNext).toBe(1);
    expect(standingFor(100).toNext).toBe(0);
  });
});

describe('the top of the ladder', () => {
  it('is flagged, so a room can draw NO bar rather than a full one', () => {
    // A full bar still reads as "distance remaining". The Projector Room is
    // required to omit it entirely — this flag is how it knows.
    expect(standingFor(100).isHighest).toBe(true);
    expect(standingFor(99999).isHighest).toBe(true);
    expect(standingFor(99).isHighest).toBe(false);
  });

  it('has no next rung to point at', () => {
    expect(standingFor(100).next).toBeNull();
  });
});

describe('nonsense in, something sane out', () => {
  /**
   * Every unusable input lands on the FLOOR, never the top.
   *
   * Infinity resolving to UNSEATED rather than THE ORACLE is deliberate, and I
   * had the expectation the wrong way round first. A count that arrives broken
   * should never CROWN anybody — under-claiming a rank is a shrug, over-claiming
   * it is the app lying about an honour. Same reasoning as NaN.
   */
  it.each([
    [-1, 'UNSEATED'], [0, 'UNSEATED'],
    [NaN, 'UNSEATED'], [Infinity, 'UNSEATED'], [-Infinity, 'UNSEATED'],
    [3.7, 'FIRST REEL'],
  ])('%p resolves to %s', (input, expected) => {
    expect(standingFor(input as number).name).toBe(expected);
  });

  it('never returns a progress outside 0–100, whatever it is handed', () => {
    for (const n of [-5, 0, 1, 9, 10, 24, 25, 99, 100, 1e6, NaN]) {
      const p = standingFor(n).progress;
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
  });

  it('an unknown name has no rung rather than accidentally having rung zero', () => {
    // Returning 0 would silently unlock a badge for every member alive.
    expect(rungAt('THE INITIATE')).toBe(Number.MAX_SAFE_INTEGER);
    expect(rungAt('')).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('no room keeps a ladder of its own any more', () => {
  it.each([
    'src/components/profile/profileComputed.ts',
    'src/stores/domain/logSlice/helpers/logOperations.ts',
  ])('%s reads the shared one', (f) => {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(src).toMatch(/standingFor\(/);
    // The names that used to be written out here.
    expect(src).not.toMatch(/'THE ORACLE'|'MIDNIGHT DEVOTEE'|'THE INITIATE'|'THE DEVOTEE'/);
  });
});
