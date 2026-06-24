/**
 * T4-3: Unit tests for toProfile* mappers in mappers.ts
 * These are the bridge between Zustand stores and the profile screen.
 * Any regression here = broken profile display.
 */

import { toProfileLog, toProfileWatchlistItem, toProfileVaultItem, toProfileList } from '../mappers';

describe('toProfileLog', () => {
  const baseLog = {
    id: 'log-1',
    filmId: 550,
    title: 'Fight Club',
    poster: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
    year: 1999,
    rating: 5,
    review: 'First rule: you do not talk about Fight Club.',
    status: 'watched',
    watchedDate: '2024-01-15',
    pullQuote: 'A masterpiece of chaos.',
    altPoster: null,
    physicalMedia: 'bluray',
    watchedWith: 'Tyler',
    abandonedReason: null,
    createdAt: '2024-01-15T12:00:00Z',
  };

  it('maps all fields correctly', () => {
    const result = toProfileLog(baseLog as any);
    expect(result.id).toBe('log-1');
    expect(result.filmId).toBe(550);
    expect(result.title).toBe('Fight Club');
    expect(result.poster).toBe('/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg');
    expect(result.year).toBe(1999);
    expect(result.rating).toBe(5);
    expect(result.review).toBe('First rule: you do not talk about Fight Club.');
    expect(result.status).toBe('watched');
    expect(result.watchedDate).toBe('2024-01-15');
    expect(result.pullQuote).toBe('A masterpiece of chaos.');
    expect(result.physicalMedia).toBe('bluray');
    expect(result.watchedWith).toBe('Tyler');
    expect(result.abandonedReason).toBeNull();
    expect(result.createdAt).toBe('2024-01-15T12:00:00Z');
  });

  it('defaults to empty string when title is missing', () => {
    const log = { ...baseLog, title: undefined } as any;
    const result = toProfileLog(log);
    expect(result.title).toBe('');
  });

  it('handles null poster', () => {
    const log = { ...baseLog, poster: null } as any;
    expect(toProfileLog(log).poster).toBeNull();
  });

  it('defaults status to watched when missing', () => {
    const log = { ...baseLog, status: undefined } as any;
    expect(toProfileLog(log).status).toBe('watched');
  });

  it('defaults createdAt to empty string when missing', () => {
    const log = { ...baseLog, createdAt: undefined } as any;
    expect(toProfileLog(log).createdAt).toBe('');
  });
});

describe('toProfileWatchlistItem', () => {
  it('maps fields correctly', () => {
    const item = { id: 42, title: 'Dune', poster: '/dune.jpg', year: 2021 } as any;
    const result = toProfileWatchlistItem(item);
    expect(result.id).toBe(42);
    expect(result.title).toBe('Dune');
    expect(result.poster_path).toBe('/dune.jpg');
    expect(result.year).toBe(2021);
  });

  it('falls back to poster_path when poster is null', () => {
    const item = { id: 42, title: 'Dune', poster: null, poster_path: '/dune-alt.jpg', year: 2021 } as any;
    const result = toProfileWatchlistItem(item);
    expect(result.poster_path).toBe('/dune-alt.jpg');
  });

  it('returns null poster_path when both are null', () => {
    const item = { id: 42, title: 'Dune', poster: null, poster_path: null, year: null } as any;
    const result = toProfileWatchlistItem(item);
    expect(result.poster_path).toBeNull();
    expect(result.year).toBeNull();
  });
});

describe('toProfileVaultItem', () => {
  it('maps all physical archive fields', () => {
    const item = {
      id: 'vault-1', filmId: 550, title: 'Fight Club',
      poster: '/fc.jpg', year: 1999,
      formats: ['bluray', '4k'], notes: 'Limited edition',
      condition: 'mint', createdAt: '2024-01-01T00:00:00Z',
    } as any;
    const result = toProfileVaultItem(item);
    expect(result.id).toBe('vault-1');
    expect(result.film_id).toBe(550);
    expect(result.filmId).toBe(550);
    expect(result.title).toBe('Fight Club');
    expect(result.poster_path).toBe('/fc.jpg');
    expect(result.year).toBe(1999);
    expect(result.formats).toEqual(['bluray', '4k']);
    expect(result.notes).toBe('Limited edition');
    expect(result.condition).toBe('mint');
  });

  it('defaults missing fields safely', () => {
    const item = { id: 1, filmId: 550, title: 'FC', poster: null } as any;
    const result = toProfileVaultItem(item);
    expect(result.id).toBe('1');
    expect(result.poster_path).toBeNull();
    expect(result.formats).toEqual([]);
    expect(result.notes).toBe('');
    expect(result.condition).toBe('good');
  });

  it('converts numeric id to string', () => {
    const item = { id: 42, filmId: 1, title: 'X' } as any;
    expect(toProfileVaultItem(item).id).toBe('42');
  });
});

describe('toProfileList', () => {
  it('maps list with films correctly', () => {
    const list = {
      id: 'list-1', title: 'Best of 2024', description: 'My picks',
      isRanked: true, isPrivate: false, created_at: '2024-12-31',
      films: [
        { id: 1, title: 'Film A', poster: '/a.jpg' },
        { id: 2, title: 'Film B', poster_path: '/b.jpg', poster: null },
      ],
    } as any;
    const result = toProfileList(list);
    expect(result.id).toBe('list-1');
    expect(result.title).toBe('Best of 2024');
    expect(result.description).toBe('My picks');
    expect(result.isRanked).toBe(true);
    expect(result.isPrivate).toBe(false);
    expect(result.films).toHaveLength(2);
    expect(result.films[0].poster).toBe('/a.jpg');
    expect(result.films[1].poster).toBe('/b.jpg');
  });

  it('falls back to name when title is missing', () => {
    const list = { id: '1', title: undefined, name: 'My List', films: [] } as any;
    expect(toProfileList(list).title).toBe('My List');
  });

  it('handles empty films array', () => {
    const list = { id: '1', title: 'Empty', films: null } as any;
    expect(toProfileList(list).films).toEqual([]);
  });

  it('defaults booleans safely', () => {
    const list = { id: '1', title: 'X', films: [] } as any;
    const result = toProfileList(list);
    expect(result.isRanked).toBe(false);
    expect(result.isPrivate).toBe(false);
  });
});
