/**
 * THE PARTICULARS — what the hero does not already say.
 *
 * Over half of this used to repeat the hero four hundred points further up the
 * page. What it gains instead are the two facts the page spent whole sections
 * on: the certificate and the studio.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { FilmDossier, formatMoney, languageName } from '../FilmDossier';
import { isAhead, oneDash, releaseOf, yearOf } from '../releaseOf';

const film = {
  genres: [{ id: 1, name: 'Adventure' }],
  release_date: '2026-07-15',
  runtime: 173,
  status: 'Released',
  original_language: 'en',
  budget: 250_000_000,
  revenue: 1_446_200_000,
};

const base = {
  film,
  formatRuntime: (n?: number | null) => `${Math.floor((n ?? 0) / 60)}h ${(n ?? 0) % 60}m`,
  studios: [{ name: 'Universal Pictures' }, { name: 'Syncopy' }],
  certificate: { value: '15', region: 'GB' },
};

describe('it stops repeating the hero', () => {
  const t = () => render(<FilmDossier {...base} />);

  it('does not print the genres again', () => {
    expect(t().queryByText('GENRES')).toBeNull();
  });

  it('does not print the runtime again', () => {
    expect(t().queryByText('RUNTIME')).toBeNull();
  });

  it("drops STATUS, which told nobody anything", () => {
    expect(t().queryByText('STATUS')).toBeNull();
  });
});

describe('what it gained', () => {
  it('carries the certificate WITH the region it belongs to', () => {
    // A bare "15" quietly tells a member in Manchester an American rating is
    // theirs. The region always travels with the value.
    expect(render(<FilmDossier {...base} />).getByText('15  ·  GB')).toBeTruthy();
  });

  it('hides the row entirely when nothing is rated', () => {
    const t = render(<FilmDossier {...base} certificate={null} />);
    expect(t.getByText('Universal Pictures, Syncopy')).toBeTruthy(); // the dossier is drawn without it
    expect(t.queryByText('CERTIFICATE')).toBeNull();
  });

  it('carries the studio, absorbing the two-logo rail', () => {
    expect(render(<FilmDossier {...base} />).getByText('Universal Pictures, Syncopy')).toBeTruthy();
  });

  it('hides the studio row rather than printing an empty one', () => {
    const t = render(<FilmDossier {...base} studios={[]} />);
    expect(t.queryByText('STUDIO')).toBeNull();
    expect(t.getByText('LANGUAGE')).toBeTruthy();
  });
});

describe('numbers a person would actually write', () => {
  it('writes a billion as a billion', () => {
    // `$1446.2M` is the database talking.
    expect(formatMoney(1_446_200_000)).toBe('$1.45B');
    expect(render(<FilmDossier {...base} />).getByText('$1.45B')).toBeTruthy();
  });

  it('keeps millions in millions', () => {
    expect(formatMoney(250_000_000)).toBe('$250.0M');
  });

  it('shows nothing at all rather than $0.0M', () => {
    expect(formatMoney(0)).toBeUndefined();
    expect(formatMoney(null)).toBeUndefined();
    const t = render(<FilmDossier {...base} film={{ ...film, budget: 0, revenue: 0 }} />);
    expect(t.queryByText('BUDGET')).toBeNull();
    expect(t.queryByText('TAKINGS')).toBeNull();
  });
});

describe('a language reads as a word', () => {
  it('names the common ones', () => {
    expect(languageName('en')).toBe('English');
    expect(languageName('ja')).toBe('Japanese');
    expect(render(<FilmDossier {...base} />).getByText('English')).toBeTruthy();
  });

  it('keeps the code rather than inventing a name we do not have', () => {
    expect(languageName('xx')).toBe('XX');
  });

  it('hides the row when there is no language at all', () => {
    const t = render(<FilmDossier {...base} film={{ ...film, original_language: undefined }} />);
    expect(t.queryByText('LANGUAGE')).toBeNull();
    expect(t.getByText(/^STUDIOS?$/)).toBeTruthy();
  });
});

describe('it is ruled, not framed', () => {
  it('has no bordered card around it', () => {
    // It was the only framed block on an otherwise open page and looked
    // imported from another app.
    const json = JSON.stringify(render(<FilmDossier {...base} />).toJSON());
    expect(json).not.toContain('borderRadius":4');
    expect(json).not.toContain('shadowRadius":10');
  });

  it('rules each row instead', () => {
    const json = JSON.stringify(render(<FilmDossier {...base} />).toJSON());
    expect(json).toContain('borderBottomWidth":1');
  });
});

describe('a release is said as it is', () => {
  const TODAY = '2026-11-06';

  it('a date passed is the RELEASE; a date still ahead is when it OPENS', () => {
    expect(releaseOf({ release_date: '2026-07-15', status: 'Released' }, TODAY)).toEqual({ label: 'RELEASE', value: 'JULY 15, 2026' });
    expect(releaseOf({ release_date: '2026-11-06', status: 'Released' }, TODAY)).toEqual({ label: 'RELEASE', value: 'NOVEMBER 6, 2026' });
    expect(releaseOf({ release_date: '2026-11-07', status: 'Post Production' }, TODAY)).toEqual({ label: 'OPENS', value: 'NOVEMBER 7, 2026' });
    // TMDB's status is not the clock's: a film it still files as in production has opened once its day has come.
    expect(releaseOf({ release_date: '2026-01-02', status: 'Post Production' }, TODAY)!.label).toBe('RELEASE');
  });

  it('a bare year is ahead only when its year is', () => {
    expect(isAhead('2026', TODAY)).toBe(false);
    expect(isAhead('2027', TODAY)).toBe(true);
    expect(isAhead('', TODAY)).toBe(false);
    expect(isAhead('not a date', TODAY)).toBe(false);
  });

  it('1895 is 1895, on every clock', () => {
    expect(releaseOf({ release_date: '1895-12-28' }, TODAY)).toEqual({ label: 'RELEASE', value: 'DECEMBER 28, 1895' });
    expect(yearOf({ release_date: '1895-12-28' })).toBe('1895');
  });

  it('no date says why when TMDB says why, and nothing when it does not', () => {
    expect(releaseOf({ release_date: '', status: 'Planned' }, TODAY)).toEqual({ label: 'RELEASE', value: 'Planned' });
    expect(releaseOf({ release_date: null, status: 'In Production' }, TODAY)).toEqual({ label: 'RELEASE', value: 'In production' });
    expect(releaseOf({ release_date: '', status: 'Released' }, TODAY)).toBeNull();
    expect(releaseOf({}, TODAY)).toBeNull();
    expect(yearOf({ release_date: '', status: 'Post Production' })).toBe('IN POST-PRODUCTION');
    expect(yearOf({ release_date: '', status: 'Released' })).toBe('—');
    expect(yearOf({})).toBe('—');
  });

  it('a cancelled film is cancelled, whatever date it once had', () => {
    expect(releaseOf({ release_date: '2027-03-01', status: 'Canceled' }, TODAY)).toEqual({ label: 'RELEASE', value: 'Cancelled' });
    expect(yearOf({ release_date: '2027-03-01', status: 'Canceled' })).toBe('2027');
  });

  it('the particulars draw the row it gives', () => {
    const t = render(<FilmDossier {...base} film={{ ...film, release_date: '2031-07-16', status: 'Post Production' }} />);
    expect(t.getByText('OPENS')).toBeTruthy();
    expect(t.queryByText('RELEASE')).toBeNull();
    const none = render(<FilmDossier {...base} film={{ ...film, release_date: '', status: 'Released' }} />);
    expect(none.queryByText('RELEASE')).toBeNull();
    expect(none.queryByText('OPENS')).toBeNull();
  });

  it('particulars none of which is known are one dash', () => {
    expect(oneDash(['—', '—'])).toEqual(['—']);
    expect(oneDash(['—', '1895'])).toEqual(['—', '1895']);
    expect(oneDash(['2H 53M', '2026'])).toEqual(['2H 53M', '2026']);
  });
});
