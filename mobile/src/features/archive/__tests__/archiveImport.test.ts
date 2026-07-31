/**
 * archiveImport.test.ts — locks the pure core of the Universal Archive Import.
 *
 * These tests are the device-free proof for the import overhaul: CSV tokenizing,
 * two-section list handling, placement ordering, rating clamps, date clamps,
 * native rewatch aggregation, and the viewing_history archival shape.
 */
import {
  parseCSVRows,
  parseCSV,
  parseListCSV,
  orderImportedFilms,
  clampRating,
  detectRatingScale,
  normalizeRatingWithScale,
  normalizeDate,
  backdatedTimestamps,
  importableTimestamp,
  aggregateDiaryEntries,
  buildViewingHistory,
  detectSource,
  detectDateFormat,
  csvLooksLike,
} from '../archiveImport';

jest.mock('@/src/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('@/src/lib/tmdb', () => ({ tmdb: { search: jest.fn() } }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: jest.fn(() => ({ user: null })) } }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'test-uuid') }));
jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));

const TODAY = new Date().toISOString().slice(0, 10);

describe('parseCSVRows / parseCSV', () => {
  it('handles quoted fields with embedded commas, newlines, and escaped quotes', () => {
    const text = 'Title,Review\n"The Godfather, Part II","A ""masterpiece"".\nMulti-line."';
    const rows = parseCSVRows(text);
    expect(rows[1][0]).toBe('The Godfather, Part II');
    expect(rows[1][1]).toBe('A "masterpiece".\nMulti-line.');
  });

  it('strips BOM and survives CRLF line endings', () => {
    const text = '﻿Title,Year\r\nHeat,1995\r\n';
    const records = parseCSV(text);
    expect(records).toHaveLength(1);
    expect(records[0].Title).toBe('Heat');
    expect(records[0].Year).toBe('1995');
  });

  it('parseCSV keys records by the first row and skips empty rows', () => {
    const records = parseCSV('Name,Year\n\nRan,1985\n');
    expect(records).toHaveLength(1);
    expect(records[0].Name).toBe('Ran');
  });
});

describe('parseListCSV', () => {
  it('single-section: imports films in file order without a position column', () => {
    const csv = 'Name,Year\nStalker,1979\nSolaris,1972\n';
    const list = parseListCSV(csv, 'sci-fi_greats.csv');
    expect(list.name).toBe('Sci Fi Greats');
    expect(list.entries.map(e => e.title)).toEqual(['Stalker', 'Solaris']);
  });

  it('honors an explicit position column even when rows are shuffled', () => {
    const csv = 'Position,Name,Year\n3,Third,2003\n1,First,2001\n2,Second,2002\n';
    const list = parseListCSV(csv, 'ranked.csv');
    expect(list.entries.map(e => e.title)).toEqual(['First', 'Second', 'Third']);
  });

  it('two-section format: anchors on the film table, no garbage entries, keeps exact name + description', () => {
    const csv = [
      'Date,Name,Tags,URL,Description',
      '2024-01-01,"Noir & Neon: After Dark!",noir,https://example.com/list,"Shadows and cigarettes."',
      'Position,Name,Year,URL,Description',
      '1,Double Indemnity,1944,https://example.com/f1,',
      '2,Out of the Past,1947,https://example.com/f2,',
    ].join('\n');
    const list = parseListCSV(csv, 'noir-neon-after-dark.csv');
    // The list's own name and the embedded header row must NOT become films.
    expect(list.entries.map(e => e.title)).toEqual(['Double Indemnity', 'Out of the Past']);
    // Year comes from the film table, not lost to the metadata header.
    expect(list.entries[0].year).toBe('1944');
    // EXACT original name from the metadata block — punctuation and casing
    // intact, not the slugified filename ("Noir Neon After Dark").
    expect(list.name).toBe('Noir & Neon: After Dark!');
    expect(list.description).toBe('Shadows and cigarettes.');
  });

  it('does not false-positive on a film genuinely titled with a header word', () => {
    const csv = 'Name,Year\nName,2007\nTitle,2010\n';
    const list = parseListCSV(csv, 'odd-titles.csv');
    // Rows with only ONE synonym-matching cell are films, not headers.
    expect(list.entries.map(e => e.title)).toEqual(['Name', 'Title']);
  });
});

describe('orderImportedFilms', () => {
  it('orders by rank_position when present', () => {
    const films = [{ t: 'b', rank_position: 1 }, { t: 'a', rank_position: 0 }, { t: 'c', rank_position: 2 }];
    expect(orderImportedFilms(films).map(f => f.t)).toEqual(['a', 'b', 'c']);
  });

  it('falls back to legacy position, then original order', () => {
    const legacy = [{ t: 'y', position: 2 }, { t: 'x', position: 1 }];
    expect(orderImportedFilms(legacy).map(f => f.t)).toEqual(['x', 'y']);
    const bare = [{ t: 'first' }, { t: 'second' }];
    expect(orderImportedFilms(bare).map(f => f.t)).toEqual(['first', 'second']);
  });

  it('ranked films come before unranked ones, stably', () => {
    const mixed = [{ t: 'no-rank' }, { t: 'ranked', rank_position: 0 }];
    expect(orderImportedFilms(mixed).map(f => f.t)).toEqual(['ranked', 'no-rank']);
  });
});

describe('rating normalization', () => {
  it('clampRating enforces the DB CHECK range [0,5]', () => {
    expect(clampRating(9)).toBe(5);
    expect(clampRating(-3)).toBe(0);
    expect(clampRating('garbage')).toBe(0);
    expect(clampRating(4.5)).toBe(4.5);
  });

  it('hundred-scale outliers can no longer exceed 5 (the old batch-killer)', () => {
    // max 200 → 'hundred' scale → 200/20 = 10 → must clamp to 5
    expect(detectRatingScale([200, 80])).toBe('hundred');
    expect(normalizeRatingWithScale(200, 'hundred')).toBe(5);
    expect(normalizeRatingWithScale(80, 'hundred')).toBe(4);
  });

  it('ten-scale converts to halves', () => {
    expect(normalizeRatingWithScale(7, 'ten')).toBe(3.5);
  });
});

describe('date handling', () => {
  it('normalizes common formats to YYYY-MM-DD', () => {
    expect(normalizeDate('2020-03-15')).toBe('2020-03-15');
    expect(normalizeDate('2020-03-15T18:00:00Z')).toBe('2020-03-15');
    expect(normalizeDate('03/15/2020')).toBe('2020-03-15');
    expect(normalizeDate('15/03/2020')).toBe('2020-03-15'); // DD/MM detected via >12
  });

  it('clamps future dates to today (native logs cannot exist in the future)', () => {
    expect(normalizeDate('2999-01-01')).toBe(TODAY);
  });

  it('falls back to today on garbage', () => {
    expect(normalizeDate('not a date')).toBe(TODAY);
  });

  it('backdatedTimestamps sits at noon UTC of the watch date, never in the future', () => {
    const { created_at, updated_at } = backdatedTimestamps('2019-06-01');
    expect(created_at).toBe('2019-06-01T12:00:00.000Z');
    expect(updated_at).toBe(created_at);
    const future = backdatedTimestamps('2999-01-01');
    expect(future.created_at <= new Date().toISOString()).toBe(true);
  });

  it('importableTimestamp passes valid past timestamps, rejects garbage and the future', () => {
    expect(importableTimestamp('2022-05-01T10:00:00.000Z')).toBe('2022-05-01T10:00:00.000Z');
    expect(importableTimestamp('banana')).toBeNull();
    expect(importableTimestamp('2999-01-01T00:00:00.000Z')).toBeNull();
    expect(importableTimestamp(undefined)).toBeNull();
  });
});

describe('native rewatch aggregation', () => {
  const watch = (over: Partial<{ title: string; year: string; rating: number; review: string; watchedDate: string; isRewatch: boolean }>) => ({
    title: 'Blade Runner', year: '1982', rating: 0, review: '',
    watchedDate: '2020-01-01', isRewatch: false, uri: '', tags: '', ...over,
  });

  it('groups multiple watches into one film: latest current, earlier archived, view_count honest', () => {
    const diary = [
      watch({ watchedDate: '2021-06-01', rating: 4.5, review: 'Even better.' }),
      watch({ watchedDate: '2019-01-01', rating: 4, review: 'First watch.' }),
      watch({ watchedDate: '2020-03-03', rating: 4, review: '' }),
    ];
    const [agg] = aggregateDiaryEntries(diary);
    expect(agg.viewCount).toBe(3);
    expect(agg.isRewatch).toBe(true);
    expect(agg.latest.watchedDate).toBe('2021-06-01');
    expect(agg.latest.review).toBe('Even better.');
    expect(agg.earlier.map(w => w.watchedDate)).toEqual(['2019-01-01', '2020-03-03']);
  });

  it('applies the native "empty keeps previous" merge when the latest watch is bare', () => {
    const diary = [
      watch({ watchedDate: '2020-01-01', rating: 5, review: 'The one that counts.' }),
      watch({ watchedDate: '2021-01-01', rating: 0, review: '' }),
    ];
    const [agg] = aggregateDiaryEntries(diary);
    expect(agg.latest.watchedDate).toBe('2021-01-01');
    expect(agg.latest.rating).toBe(5);
    expect(agg.latest.review).toBe('The one that counts.');
  });

  it('a single watch stays a plain watched log', () => {
    const [agg] = aggregateDiaryEntries([watch({ rating: 3 })]);
    expect(agg.viewCount).toBe(1);
    expect(agg.isRewatch).toBe(false);
    expect(agg.earlier).toHaveLength(0);
  });

  it('buildViewingHistory archives earlier watches newest-first in the native shape', () => {
    const earlier = [
      watch({ watchedDate: '2019-01-01', rating: 8, review: 'old' }),
      watch({ watchedDate: '2020-01-01', rating: 6, review: 'newer' }),
    ];
    const history = buildViewingHistory(earlier, 'ten');
    expect(history).toHaveLength(2);
    // Newest-first, matching [archivedEntry, ...oldHistory]
    expect(history[0].date).toBe('2020-01-01');
    expect(history[1].date).toBe('2019-01-01');
    // Ratings pass through the scale converter (ten → halves)
    expect(history[0].rating).toBe(3);
    expect(history[1].rating).toBe(4);
    // Native camelCase archival shape (mirrors logOperations.applyRewatchMerge)
    expect(history[0]).toMatchObject({
      isSpoiler: false, watchedWith: '', privateNotes: '', physicalMedia: 'None',
      status: 'watched', abandonedReason: null, isAutopsied: false, autopsy: null,
      altPoster: null, editorialHeader: null, dropCap: false, pullQuote: '',
      videoUrl: null, format: 'digital',
    });
  });
});

// ═══════════════════════════════════════════════════════════════
//  SOURCE FINGERPRINT + FILE-LEVEL DECISIONS
//  These close the two silent corruptions in import: every rating
//  doubled forever, and half of a European member's dates transposed.
// ═══════════════════════════════════════════════════════════════

describe('detectSource — the export fingerprint', () => {
  it('identifies a Letterboxd diary export', () => {
    expect(detectSource(['Date', 'Name', 'Year', 'Letterboxd URI', 'Rating', 'Rewatch', 'Tags', 'Watched Date'])).toBe('uri_diary');
  });

  it('identifies an IMDb ratings export', () => {
    expect(detectSource(['Const', 'Your Rating', 'Date Rated', 'Title', 'Title Type', 'IMDb Rating'])).toBe('const_titles');
  });

  it('identifies a Trakt export', () => {
    expect(detectSource(['title', 'year', 'rated_at', 'rating'])).toBe('snake_timestamps');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(detectSource(['  LETTERBOXD URI ', 'Name'])).toBe('uri_diary');
    expect(detectSource(['const', 'title type'])).toBe('const_titles');
  });

  it('a column that merely MENTIONS a service is not that service', () => {
    // Substring matching would call this a Letterboxd export and force its
    // rating scale onto a hand-made sheet.
    expect(detectSource(['Film', 'Score', 'Imported from Letterboxd'])).toBe('unknown');
    expect(detectSource(['Title', 'Notes about my IMDb ratings'])).toBe('unknown');
  });

  it('two different fingerprints mean UNKNOWN, not whichever is checked first', () => {
    // A merged or hand-assembled file. Taking the first match would pick a
    // rating scale by declaration order; contradictory evidence is not evidence.
    expect(detectSource(['Letterboxd URI', 'Const', 'Your Rating'])).toBe('unknown');
    expect(detectSource(['Letterboxd URI', 'rated_at'])).toBe('unknown');
  });

  it('says unknown for a hand-made spreadsheet rather than guessing', () => {
    expect(detectSource(['Film', 'Score', 'Watched'])).toBe('unknown');
    expect(detectSource([])).toBe('unknown');
  });

  it('does not mistake a bare "Rating" column for IMDb', () => {
    // 'Const' is the discriminator; without it this is just a generic CSV.
    expect(detectSource(['Title', 'Rating', 'Year'])).toBe('unknown');
  });
});

describe('detectRatingScale — source outranks the max value', () => {
  it('THE BUG: a 1-10 export where nobody scored above 5 is no longer read as out-of-5', () => {
    const cautiousCritic = [1, 2, 3, 4, 5, 3, 2];
    // By max alone this is indistinguishable from a 5-star file — which is
    // exactly how every rating used to get doubled, permanently.
    expect(detectRatingScale(cautiousCritic)).toBe('half-five');
    expect(detectRatingScale(cautiousCritic, 'const_titles')).toBe('ten');
    expect(detectRatingScale(cautiousCritic, 'snake_timestamps')).toBe('ten');
  });

  it('a Letterboxd file is out of 5 even if every score is a whole number', () => {
    expect(detectRatingScale([1, 2, 3, 4, 5], 'uri_diary')).toBe('half-five');
  });

  it('the data WINS when it exceeds what the named source can emit', () => {
    // Letterboxd tops out at 5. A file fingerprinted Letterboxd but carrying a
    // 10 is not really Letterboxd data (merged export, edited sheet, a column
    // that only looks familiar). Forcing half-five would clamp 7, 9 and 10 all
    // to a flat 5 — so the fingerprint yields to the evidence.
    expect(detectRatingScale([4, 7, 9, 10], 'uri_diary')).toBe('ten');
    expect(detectRatingScale([20, 55, 90], 'const_titles')).toBe('hundred');
  });

  it('but a source still wins whenever the data is consistent with it', () => {
    expect(detectRatingScale([0.5, 1.5, 5], 'uri_diary')).toBe('half-five');
    expect(detectRatingScale([0.5, 1.5], 'const_titles')).toBe('ten');
    expect(detectRatingScale([1, 2, 3, 4, 5], 'const_titles')).toBe('ten');
  });

  it('a fractional value does NOT override the maximum', () => {
    // Tempting rule: ".5 exists, so it must be a 5-star scale." It is wrong.
    // A tracker on 0.5-10 in HALF steps emits both fractions and a max above 5,
    // and calling that half-five clamps 7, 7.5 and 9 all to a flat 5 reels —
    // the exact flattening this whole detector exists to prevent.
    expect(detectRatingScale([1, 2, 3, 4, 5, 6, 7.5])).toBe('ten');
    expect(detectRatingScale([3.5, 7, 7.5, 9])).toBe('ten');
    // Below 5 the answer is half-five anyway, so the fraction adds nothing.
    expect(detectRatingScale([3.5, 4, 2])).toBe('half-five');
  });

  it('a half-step 10-scale keeps its resolution instead of being clamped', () => {
    const scale = detectRatingScale([3.5, 7, 7.5, 9]);
    expect(normalizeRatingWithScale(7, scale)).toBe(3.5);
    expect(normalizeRatingWithScale(9, scale)).toBe(4.5);
    // Misread as half-five these would all have collapsed to 5.
    expect(normalizeRatingWithScale(7.5, scale)).toBe(4);
  });

  it('falls back to the max ladder for an unknown source', () => {
    expect(detectRatingScale([20, 55, 90])).toBe('hundred');
    expect(detectRatingScale([6, 8, 10])).toBe('ten');
    expect(detectRatingScale([1, 2, 3])).toBe('half-five');
  });

  it('survives an empty or all-zero rating set', () => {
    expect(detectRatingScale([])).toBe('half-five');
    expect(detectRatingScale([0, 0])).toBe('half-five');
    // Previously Math.max(...[]) === -Infinity, which fell through by accident.
    expect(detectRatingScale([], 'const_titles')).toBe('ten');
  });
});

describe('detectDateFormat — decided once for the whole file, by weight of evidence', () => {
  it('a day-first row settles the ambiguous ones around it', () => {
    // 05/03 is ambiguous alone; 25/03 in the same file proves day-first.
    expect(detectDateFormat(['05/03/2024', '25/03/2024', '01/02/2024'])).toBe('DMY');
  });

  it('a US export stays MM/DD — nothing changes for it', () => {
    expect(detectDateFormat(['03/25/2024', '12/31/2023', '01/02/2024'])).toBe('MDY');
  });

  it('ONE odd row cannot flip a file that overwhelmingly proves the other way', () => {
    // Four rows prove month-first (25, 31, 15, 30 in second position); one row
    // reads day-first. Treating the first day-first row as decisive would
    // transpose every ambiguous date in an otherwise clean US export.
    expect(detectDateFormat([
      '03/25/2024', '12/31/2023', '01/15/2024', '06/30/2024', '25/03/2024',
    ])).toBe('MDY');
    // And the mirror image: a European file with one stray US-looking row.
    expect(detectDateFormat([
      '25/03/2024', '31/12/2023', '15/01/2024', '30/06/2024', '03/25/2024',
    ])).toBe('DMY');
  });

  it('keeps the MM/DD default when a file is genuinely ambiguous', () => {
    expect(detectDateFormat(['01/02/2024', '03/04/2024'])).toBe('MDY');
    expect(detectDateFormat([])).toBe('MDY');
  });

  it('a row that is impossible either way proves nothing', () => {
    // 25/25 is not a date in either reading — it must not cast a vote.
    expect(detectDateFormat(['25/25/2024', '03/25/2024'])).toBe('MDY');
  });

  it('ignores ISO dates and junk without being thrown off', () => {
    expect(detectDateFormat(['2024-03-05', '', 'not a date', '25/03/2024'])).toBe('DMY');
  });
});

describe('normalizeDate — the file verdict fixes the half-wrong European import', () => {
  it('THE BUG: an ambiguous day is transposed without the file verdict', () => {
    // 5 March 2024 in a European export.
    expect(normalizeDate('05/03/2024')).toBe('2024-05-03');          // wrong: 3 May
    expect(normalizeDate('05/03/2024', 'DMY')).toBe('2024-03-05');   // right: 5 March
  });

  it('an unambiguous day was always right, and still is', () => {
    expect(normalizeDate('25/03/2024')).toBe('2024-03-25');
    expect(normalizeDate('25/03/2024', 'DMY')).toBe('2024-03-25');
  });

  it('US dates are untouched by the default', () => {
    expect(normalizeDate('03/25/2024')).toBe('2024-03-25');
    expect(normalizeDate('12/31/2023')).toBe('2023-12-31');
  });

  it('is idempotent on ISO dates, so downstream calls pass them straight through', () => {
    // This is what lets the parse boundary normalize once without touching
    // any of the six existing normalizeDate call sites.
    const iso = normalizeDate('05/03/2024', 'DMY');
    expect(normalizeDate(iso)).toBe(iso);
    expect(normalizeDate(iso, 'DMY')).toBe(iso);
  });
});

describe('normalizeDate — an impossible date must never reach a DATE column', () => {
  const isReal = (s: string) => {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return false;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const p = new Date(Date.UTC(y, mo - 1, d));
    return p.getUTCFullYear() === y && p.getUTCMonth() === mo - 1 && p.getUTCDate() === d;
  };

  it.each([
    ['31/02/2024', 'DMY'], ['02/31/2024', 'DMY'], ['29/02/2023', 'DMY'],
    ['31/04/2024', 'DMY'], ['02/30/2024', 'MDY'], ['13/13/2024', 'MDY'],
    ['00/05/2024', 'DMY'], ['05/00/2024', 'DMY'], ['31/11/2024', 'DMY'],
  ])('never emits an unstorable date for %s (%s)', (raw, fmt) => {
    // An impossible date fails its INSERT and takes the batch down with it
    // until the row-by-row fallback isolates it — costing the member that film.
    expect(isReal(normalizeDate(raw, fmt as 'MDY' | 'DMY'))).toBe(true);
  });

  it('rescues a row by reading it the other way when the preferred way is impossible', () => {
    // In a day-first file, 05/13 is meaningless as day 5 of month 13 — but it
    // is a perfectly good 13 May the other way round. Keep the film.
    expect(normalizeDate('05/13/2024', 'DMY')).toBe('2024-05-13');
    // Mirror: in a month-first file, 25/03 is month 25 — but 25 March reads fine.
    expect(normalizeDate('25/03/2024', 'MDY')).toBe('2024-03-25');
  });

  it('falls back to today only when NEITHER reading is a real date', () => {
    expect(normalizeDate('31/04/2024', 'DMY')).toBe(TODAY);   // no month has 31 Apr either way
    expect(normalizeDate('29/02/2023', 'DMY')).toBe(TODAY);   // 2023 is not a leap year
  });

  it('a leap day in a real leap year still imports', () => {
    expect(normalizeDate('29/02/2024', 'DMY')).toBe('2024-02-29');
  });

  it('valid dates are completely unaffected', () => {
    expect(normalizeDate('03/25/2024')).toBe('2024-03-25');
    expect(normalizeDate('05/03/2024', 'DMY')).toBe('2024-03-05');
    expect(normalizeDate('12/31/2023')).toBe('2023-12-31');
  });
});

// ═══════════════════════════════════════════════════════════════
//  ARCHIVE CLASSIFICATION — the most damaging failure found.
//  A list named after a film used to REPLACE the member's diary.
// ═══════════════════════════════════════════════════════════════

describe('csvLooksLike — content must back the filename', () => {
  const DIARY    = 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Watched Date\n2024-01-01,Heat,1995,http://x,4,No,2024-01-01';
  const LIST     = 'Position,Name,Year,URL,Description\n1,Heat,1995,http://x,';
  const REVIEWS  = 'Date,Name,Year,Review\n2024-01-01,Heat,1995,"A masterpiece."';
  const WATCHLIST= 'Date,Name,Year,Letterboxd URI\n2024-01-01,Heat,1995,http://x';

  it('a diary is recognised by its rating / watched-date columns', () => {
    expect(csvLooksLike(DIARY, 'diary')).toBe(true);
  });

  it('a LIST export is never mistaken for a diary — it has neither', () => {
    // This is what let "Overrating the 80s" claim the ratings slot.
    expect(csvLooksLike(LIST, 'diary')).toBe(false);
  });

  it('a list is never mistaken for reviews — Description is not a review column', () => {
    expect(csvLooksLike(REVIEWS, 'reviews')).toBe(true);
    expect(csvLooksLike(LIST, 'reviews')).toBe(false);
  });

  it('a watchlist is distinguished from a list by having no placement or blurb', () => {
    expect(csvLooksLike(WATCHLIST, 'watchlist')).toBe(true);
    expect(csvLooksLike(LIST, 'watchlist')).toBe(false);
  });

  it('refuses an empty or headerless file rather than guessing', () => {
    expect(csvLooksLike('', 'diary')).toBe(false);
    expect(csvLooksLike('Name,Year', 'diary')).toBe(false);          // header only, no rows
    expect(csvLooksLike('a,b,c\n1,2,3', 'diary')).toBe(false);       // no title column
  });
});

describe('parseCSV — a repeated column name must not discard the first', () => {
  it('keeps the FIRST occurrence, so the film title survives', () => {
    // Assigning unconditionally let a later duplicate overwrite the earlier
    // column. Since everything keys on the title, a second "Name" column (a
    // director, a note) replaced the film and every lookup after it resolved
    // the wrong film entirely.
    const records = parseCSV('Name,Year,Name\nHeat,1995,Michael Mann');
    expect(records[0].Name).toBe('Heat');
    expect(records[0].Year).toBe('1995');
  });

  it('normal files are completely unaffected', () => {
    const records = parseCSV('Name,Year,Rating\nHeat,1995,4');
    expect(records[0]).toEqual({ Name: 'Heat', Year: '1995', Rating: '4' });
  });
});

describe('parseCSVRows — a stray quote must not swallow the rest of the file', () => {
  it('recovers every row when quoting is malformed', () => {
    // One unescaped quote used to put the tokenizer inside a quoted field for
    // the remainder of the file, merging every later line into a single cell.
    // A stray quote on row 2 of a 3,000-film history silently discarded the
    // other 2,998 and the import still reported success.
    const rows = parseCSVRows('Name,Year\n"Heat,1995\nRan,1985\nSolaris,1972');
    expect(rows.length).toBe(4);
    expect(rows[2][0]).toBe('Ran');
    expect(rows[3][0]).toBe('Solaris');
  });

  it('an unescaped quote inside a review does not lose the films after it', () => {
    const rows = parseCSVRows('Name,Review\nHeat,He said "hello\nRan,Fine\nSolaris,Good');
    expect(rows.length).toBe(4);
    expect(rows[2]).toEqual(['Ran', 'Fine']);
  });

  it('WELL-FORMED quoting is completely unaffected', () => {
    // The recovery must never trigger on a legitimate file — multi-line
    // reviews and escaped quotes are normal and must still parse as quoting.
    const rows = parseCSVRows('Title,Review\n"The Godfather, Part II","A ""masterpiece"".\nMulti-line."');
    expect(rows[1][0]).toBe('The Godfather, Part II');
    expect(rows[1][1]).toBe('A "masterpiece".\nMulti-line.');
  });

  it('a quoted field containing commas and newlines still survives', () => {
    const rows = parseCSVRows('a,b\n"x,y\nz",2');
    expect(rows.length).toBe(2);
    expect(rows[1][0]).toBe('x,y\nz');
  });
});

describe('aggregateDiaryEntries — sourceWatches is the truth for reporting', () => {
  const w = (over: Partial<{ rating: number; review: string; watchedDate: string }>) => ({
    title: 'Solaris', year: '1972', rating: 0, review: '',
    watchedDate: '2020-01-01', isRewatch: false, uri: '', tags: '', ...over,
  });

  it('an unrated rewatch INHERITS the earlier review — so latest+earlier double-counts it', () => {
    const [agg] = aggregateDiaryEntries([
      w({ watchedDate: '2020-01-01', review: 'Devastating.', rating: 5 }),
      w({ watchedDate: '2022-06-01' }), // rewatched, wrote nothing
    ]);
    // The merge copies the earlier review onto the current row...
    expect(agg.latest.review).toBe('Devastating.');
    // ...and the earlier watch keeps it too, for viewing_history.
    expect(agg.earlier[0].review).toBe('Devastating.');
    // Counting latest + earlier would report 2 reviews for ONE the member wrote.
    expect(agg.sourceWatches.filter(x => x.review.length > 0).length).toBe(1);
  });

  it('sourceWatches counts every watch that genuinely carried a review', () => {
    const [agg] = aggregateDiaryEntries([
      w({ watchedDate: '2020-01-01', review: 'first' }),
      w({ watchedDate: '2021-01-01', review: 'second' }),
      w({ watchedDate: '2022-01-01', review: 'third' }),
    ]);
    expect(agg.sourceWatches).toHaveLength(3);
    expect(agg.sourceWatches.filter(x => x.review.length > 0).length).toBe(3);
  });

  it('sourceWatches is ordered oldest to newest, like earlier + latest', () => {
    const [agg] = aggregateDiaryEntries([
      w({ watchedDate: '2022-01-01', review: 'late' }),
      w({ watchedDate: '2020-01-01', review: 'early' }),
    ]);
    expect(agg.sourceWatches.map(x => x.review)).toEqual(['early', 'late']);
    expect(agg.sourceWatches[agg.sourceWatches.length - 1].watchedDate).toBe(agg.latest.watchedDate);
  });
});

// ═══════════════════════════════════════════════════════════════
//  INVARIANTS — properties that must hold for ANY input, not just
//  the cases someone thought to write down.
// ═══════════════════════════════════════════════════════════════

describe('import invariants', () => {
  it('every scale/rating pair yields a value the DB will accept', () => {
    // logs.rating is CHECK [0,5] and the app renders in half-reels. A value
    // outside that, or off the half-step grid, fails its INSERT and takes the
    // whole batch down until the row-by-row fallback isolates it.
    for (const scale of ['half-five', 'ten', 'hundred'] as const) {
      for (const raw of [0.5, 1, 2.5, 5, 7.5, 10, 55, 100, 200, -3, NaN]) {
        const v = normalizeRatingWithScale(raw, scale);
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(5);
        expect(v % 0.5).toBe(0);
      }
    }
  });

  it('any file, read with its own detected format, yields storable dates', () => {
    const isReal = (s: string) => {
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return false;
      const p = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      return p.getUTCFullYear() === +m[1] && p.getUTCMonth() === +m[2] - 1 && p.getUTCDate() === +m[3];
    };
    const files = [
      ['05/03/2024', '25/03/2024'],   // European
      ['03/25/2024', '01/02/2024'],   // US
      ['31/02/2024', '25/12/2024'],   // contains an impossible date
      ['13/13/2024', '01/01/2024'],   // impossible either way
    ];
    for (const f of files) {
      const fmt = detectDateFormat(f);
      for (const d of f) expect(isReal(normalizeDate(d, fmt))).toBe(true);
    }
  });

  it('a spreadsheet-formula payload is carried as data, never interpreted', () => {
    // Imported text is written to the DB and later re-exported to CSV. The
    // export escaper is what defuses this; the importer must not mangle it.
    const r = parseCSV('Name,Year\n"=cmd|\' /c calc\'!A1",2000');
    expect(r[0].Name).toContain('=cmd');
  });

  it('unicode, emoji and RTL titles survive parsing intact', () => {
    expect(parseCSV('Name,Year\n"Amélie 🎬 مرحبا",2001')[0].Name).toBe('Amélie 🎬 مرحبا');
  });

  it('a large archive parses without pathological slowdown', () => {
    const rows = Array.from({ length: 20_000 }, (_, i) => `Film ${i},2000,4`).join('\n');
    const started = Date.now();
    expect(parseCSV(`Name,Year,Rating\n${rows}`)).toHaveLength(20_000);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('hundreds of rewatches collapse to one row with a complete history', () => {
    const w = (d: string) => ({ title: 'A', year: '2000', rating: 0, review: '', watchedDate: d, isRewatch: false, uri: '', tags: '' });
    const many = Array.from({ length: 500 }, (_, i) => w(`2020-${String((i % 12) + 1).padStart(2, '0')}-01`));
    const [agg] = aggregateDiaryEntries(many);
    expect(agg.viewCount).toBe(500);
    expect(agg.earlier).toHaveLength(499);
    expect(agg.sourceWatches).toHaveLength(500);
  });

  it('viewing_history is newest-first, matching the native rewatch shape', () => {
    const w = (d: string, review: string) => ({ title: 'A', year: '2000', rating: 0, review, watchedDate: d, isRewatch: false, uri: '', tags: '' });
    const [agg] = aggregateDiaryEntries([w('2020-01-01', 'oldest'), w('2021-01-01', 'middle'), w('2022-01-01', 'newest')]);
    const history = buildViewingHistory(agg.earlier, 'half-five');
    expect(history[0].review).toBe('middle');
    expect(history[1].review).toBe('oldest');
  });

  it('a corrupt rating becomes UNRATED rather than a top score', () => {
    // Failing open here would silently award five reels to junk data.
    expect(clampRating(Infinity)).toBe(0);
    expect(clampRating(NaN)).toBe(0);
    expect(clampRating(null)).toBe(0);
    expect(clampRating(undefined)).toBe(0);
  });
});

describe('detectRatingScale — the exact boundaries', () => {
  // Added after mutation testing: changing `max > 5` to `max > 6` left all 83
  // existing tests passing. The ladder's thresholds were described but never
  // pinned, so the one number that decides whether ratings get clamped could
  // drift silently.
  it('5 is the last half-five value; 6 is already a ten-scale', () => {
    expect(detectRatingScale([1, 2, 5])).toBe('half-five');
    expect(detectRatingScale([1, 2, 6])).toBe('ten');   // the boundary the mutant slipped through
  });

  it('10 is the last ten value; 11 is already a hundred-scale', () => {
    expect(detectRatingScale([4, 10])).toBe('ten');
    expect(detectRatingScale([4, 11])).toBe('hundred');
  });

  it('a member who never scored above 6 still keeps their resolution', () => {
    // Misread as half-five, a 6 clamps to 5 reels instead of converting to 3.
    const scale = detectRatingScale([2, 4, 6]);
    expect(normalizeRatingWithScale(6, scale)).toBe(3);
    expect(normalizeRatingWithScale(2, scale)).toBe(1);
  });

  it('the source ceilings sit exactly where the services do', () => {
    expect(detectRatingScale([5], 'uri_diary')).toBe('half-five');   // at ceiling
    expect(detectRatingScale([6], 'uri_diary')).toBe('ten');         // over it — data wins
    expect(detectRatingScale([10], 'const_titles')).toBe('ten');              // at ceiling
    expect(detectRatingScale([11], 'const_titles')).toBe('hundred');          // over it — data wins
  });
});
