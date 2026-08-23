/**
 * taste.test.ts — the rule that decides whether we are allowed to tell a member
 * who they are.
 *
 * The bug this whole pass removed was not a crash. It was a beautiful, confident,
 * WRONG answer: a "cinematic fingerprint" drawn from sixty films out of five
 * thousand, with nothing on screen admitting it. The films table can reproduce
 * that failure in a new place — on the first day it ships, a large archive is
 * mostly unread — so the readiness rule is the thing standing between us and
 * doing it again. It gets tested like it matters.
 */
import {
  tasteReadiness,
  coverageNote,
  TASTE_COVERAGE_FLOOR,
  type TasteProfile,
} from '../taste';

const profile = (films_total: number, films_known: number): TasteProfile => ({
  films_total,
  films_known,
  genres: [],
  actors: [],
  directors: [],
  countries: [],
  total_runtime: 0,
});

// The panels format numbers with `tally`; the note is tested against a stand-in
// so a change to thousands separators cannot break this file.
const plain = (n: number) => String(n);

describe('tasteReadiness — when a ranking is allowed to be drawn', () => {
  it('holds the line at exactly the floor, not just past it', () => {
    // 90 of 100 is exactly 0.9. A `>` instead of `>=` would fail only here.
    expect(tasteReadiness(profile(100, 90)).ready).toBe(true);
    expect(tasteReadiness(profile(100, 89)).ready).toBe(false);
  });

  it('refuses the exact failure this pass removed: 60 films out of 5,000', () => {
    const r = tasteReadiness(profile(5000, 60));
    expect(r.ready).toBe(false);
    expect(r.coverage).toBeCloseTo(0.012);
  });

  it('separates "ready" from "complete" so a partial answer must label itself', () => {
    const partial = tasteReadiness(profile(2481, 2315));
    expect(partial.ready).toBe(true);
    expect(partial.complete).toBe(false);

    const whole = tasteReadiness(profile(2481, 2481));
    expect(whole.ready).toBe(true);
    expect(whole.complete).toBe(true);
  });

  it('treats an empty archive as empty, not as unready', () => {
    // A member who has logged nothing should meet the section's own empty state,
    // not a loading spinner that never resolves.
    const r = tasteReadiness(profile(0, 0));
    expect(r).toEqual({ ready: false, coverage: 0, known: 0, total: 0, complete: false });
  });

  it('survives null and undefined without throwing', () => {
    for (const v of [null, undefined]) {
      expect(tasteReadiness(v).total).toBe(0);
      expect(tasteReadiness(v).ready).toBe(false);
    }
  });

  it('never reports coverage above 1, even if the server contradicts itself', () => {
    // known > total should be impossible. If it ever happens, "112% read" on a
    // members'-club screen is worse than the bug that caused it.
    const r = tasteReadiness(profile(100, 112));
    expect(r.coverage).toBeLessThanOrEqual(1);
    expect(r.known).toBe(100);
    expect(r.complete).toBe(true);
  });

  it('a non-numeric count reads as zero, and does not wedge the panel', () => {
    // Math.max(0, NaN) is NaN. Left unguarded, total===0 is false, coverage is
    // NaN, every comparison is false, and the panel says "reading your archive"
    // for ever with no error raised anywhere.
    const bad = { films_total: 'lots', films_known: undefined } as unknown as TasteProfile;
    const r = tasteReadiness(bad);
    expect(Number.isFinite(r.coverage)).toBe(true);
    expect(r.total).toBe(0);
    expect(r.known).toBe(0);
  });

  it('a negative count reads as zero rather than inverting the ratio', () => {
    const r = tasteReadiness(profile(-5, -2));
    expect(r.total).toBe(0);
    expect(r.coverage).toBe(0);
  });

  it('the floor is a ranking threshold, not a count threshold', () => {
    // Documented as deliberate: 0.9 not 1.0, so one unreadable film (a title
    // TMDB dropped — what sync_failed is for) cannot hide a whole profile.
    expect(TASTE_COVERAGE_FLOOR).toBeGreaterThan(0.5);
    expect(TASTE_COVERAGE_FLOOR).toBeLessThan(1);
  });
});

describe('coverageNote — the line that makes a partial answer honest', () => {
  it('appears exactly while the answer is real but incomplete', () => {
    expect(coverageNote(tasteReadiness(profile(2481, 2315)), plain))
      .toBe('from 2315 of your 2481 films');
  });

  it('says nothing once everything is read', () => {
    // "from 2,481 of your 2,481 films" is noise on a finished profile.
    expect(coverageNote(tasteReadiness(profile(2481, 2481)), plain)).toBeNull();
  });

  it('says nothing below the floor, where the section is not showing a ranking', () => {
    // Below the floor the panel renders its own "reading your archive" state
    // with the real progress; a second note there would contradict it.
    expect(coverageNote(tasteReadiness(profile(5000, 60)), plain)).toBeNull();
  });

  it('names both numbers, so the reader can judge it themselves', () => {
    const note = coverageNote(tasteReadiness(profile(1000, 950)), plain)!;
    expect(note).toContain('950');
    expect(note).toContain('1000');
  });
});
