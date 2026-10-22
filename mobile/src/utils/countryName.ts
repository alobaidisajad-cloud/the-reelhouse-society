/**
 * countryName — a country's name from its two-letter code (ISO 3166-1 alpha-2).
 *
 * The film page said "Nothing is listed to stream, rent or buy in IQ" and "LISTED FOR GB":
 * the code TMDB keys its watch providers by, which a member should never have to decode.
 * Intl.DisplayNames would name it, but Hermes ships without its region data, so the house
 * keeps its own list: the short English name each country is known by. A code the list does
 * not hold is said as it came, never as nothing.
 */
const NAMES: Record<string, string> = {
  AD: 'Andorra', AE: 'the United Arab Emirates', AF: 'Afghanistan', AG: 'Antigua and Barbuda', AI: 'Anguilla',
  AL: 'Albania', AM: 'Armenia', AO: 'Angola', AQ: 'Antarctica', AR: 'Argentina', AS: 'American Samoa', AT: 'Austria',
  AU: 'Australia', AW: 'Aruba', AX: 'the Åland Islands', AZ: 'Azerbaijan', BA: 'Bosnia and Herzegovina', BB: 'Barbados',
  BD: 'Bangladesh', BE: 'Belgium', BF: 'Burkina Faso', BG: 'Bulgaria', BH: 'Bahrain', BI: 'Burundi', BJ: 'Benin',
  BL: 'Saint Barthélemy', BM: 'Bermuda', BN: 'Brunei', BO: 'Bolivia', BQ: 'the Caribbean Netherlands', BR: 'Brazil',
  BS: 'the Bahamas', BT: 'Bhutan', BV: 'Bouvet Island', BW: 'Botswana', BY: 'Belarus', BZ: 'Belize', CA: 'Canada',
  CC: 'the Cocos Islands', CD: 'the Democratic Republic of the Congo', CF: 'the Central African Republic',
  CG: 'the Republic of the Congo', CH: 'Switzerland', CI: 'Côte d’Ivoire', CK: 'the Cook Islands', CL: 'Chile',
  CM: 'Cameroon', CN: 'China', CO: 'Colombia', CR: 'Costa Rica', CU: 'Cuba', CV: 'Cape Verde', CW: 'Curaçao',
  CX: 'Christmas Island', CY: 'Cyprus', CZ: 'the Czech Republic', DE: 'Germany', DJ: 'Djibouti', DK: 'Denmark',
  DM: 'Dominica', DO: 'the Dominican Republic', DZ: 'Algeria', EC: 'Ecuador', EE: 'Estonia', EG: 'Egypt',
  EH: 'Western Sahara', ER: 'Eritrea', ES: 'Spain', ET: 'Ethiopia', FI: 'Finland', FJ: 'Fiji', FK: 'the Falkland Islands',
  FM: 'Micronesia', FO: 'the Faroe Islands', FR: 'France', GA: 'Gabon', GB: 'the United Kingdom', GD: 'Grenada',
  GE: 'Georgia', GF: 'French Guiana', GG: 'Guernsey', GH: 'Ghana', GI: 'Gibraltar', GL: 'Greenland', GM: 'the Gambia',
  GN: 'Guinea', GP: 'Guadeloupe', GQ: 'Equatorial Guinea', GR: 'Greece', GS: 'South Georgia', GT: 'Guatemala',
  GU: 'Guam', GW: 'Guinea-Bissau', GY: 'Guyana', HK: 'Hong Kong', HM: 'the Heard and McDonald Islands', HN: 'Honduras',
  HR: 'Croatia', HT: 'Haiti', HU: 'Hungary', ID: 'Indonesia', IE: 'Ireland', IL: 'Israel', IM: 'the Isle of Man',
  IN: 'India', IO: 'the British Indian Ocean Territory', IQ: 'Iraq', IR: 'Iran', IS: 'Iceland', IT: 'Italy', JE: 'Jersey',
  JM: 'Jamaica', JO: 'Jordan', JP: 'Japan', KE: 'Kenya', KG: 'Kyrgyzstan', KH: 'Cambodia', KI: 'Kiribati', KM: 'the Comoros',
  KN: 'Saint Kitts and Nevis', KP: 'North Korea', KR: 'South Korea', KW: 'Kuwait', KY: 'the Cayman Islands',
  KZ: 'Kazakhstan', LA: 'Laos', LB: 'Lebanon', LC: 'Saint Lucia', LI: 'Liechtenstein', LK: 'Sri Lanka', LR: 'Liberia',
  LS: 'Lesotho', LT: 'Lithuania', LU: 'Luxembourg', LV: 'Latvia', LY: 'Libya', MA: 'Morocco', MC: 'Monaco', MD: 'Moldova',
  ME: 'Montenegro', MF: 'Saint Martin', MG: 'Madagascar', MH: 'the Marshall Islands', MK: 'North Macedonia', ML: 'Mali',
  MM: 'Myanmar', MN: 'Mongolia', MO: 'Macao', MP: 'the Northern Mariana Islands', MQ: 'Martinique', MR: 'Mauritania',
  MS: 'Montserrat', MT: 'Malta', MU: 'Mauritius', MV: 'the Maldives', MW: 'Malawi', MX: 'Mexico', MY: 'Malaysia',
  MZ: 'Mozambique', NA: 'Namibia', NC: 'New Caledonia', NE: 'Niger', NF: 'Norfolk Island', NG: 'Nigeria', NI: 'Nicaragua',
  NL: 'the Netherlands', NO: 'Norway', NP: 'Nepal', NR: 'Nauru', NU: 'Niue', NZ: 'New Zealand', OM: 'Oman', PA: 'Panama',
  PE: 'Peru', PF: 'French Polynesia', PG: 'Papua New Guinea', PH: 'the Philippines', PK: 'Pakistan', PL: 'Poland',
  PM: 'Saint Pierre and Miquelon', PN: 'the Pitcairn Islands', PR: 'Puerto Rico', PS: 'Palestine', PT: 'Portugal',
  PW: 'Palau', PY: 'Paraguay', QA: 'Qatar', RE: 'Réunion', RO: 'Romania', RS: 'Serbia', RU: 'Russia', RW: 'Rwanda',
  SA: 'Saudi Arabia', SB: 'the Solomon Islands', SC: 'Seychelles', SD: 'Sudan', SE: 'Sweden', SG: 'Singapore',
  SH: 'Saint Helena', SI: 'Slovenia', SJ: 'Svalbard and Jan Mayen', SK: 'Slovakia', SL: 'Sierra Leone', SM: 'San Marino',
  SN: 'Senegal', SO: 'Somalia', SR: 'Suriname', SS: 'South Sudan', ST: 'São Tomé and Príncipe', SV: 'El Salvador',
  SX: 'Sint Maarten', SY: 'Syria', SZ: 'Eswatini', TC: 'the Turks and Caicos Islands', TD: 'Chad',
  TF: 'the French Southern Territories', TG: 'Togo', TH: 'Thailand', TJ: 'Tajikistan', TK: 'Tokelau', TL: 'Timor-Leste',
  TM: 'Turkmenistan', TN: 'Tunisia', TO: 'Tonga', TR: 'Türkiye', TT: 'Trinidad and Tobago', TV: 'Tuvalu', TW: 'Taiwan',
  TZ: 'Tanzania', UA: 'Ukraine', UG: 'Uganda', UM: 'the U.S. Outlying Islands', US: 'the United States', UY: 'Uruguay',
  UZ: 'Uzbekistan', VA: 'Vatican City', VC: 'Saint Vincent and the Grenadines', VE: 'Venezuela',
  VG: 'the British Virgin Islands', VI: 'the U.S. Virgin Islands', VN: 'Vietnam', VU: 'Vanuatu', WF: 'Wallis and Futuna',
  WS: 'Samoa', XK: 'Kosovo', YE: 'Yemen', YT: 'Mayotte', ZA: 'South Africa', ZM: 'Zambia', ZW: 'Zimbabwe',
};

/** The name a sentence says ("in Iraq", "in the United Kingdom"); the code itself when the list has none. */
export function countryName(code: string): string {
  return NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

/** The same name standing alone, as a label ("UNITED KINGDOM"): without the "the" a sentence carries. */
export function countryLabel(code: string): string {
  return countryName(code).replace(/^the /, '');
}
