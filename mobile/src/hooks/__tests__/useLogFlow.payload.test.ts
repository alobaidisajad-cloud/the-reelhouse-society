/**
 * useLogFlow.payload.test.ts — Real Pure-Function Coverage
 * ─────────────────────────────────────────────────────────
 * useLogFlow.validation.test.ts re-implements the validation rules as
 * inline copies, so it never catches a regression in the actual hook.
 * This tests the real exported `buildLogPayload`, `validateLogSubmission`,
 * and `getLocalDateString` functions directly.
 */
import { buildLogPayload, validateLogSubmission, getLocalDateString, loadAutopsyForEdit, LogPayloadInput, AUTOPSY_INIT } from '../useLogFlow';

function basePayloadInput(overrides: Partial<LogPayloadInput> = {}): LogPayloadInput {
  return {
    film: { id: 550, title: 'Fight Club', poster_path: '/poster.jpg', release_date: '1999-10-15' },
    status: 'watched',
    rating: 4,
    review: 'Great film',
    isSpoiler: false,
    date: '2026-06-20',
    watchedWith: '',
    privateNotes: '',
    physicalMedia: 'None',
    abandonedReason: '',
    isAuteur: false,
    isPremium: false,
    autopsy: { ...AUTOPSY_INIT },
    altPoster: null,
    editorialHeader: null,
    dropCap: false,
    pullQuote: '',
    ...overrides,
  };
}

describe('validateLogSubmission', () => {
  it('blocks watched/rewatched logs with no rating and no review', () => {
    expect(validateLogSubmission('watched', 0, '', '')).toBe('A rating or critique is required to seal the record.');
    expect(validateLogSubmission('watched', 0, '   ', '')).toBe('A rating or critique is required to seal the record.');
  });

  it('allows watched logs with only a rating', () => {
    expect(validateLogSubmission('watched', 3, '', '')).toBeNull();
  });

  it('allows watched logs with only a review', () => {
    expect(validateLogSubmission('watched', 0, 'Loved it', '')).toBeNull();
  });

  it('blocks abandoned logs with no reason', () => {
    expect(validateLogSubmission('abandoned', 0, '', '')).toBe('Please specify a reason for abandoning this film.');
  });

  it('allows abandoned logs with a reason, regardless of rating/review', () => {
    expect(validateLogSubmission('abandoned', 0, '', 'Too Slow')).toBeNull();
  });

  it('allows rewatched logs under the same rule as watched', () => {
    expect(validateLogSubmission('rewatched', 0, '', '')).toBe('A rating or critique is required to seal the record.');
    expect(validateLogSubmission('rewatched', 5, '', '')).toBeNull();
  });
});

describe('buildLogPayload', () => {
  it('uses title, falling back to name, falling back to "Untitled"', () => {
    expect(buildLogPayload(basePayloadInput()).title).toBe('Fight Club');
    expect(buildLogPayload(basePayloadInput({ film: { id: 1, name: 'Anime Title' } })).title).toBe('Anime Title');
    expect(buildLogPayload(basePayloadInput({ film: { id: 1 } })).title).toBe('Untitled');
  });

  it('prefers altPoster over the film poster, falling back to null', () => {
    expect(buildLogPayload(basePayloadInput({ altPoster: '/alt.jpg' })).poster).toBe('/alt.jpg');
    expect(buildLogPayload(basePayloadInput()).poster).toBe('/poster.jpg');
    expect(buildLogPayload(basePayloadInput({ film: { id: 1 }, altPoster: null })).poster).toBeNull();
  });

  it('extracts year from release_date, leaving it undefined when absent', () => {
    expect(buildLogPayload(basePayloadInput()).year).toBe(1999);
    expect(buildLogPayload(basePayloadInput({ film: { id: 1, release_date: undefined } })).year).toBeUndefined();
  });

  it('forces rating to 0 for abandoned status, preserves it otherwise', () => {
    expect(buildLogPayload(basePayloadInput({ status: 'abandoned', rating: 4.5, abandonedReason: 'Lost the Plot' })).rating).toBe(0);
    expect(buildLogPayload(basePayloadInput({ rating: 4.5 })).rating).toBe(4.5);
  });

  it('trims the review', () => {
    expect(buildLogPayload(basePayloadInput({ review: '  padded  ' })).review).toBe('padded');
  });

  it('nullifies watchedWith when blank, trims otherwise', () => {
    expect(buildLogPayload(basePayloadInput({ watchedWith: '' })).watchedWith).toBeNull();
    expect(buildLogPayload(basePayloadInput({ watchedWith: '  Alex  ' })).watchedWith).toBe('Alex');
  });

  it('gates privateNotes behind isPremium and nullifies blank notes', () => {
    expect(buildLogPayload(basePayloadInput({ isPremium: false, privateNotes: 'secret' })).privateNotes).toBeNull();
    expect(buildLogPayload(basePayloadInput({ isPremium: true, privateNotes: 'secret' })).privateNotes).toBe('secret');
    expect(buildLogPayload(basePayloadInput({ isPremium: true, privateNotes: '   ' })).privateNotes).toBeNull();
  });

  it('sets abandonedReason only when status is abandoned', () => {
    expect(buildLogPayload(basePayloadInput({ status: 'abandoned', abandonedReason: 'Too Upsetting' })).abandonedReason).toBe('Too Upsetting');
    expect(buildLogPayload(basePayloadInput({ status: 'watched', abandonedReason: 'Too Upsetting' })).abandonedReason).toBeNull();
  });

  it('gates physicalMedia behind isPremium and "None"', () => {
    expect(buildLogPayload(basePayloadInput({ isPremium: true, physicalMedia: 'Blu-Ray' })).physicalMedia).toBe('Blu-Ray');
    expect(buildLogPayload(basePayloadInput({ isPremium: true, physicalMedia: 'None' })).physicalMedia).toBeNull();
    expect(buildLogPayload(basePayloadInput({ isPremium: false, physicalMedia: 'Blu-Ray' })).physicalMedia).toBeNull();
  });

  it('gates autopsy behind isAuteur and saves rated axes with the _v marker', () => {
    const autopsy = { story: 4, script: 3, acting: 5, cinematography: 4, editing: 3, sound: 2 };
    expect(buildLogPayload(basePayloadInput({ isAuteur: true, autopsy })).autopsy).toEqual({ _v: 2, ...autopsy });
    expect(buildLogPayload(basePayloadInput({ isAuteur: true, autopsy })).isAutopsied).toBe(true);
    expect(buildLogPayload(basePayloadInput({ isAuteur: false, autopsy })).autopsy).toBeNull();
    expect(buildLogPayload(basePayloadInput({ isAuteur: false, autopsy })).isAutopsied).toBe(false);
  });

  it('never phantom-saves an untouched autopsy (all axes null)', () => {
    const result = buildLogPayload(basePayloadInput({ isAuteur: true, autopsy: { ...AUTOPSY_INIT } }));
    expect(result.autopsy).toBeNull();
    expect(result.isAutopsied).toBe(false);
  });

  it('saves partial autopsies with only the rated axes present', () => {
    const result = buildLogPayload(basePayloadInput({ isAuteur: true, autopsy: { ...AUTOPSY_INIT, story: 7 } }));
    expect(result.autopsy).toEqual({ _v: 2, story: 7 });
    expect(result.isAutopsied).toBe(true);
  });

  it('preserves a deliberate 0 as a genuinely filed score', () => {
    const result = buildLogPayload(basePayloadInput({ isAuteur: true, autopsy: { ...AUTOPSY_INIT, sound: 0 } }));
    expect(result.autopsy).toEqual({ _v: 2, sound: 0 });
    expect(result.isAutopsied).toBe(true);
  });

  it('strips a stray _v key from editor state instead of counting it as a score', () => {
    const result = buildLogPayload(basePayloadInput({ isAuteur: true, autopsy: { ...AUTOPSY_INIT, _v: 2 } }));
    expect(result.autopsy).toBeNull();
    expect(result.isAutopsied).toBe(false);
  });

  it('gates altPoster, editorialHeader, dropCap, pullQuote behind their respective tiers', () => {
    expect(buildLogPayload(basePayloadInput({ isAuteur: false, altPoster: '/alt.jpg' })).altPoster).toBeNull();
    expect(buildLogPayload(basePayloadInput({ isAuteur: true, altPoster: '/alt.jpg' })).altPoster).toBe('/alt.jpg');

    expect(buildLogPayload(basePayloadInput({ isPremium: false, editorialHeader: 'Header' })).editorialHeader).toBeNull();
    expect(buildLogPayload(basePayloadInput({ isPremium: true, editorialHeader: 'Header' })).editorialHeader).toBe('Header');

    expect(buildLogPayload(basePayloadInput({ isPremium: false, dropCap: true })).dropCap).toBe(false);
    expect(buildLogPayload(basePayloadInput({ isPremium: true, dropCap: true })).dropCap).toBe(true);

    expect(buildLogPayload(basePayloadInput({ isPremium: false, pullQuote: 'Quote' })).pullQuote).toBe('');
    expect(buildLogPayload(basePayloadInput({ isPremium: true, pullQuote: '  Quote  ' })).pullQuote).toBe('Quote');
  });
});

describe('loadAutopsyForEdit', () => {
  it('treats legacy zeros as unrated (the old editor could not express a deliberate 0)', () => {
    const legacy = { story: 7, script: 0, acting: 0, cinematography: 4, editing: 0, sound: 0 };
    expect(loadAutopsyForEdit(legacy)).toEqual({ story: 7, script: null, acting: null, cinematography: 4, editing: null, sound: null });
  });

  it('treats v2 zeros as genuinely filed scores', () => {
    const v2 = { _v: 2, story: 7, sound: 0 };
    expect(loadAutopsyForEdit(v2)).toEqual({ story: 7, script: null, acting: null, cinematography: null, editing: null, sound: 0 });
  });

  it('returns all-unrated for null, non-object, or empty payloads', () => {
    expect(loadAutopsyForEdit(null)).toEqual(AUTOPSY_INIT);
    expect(loadAutopsyForEdit('garbage')).toEqual(AUTOPSY_INIT);
    expect(loadAutopsyForEdit({})).toEqual(AUTOPSY_INIT);
  });
});

describe('getLocalDateString', () => {
  it('returns today in YYYY-MM-DD format with no offset', () => {
    const result = getLocalDateString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('applies a positive day offset', () => {
    const today = new Date();
    const future = new Date(today);
    future.setDate(future.getDate() + 5);
    const expected = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
    expect(getLocalDateString(5)).toBe(expected);
  });

  it('applies a negative day offset', () => {
    const today = new Date();
    const past = new Date(today);
    past.setDate(past.getDate() - 3);
    const expected = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`;
    expect(getLocalDateString(-3)).toBe(expected);
  });
});
