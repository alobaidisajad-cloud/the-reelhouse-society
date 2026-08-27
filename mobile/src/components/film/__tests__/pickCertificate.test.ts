/**
 * Whose age rating is this?
 *
 * A film page that prints a certificate without saying which country it
 * belongs to is quietly telling a member in Manchester that an American rating
 * applies to them. So the region always travels with the value, and the order
 * of preference is pinned here rather than left to whatever TMDB returned first.
 */
import { pickCertificate } from '../pickCertificate';

const releases = {
  results: [
    { iso_3166_1: 'US', release_dates: [{ certification: 'R' }] },
    { iso_3166_1: 'GB', release_dates: [{ certification: '15' }] },
    { iso_3166_1: 'FR', release_dates: [{ certification: '12' }] },
    { iso_3166_1: 'DE', release_dates: [{ certification: '16' }] },
  ],
};

describe('which region wins', () => {
  it("prefers the member's own region above everything", () => {
    expect(pickCertificate(releases, 'US', 'DE')).toEqual({ value: '16', region: 'DE' });
  });

  it("falls to the film's country of origin — the rating its makers were given", () => {
    expect(pickCertificate(releases, 'FR', null)).toEqual({ value: '12', region: 'FR' });
  });

  it('then GB, then US, which is what the copy is written for', () => {
    expect(pickCertificate(releases, null, null)).toEqual({ value: '15', region: 'GB' });
    const noGb = { results: releases.results.filter((r) => r.iso_3166_1 !== 'GB') };
    expect(pickCertificate(noGb, null, null)).toEqual({ value: 'R', region: 'US' });
  });

  it('takes anything at all rather than nothing, and takes it DETERMINISTICALLY', () => {
    const obscure = {
      results: [
        { iso_3166_1: 'SE', release_dates: [{ certification: '15' }] },
        { iso_3166_1: 'DK', release_dates: [{ certification: 'A' }] },
      ],
    };
    // Sorted, so the same film never shows two different certificates on two
    // runs because TMDB reordered its array.
    expect(pickCertificate(obscure, null, null)).toEqual({ value: 'A', region: 'DK' });
    const reversed = { results: [...obscure.results].reverse() };
    expect(pickCertificate(reversed, null, null)).toEqual({ value: 'A', region: 'DK' });
  });
});

describe('what counts as having no certificate', () => {
  it('ignores a region that is present but blank — several always are', () => {
    const blanks = {
      results: [
        { iso_3166_1: 'US', release_dates: [{ certification: '' }, { certification: '   ' }] },
        { iso_3166_1: 'GB', release_dates: [{ certification: '15' }] },
      ],
    };
    expect(pickCertificate(blanks, null, null)).toEqual({ value: '15', region: 'GB' });
  });

  it('takes the first non-empty entry WITHIN a region', () => {
    const mixed = {
      results: [{ iso_3166_1: 'GB', release_dates: [{ certification: null }, { certification: '18' }] }],
    };
    expect(pickCertificate(mixed, null, null)).toEqual({ value: '18', region: 'GB' });
  });

  it('returns null rather than an empty row when nothing is rated', () => {
    expect(pickCertificate(null, 'GB', 'GB')).toBeNull();
    expect(pickCertificate({ results: [] }, 'GB', 'GB')).toBeNull();
    expect(pickCertificate({ results: [{ iso_3166_1: 'GB', release_dates: [] }] }, null, null)).toBeNull();
    // The row is hidden entirely by FilmDossier when this is null — a
    // CERTIFICATE line reading "—" is worse than no line.
  });

  it('survives a payload that is not the shape we were promised', () => {
    expect(pickCertificate(undefined, null, null)).toBeNull();
    expect(pickCertificate({} as never, null, null)).toBeNull();
    expect(pickCertificate({ results: [{}] } as never, null, null)).toBeNull();
  });
});
