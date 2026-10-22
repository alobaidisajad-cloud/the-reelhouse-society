import { countryLabel, countryName } from '../countryName';

describe('a country is said by its name, never its code', () => {
  it('in a sentence, with the "the" English gives it', () => {
    expect(countryName('IQ')).toBe('Iraq');
    expect(countryName('GB')).toBe('the United Kingdom');
    expect(countryName('us')).toBe('the United States');
  });

  it('standing alone as a label, without it', () => {
    expect(countryLabel('GB')).toBe('United Kingdom');
    expect(countryLabel('DE')).toBe('Germany');
  });

  it('a code the list does not hold is said as it came, never as nothing', () => {
    expect(countryName('ZZ')).toBe('ZZ');
    expect(countryLabel('zz')).toBe('ZZ');
  });

  it('names every region TMDB lists watch providers for', () => {
    // TMDB's /watch/providers/regions, as of 2026
    const regions = 'AD AE AG AL AO AR AT AU AZ BA BB BE BF BG BH BM BO BR BS BY BZ CA CD CH CI CL CM CO CR CU CV CY CZ DE DK DO DZ EC EE EG ES FI FJ FR GB GF GG GH GI GQ GR GT GY HK HN HR HU ID IE IL IN IQ IS IT JM JO JP KE KR KW LB LC LI LT LU LV LY MA MC MD ME MG MK ML MT MU MW MX MY MZ NE NG NI NL NO NZ OM PA PE PF PG PH PK PL PS PT PY QA RO RS RU SA SC SE SG SI SK SM SN SV TC TD TH TN TR TT TW TZ UA UG US UY VA VE XK YE ZA ZM ZW'.split(' ');
    expect(regions.filter((r) => countryName(r) === r)).toEqual([]);
  });
});
