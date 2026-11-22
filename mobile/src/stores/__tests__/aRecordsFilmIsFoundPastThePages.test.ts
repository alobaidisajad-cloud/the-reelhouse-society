/**
 * A queued replay from an older build names only its record, and the queue asks the films store for
 * that record's film (filmOfRecord), to read the film's verdict again once the replay is delivered.
 * The store held its answer to the newest pages, so a record older than them named no film, and
 * the film's page kept its old verdict. Its film is found in the index of films logged too.
 */
import { useFilmStore } from '@/src/stores/films';
import { filmOfRecord } from '@/src/utils/recordsFilm';

const NEW = '11111111-1111-4111-8111-111111111111';
const OLD = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  useFilmStore.setState({
    logs: [{ id: NEW, filmId: 603, title: 'The Matrix' }] as never,
    // An older record, past the pages, as the marks ledger holds it: light, its film named.
    _loggedIndex: { 603: { id: NEW, filmId: 603 }, 11: { id: OLD, filmId: 11, light: true } } as never,
  });
});

describe("a record's film", () => {
  it('is found in the pages', () => {
    expect(filmOfRecord(NEW)).toBe(603);
  });

  it('is found for a record older than the pages, by the index of films logged', () => {
    expect(filmOfRecord(OLD)).toBe(11);
  });

  it('is none for a record the phone holds nowhere', () => {
    expect(filmOfRecord('33333333-3333-4333-8333-333333333333')).toBeNull();
  });
});
