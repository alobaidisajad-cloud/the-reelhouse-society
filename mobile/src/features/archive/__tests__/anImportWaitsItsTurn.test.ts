/**
 * An import waits its turn at the catalogue, and never blames the connection for it (review round 13).
 *
 * An archive of a few hundred films was matched one film after another, 60 ms apart, each film
 * costing one to a dozen reads (a typo tier, a keyword tier), until the house's proxy said 429:
 * the import then stopped with "check your connection", which was fine. Now each film costs one
 * read for its title in its year, and one more without the year only when that finds nothing;
 * the reads go at the pace the proxy allows (60 at once, then 3 a second); and a catalogue that
 * asks the import to wait is waited on and asked again, the film never filed as unmatched for it.
 */
import { BUSY_GIVE_UP_MS, CATALOGUE_AWAY, CATALOGUE_BUSY, CATALOGUE_DOWN, IMPORT_PACE, resolveFilmsBatch } from '../archiveImport';

const { tmdb: mockTmdb } = jest.requireMock('@/src/lib/tmdb');
const findFilm = mockTmdb.findFilm as jest.Mock;

const busy = (retryAfterMs: number) =>
  Promise.reject(Object.assign(new Error('The film catalogue asked us to wait'), { name: 'TmdbBusy', retryAfterMs }));
const away = () => Promise.reject(Object.assign(new Error('offline'), { name: 'TmdbUnreachable' }));
const films = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ title: `Reel ${from + i}`, year: '1927' }));
/** The catalogue as it answers a title in its year: that film. */
const theFilm = async (title: string, year?: string) => ({
  results: [{ id: 1000 + Number(title.split(' ')[1]), title, release_date: `${year ?? '1927'}-01-01`, poster_path: null }],
});

beforeEach(() => {
  findFilm.mockReset();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

it('asks one read a film, the first 60 at once, then three a second', async () => {
  findFilm.mockImplementation(theFilm);
  const done = resolveFilmsBatch(films(66));
  await jest.advanceTimersByTimeAsync(0);
  expect(findFilm).toHaveBeenCalledTimes(IMPORT_PACE.burst);
  // A second on (and a little), three more: the pace, not the round trip, sets it.
  await jest.advanceTimersByTimeAsync(1100);
  expect(findFilm).toHaveBeenCalledTimes(IMPORT_PACE.burst + IMPORT_PACE.perSecond);
  await jest.advanceTimersByTimeAsync(2000);
  const resolved = await done;
  expect(resolved.size).toBe(66);
  // One read a film: the title in its year, nothing more when that finds it.
  expect(findFilm).toHaveBeenCalledTimes(66);
  expect(findFilm.mock.calls.every(([, year]) => year === '1927')).toBe(true);
});

it('asked to wait, it waits as long as it is asked and goes on: every film matched, nothing blamed on the connection', async () => {
  findFilm
    .mockImplementationOnce(theFilm)
    .mockImplementationOnce(() => busy(5000))
    .mockImplementation(theFilm);
  const progress: string[] = [];
  const done = resolveFilmsBatch(films(3, 100), (p) => { if (p.detail) progress.push(p.detail); });
  await jest.advanceTimersByTimeAsync(4000);
  // Still waiting on the catalogue: the second film is not asked again before its time.
  expect(findFilm).toHaveBeenCalledTimes(2);
  expect(progress).toContain('The catalogue asks us to wait a moment');
  await jest.advanceTimersByTimeAsync(1000);
  const resolved = await done;
  expect([...resolved.values()].map((m) => m.title)).toEqual(['Reel 100', 'Reel 101', 'Reel 102']);
});

it('a film whose read was asked to wait is never kept as unmatched', async () => {
  // No year: the read without one is the film's only read, and it was asked to wait.
  findFilm.mockImplementationOnce(() => busy(1000)).mockImplementation(theFilm);
  const done = resolveFilmsBatch([{ title: 'Reel 200', year: '' }]);
  await jest.advanceTimersByTimeAsync(1000);
  const resolved = await done;
  expect([...resolved.values()].map((m) => m.id)).toEqual([1200]);
});

it('a catalogue that keeps asking it to wait stops the import, and says it was busy, not unreachable', async () => {
  findFilm.mockImplementation(() => busy(30_000));
  const said = resolveFilmsBatch(films(2, 300)).catch((e: Error) => e.message);
  await jest.advanceTimersByTimeAsync(BUSY_GIVE_UP_MS + 30_000);
  await expect(said).resolves.toBe(CATALOGUE_BUSY);
  expect(CATALOGUE_BUSY).not.toMatch(/connection/i);
});

it('a catalogue that cannot be reached still stops the import, having written nothing', async () => {
  findFilm.mockImplementation(away);
  const said = resolveFilmsBatch(films(1, 400)).catch((e: Error) => e.message);
  await jest.advanceTimersByTimeAsync(0);
  await expect(said).resolves.toBe(CATALOGUE_AWAY);
});

describe('which answer is the film', () => {
  it('found nowhere in its year, it is asked once more without it, and a film of the year beside is taken', async () => {
    findFilm
      .mockImplementationOnce(async () => ({ results: [] }))
      .mockImplementationOnce(async () => ({ results: [
        { id: 5, title: 'Another Picture', release_date: '1960-01-01' },
        { id: 6, title: 'The Wind', release_date: '1928-03-01' },
      ] }));
    const done = resolveFilmsBatch([{ title: 'The Wind', year: '1927' }]);
    await jest.advanceTimersByTimeAsync(0);
    const resolved = await done;
    expect([...resolved.values()].map((m) => m.id)).toEqual([6]);
    expect(findFilm.mock.calls).toEqual([['The Wind', '1927'], ['The Wind']]);
  });

  it('a film of another year and another title is never taken for it', async () => {
    findFilm
      .mockImplementationOnce(async () => ({ results: [] }))
      .mockImplementationOnce(async () => ({ results: [{ id: 7, title: 'The Winds of Change', release_date: '1995-01-01' }] }));
    const done = resolveFilmsBatch([{ title: 'The Wind Machine', year: '1931' }]);
    await jest.advanceTimersByTimeAsync(0);
    expect((await done).size).toBe(0);
  });

  it('its own title, whatever its case and punctuation, is taken in another year only when no other film bears it', async () => {
    findFilm
      .mockImplementationOnce(async () => ({ results: [] }))
      .mockImplementationOnce(async () => ({ results: [{ id: 8, title: 'Häxan: Witchcraft Through the Ages', release_date: '1922-11-18' }] }));
    const done = resolveFilmsBatch([{ title: 'häxan witchcraft through the ages', year: '1919' }]);
    await jest.advanceTimersByTimeAsync(0);
    expect([...(await done).values()].map((m) => m.id)).toEqual([8]);
  });

  it('a title two films bear, decades apart, neither of them of its year, is left unmatched', async () => {
    findFilm
      .mockImplementationOnce(async () => ({ results: [] }))
      .mockImplementationOnce(async () => ({ results: [
        { id: 11, title: 'Suspiria', release_date: '1977-02-01' },
        { id: 12, title: 'Suspiria', release_date: '2018-10-26' },
      ] }));
    const done = resolveFilmsBatch([{ title: 'Suspiria', year: '1997' }]);
    await jest.advanceTimersByTimeAsync(0);
    expect((await done).size).toBe(0);
  });

  it('a remake is matched to itself, never to the original handed back first for a restoration that year', async () => {
    // As TMDB's any-release-that-year filter answered: the 1977 film, restored in 2018, ranked first.
    findFilm.mockImplementationOnce(async () => ({ results: [
      { id: 11, title: 'Suspiria', release_date: '1977-02-01' },
      { id: 12, title: 'Suspiria', release_date: '2018-10-26' },
    ] }));
    const done = resolveFilmsBatch([{ title: 'Suspiria', year: '2018' }]);
    await jest.advanceTimersByTimeAsync(0);
    expect([...(await done).values()].map((m) => m.id)).toEqual([12]);
  });
});

describe('a catalogue the house says is not answering', () => {
  const down = () => Promise.reject(Object.assign(new Error('status 504'), { name: 'TmdbUnreachable', answered: true }));

  it('is waited on, and the same film asked again: nothing blamed on the connection', async () => {
    findFilm.mockImplementationOnce(down).mockImplementation(theFilm);
    const progress: string[] = [];
    const done = resolveFilmsBatch(films(2, 500), (p) => { if (p.detail) progress.push(p.detail); });
    await jest.advanceTimersByTimeAsync(5000);
    expect([...(await done).values()].map((m) => m.title)).toEqual(['Reel 500', 'Reel 501']);
    expect(progress).toContain('The catalogue is not answering; asking again');
  });

  it('stops the import only when it keeps not answering, and says it is TMDB, not the connection', async () => {
    findFilm.mockImplementation(down);
    const said = resolveFilmsBatch(films(1, 600)).catch((e: Error) => e.message);
    await jest.advanceTimersByTimeAsync(BUSY_GIVE_UP_MS + 5000);
    await expect(said).resolves.toBe(CATALOGUE_DOWN);
    expect(CATALOGUE_DOWN).not.toMatch(/connection/i);
  });
});
