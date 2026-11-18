/**
 * A film read early is read again (review round 13).
 * ─────────────────────────────────────────────────────────────────────────────
 * A film is noted when a member first keeps it, often while it is only announced, and sync-films
 * read it once: read before TMDB had its cast, director and genres, it stayed blank for good, and
 * every Taste DNA that held it left it out while saying it was whole. Now each read decides when
 * the next is due (supabase/functions/sync-films/reread.js): a film not yet settled after its
 * release is read again when it has, and one still missing its details is read again a few times
 * before it is taken as TMDB has it. The claim and the taste's count of known films are the
 * house's (H-C5, rehearsed in SQL); this is the rule that decides each read.
 */
import { hasDetails, MAX_READS, nextRead, releaseDateOf } from '../../../../supabase/functions/sync-films/reread.js';

const DAY = 24 * 60 * 60 * 1000;
const at = (iso: string) => Date.parse(iso);
const whole = { genres: ['Drama'], director_id: 9, cast_ids: [7] };
const blank = { genres: [], director_id: null, cast_ids: [] };

describe('when a film is read again', () => {
  it('announced, it is read again once it has settled after its release, however full it looks', () => {
    const now = at('2026-11-18T00:00:00Z');
    const r = nextRead({ film: whole, release: '2026-12-25', reads: null, now });
    expect(r).toEqual({ release_date: '2026-12-25', sync_reads: 0, reread_after: '2027-01-24T00:00:00.000Z' });
  });

  it('announced far ahead, it is looked at within ninety days, so a date that moves is seen', () => {
    const now = at('2026-11-18T00:00:00Z');
    const r = nextRead({ film: blank, release: '2029-05-01', reads: null, now });
    expect(r.reread_after).toBe(new Date(now + 90 * DAY).toISOString());
    expect(r.sync_reads).toBe(0);
  });

  it('settled with its genres, director and cast, it is never read again', () => {
    const r = nextRead({ film: whole, release: '1999-05-01', reads: null, now: at('2026-11-18T00:00:00Z') });
    expect(r).toEqual({ release_date: '1999-05-01', sync_reads: 1, reread_after: null });
  });

  it('settled and still blank, it is read again in two weeks, and taken as TMDB has it after the third read', () => {
    const now = at('2026-11-18T00:00:00Z');
    const first = nextRead({ film: blank, release: '2026-06-01', reads: null, now });
    expect(first).toEqual({ release_date: '2026-06-01', sync_reads: 1, reread_after: new Date(now + 14 * DAY).toISOString() });
    const second = nextRead({ film: blank, release: '2026-06-01', reads: first.sync_reads, now });
    expect(second.sync_reads).toBe(2);
    expect(second.reread_after).not.toBeNull();
    const third = nextRead({ film: blank, release: '2026-06-01', reads: second.sync_reads, now });
    expect(third).toEqual({ release_date: '2026-06-01', sync_reads: MAX_READS, reread_after: null });
  });

  it('a film TMDB dates nowhere is not settled: looked at every ninety days, its reads never spent, until it has a date', () => {
    const now = at('2026-11-18T00:00:00Z');
    const slow = new Date(now + 90 * DAY).toISOString();
    expect(nextRead({ film: whole, release: '', reads: null, now })).toEqual({ release_date: null, sync_reads: 0, reread_after: slow });
    // Two years of looking spend nothing: the day it is released, it is read as any other.
    let reads = 0;
    for (let i = 0; i < 8; i++) reads = nextRead({ film: blank, release: undefined, status: 'Planned', reads, now }).sync_reads;
    expect(reads).toBe(0);
    expect(nextRead({ film: whole, release: '2028-01-05', status: 'Released', reads, now: at('2028-03-01T00:00:00Z') }))
      .toEqual({ release_date: '2028-01-05', sync_reads: 1, reread_after: null });
  });

  it('a film TMDB calls anything but Released is not settled, whatever its date', () => {
    const now = at('2026-11-18T00:00:00Z');
    for (const status of ['Rumored', 'Planned', 'In Production', 'Post Production']) {
      expect(nextRead({ film: whole, release: '2020-01-01', status, reads: 1, now }))
        .toEqual({ release_date: '2020-01-01', sync_reads: 1, reread_after: new Date(now + 90 * DAY).toISOString() });
    }
  });

  it('a film TMDB calls Canceled will never come: it is taken as TMDB has it', () => {
    const now = at('2026-11-18T00:00:00Z');
    expect(nextRead({ film: blank, release: '', status: 'Canceled', reads: 2, now }))
      .toEqual({ release_date: null, sync_reads: 3, reread_after: null });
  });
});

describe('what a read keeps', () => {
  it('a film has its details when it has genres, a director and a cast, all three', () => {
    expect(hasDetails(whole)).toBe(true);
    expect([
      hasDetails({ ...whole, genres: [] }),
      hasDetails({ ...whole, director_id: null }),
      hasDetails({ ...whole, cast_ids: [] }),
    ]).toEqual([false, false, false]);
  });

  it.each([
    ['2026-02-30', null],
    ['2026-1-5', null],
    ['1850-01-01', null],
    ['', null],
    [null, null],
    ['1927-09-23', '1927-09-23'],
  ])('TMDB\'s release date %p is kept as %p', (raw, kept) => {
    expect(releaseDateOf(raw)).toBe(kept);
  });
});
