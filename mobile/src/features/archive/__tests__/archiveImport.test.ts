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

  it('two-section format: anchors on the film table, no garbage entries, keeps description', () => {
    const csv = [
      'Date,Name,Tags,URL,Description',
      '2024-01-01,My Favourite Noirs,noir,https://example.com/list,"Shadows and cigarettes."',
      'Position,Name,Year,URL,Description',
      '1,Double Indemnity,1944,https://example.com/f1,',
      '2,Out of the Past,1947,https://example.com/f2,',
    ].join('\n');
    const list = parseListCSV(csv, 'my-favourite-noirs.csv');
    // The list's own name and the embedded header row must NOT become films.
    expect(list.entries.map(e => e.title)).toEqual(['Double Indemnity', 'Out of the Past']);
    // Year comes from the film table, not lost to the metadata header.
    expect(list.entries[0].year).toBe('1944');
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
