/**
 * A link's values are read by their kinds, and a value of another shape is not there (P4.4).
 */
import { P, readParams } from '../routeParams';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('each kind', () => {
  it('a row of the house: a UUID, in lower case', () => {
    expect([ID, ID.toUpperCase()].map(P.uuid)).toEqual([ID, ID]);
    expect(['abc', `${ID}x`, ` ${ID}`, `${ID}/../x`, "' OR 1=1 --", '0f8fad5b-d9cb-469f-a165-70867728950']
      .map(P.uuid)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
  });

  it('a film or an artist at TMDB: its number', () => {
    expect(['603', '1', '9999999999'].map(P.tmdbId)).toEqual([603, 1, 9999999999]);
    expect(['abc', '0', '-603', '603abc', '6.03', '1e3', '00603', '12345678901', ' 603']
      .map(P.tmdbId)).toEqual(Array(9).fill(undefined));
  });

  it('a poster at TMDB: its path of TMDB’s own shape', () => {
    expect(P.posterPath('/zt8aQ6ksqK6p1AopC5zVTDS9pKT.jpg')).toBe('/zt8aQ6ksqK6p1AopC5zVTDS9pKT.jpg');
    expect(['../x.jpg', '/a/b.jpg', 'https://evil.example/x.jpg', '/x.svg', '/x.jpg?y', 'x.jpg', '//evil.example/x.jpg']
      .map(P.posterPath)).toEqual(Array(7).fill(undefined));
  });

  it('a year: four figures', () => {
    expect(['1950', '2026'].map(P.year)).toEqual(['1950', '2026']);
    expect(['195', '19500', '19a0', ''].map(P.year)).toEqual(Array(4).fill(undefined));
  });

  it('one of a few words, exactly', () => {
    const kind = P.oneOf('take', 'wire');
    expect(['take', 'wire', 'Take', 'take ', 'dossier', 'constructor', '__proto__'].map(kind))
      .toEqual(['take', 'wire', undefined, undefined, undefined, undefined, undefined]);
  });

  it('words: cleaned as stored words are, cut, and none left is none', () => {
    const words = P.words(10);
    expect(words('  Sunset   Boulevard  ')).toBe('Sunset   B');
    expect(words('Sun\u0000set\u200B')).toBe('Sunset');
    expect(words('\u200B\u0007 ')).toBeUndefined();
    // Cut by code points, never through a surrogate pair.
    expect(P.words(3)('🎞️🎞️🎞️🎞️')).toBe(Array.from('🎞️🎞️🎞️🎞️').slice(0, 3).join(''));
  });

  it('a screen to return to after signing in: one of returnAfterSignIn’s, and no other', () => {
    // The Lobby too: where a sign-in lands with none.
    expect([`/list-modal?editId=${ID}`, '/(tabs)'].map(P.returnTo)).toEqual([`/list-modal?editId=${ID}`, '/(tabs)']);
    expect(['https://evil.example', '/tribunal', '//evil.example', `/list-modal?editId=${ID}&then=/settings`].map(P.returnTo)).toEqual(Array(4).fill(undefined));
  });
});

describe('a link read by its shape', () => {
  const SHAPE = { id: P.uuid, film: P.tmdbId, title: P.words(20) };

  it('hands each value in its kind, and names each given in another shape', () => {
    expect(readParams({ id: ID, film: '603', title: 'The Matrix' }, SHAPE)).toEqual({ id: ID, film: 603, title: 'The Matrix', refused: [] });
    expect(readParams({ id: 'abc', film: 'NaN', title: '\u200B' }, SHAPE))
      .toEqual({ id: undefined, film: undefined, title: undefined, refused: ['id', 'film', 'title'] });
  });

  it('a value not given, or given empty, is not there and not refused', () => {
    expect(readParams({ id: '' }, SHAPE)).toEqual({ id: undefined, film: undefined, title: undefined, refused: [] });
  });

  it('a repeated key is read by its first value', () => {
    expect(readParams({ id: [ID, 'abc'], film: ['abc', '603'] }, SHAPE))
      .toEqual({ id: ID, film: undefined, title: undefined, refused: ['film'] });
  });

  it('reads no name the shape does not name', () => {
    expect(Object.keys(readParams({ id: ID, then: '/settings', __proto__: 'x' } as Record<string, string>, SHAPE)).sort())
      .toEqual(['film', 'id', 'refused', 'title']);
  });
});
