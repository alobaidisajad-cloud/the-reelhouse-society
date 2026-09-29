/**
 * anImportNeverDropsWhatItCouldNotAsk.test.ts — film matching, when the
 * catalogue cannot be asked.
 *
 * Every film is matched against the catalogue before a single row is written.
 * A catalogue that dropped out mid-way used to be read as "no such film": each
 * film after it was counted unmatched and left out of the import for good, and
 * the member was told their films could not be matched. Now the import stops
 * there, having written nothing, and says why.
 */
import { resolveFilmsBatch, CATALOGUE_AWAY } from '../archiveImport';

jest.mock('@/src/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('@/src/lib/tmdb', () => ({ tmdb: { search: jest.fn() } }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: jest.fn(() => ({ user: null })) } }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'test-uuid') }));
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn(), readAsStringAsync: jest.fn(), EncodingType: {} }));

const { tmdb: mockTmdb } = jest.requireMock('@/src/lib/tmdb');
const away = () => Promise.reject(Object.assign(new Error('offline'), { name: 'TmdbUnreachable' }));
const found = (id: number, title: string, year: string) =>
  Promise.resolve({ results: [{ id, title, media_type: 'movie', release_date: `${year}-01-01` }], searchType: 'exact' });

beforeEach(() => mockTmdb.search.mockReset());

it('stops, and says so, when the catalogue cannot be asked — it never calls a film unmatched for it', async () => {
  mockTmdb.search
    .mockImplementationOnce(() => found(1, 'Sunrise', '1927'))
    .mockImplementation(away);
  await expect(resolveFilmsBatch([
    { title: 'Sunrise', year: '1927' },
    { title: 'Greed', year: '1924' },
    { title: 'Nosferatu', year: '1922' },
  ])).rejects.toThrow(CATALOGUE_AWAY);
  // It stopped at the first it could not ask, rather than asking the rest into the void.
  expect(mockTmdb.search).toHaveBeenCalledTimes(2);
});

it('a film the catalogue answered for with nothing is unmatched, and the import goes on', async () => {
  mockTmdb.search
    .mockImplementationOnce(() => Promise.resolve({ results: [], searchType: 'failed' }))
    .mockImplementationOnce(() => Promise.resolve({ results: [], searchType: 'failed' }))
    .mockImplementationOnce(() => found(3, 'Metropolis', '1927'));
  const resolved = await resolveFilmsBatch([
    { title: 'Zzqxv Lost Reel', year: '1911' },
    { title: 'Metropolis', year: '1927' },
  ]);
  expect([...resolved.values()].map((m) => m.title)).toEqual(['Metropolis']);
});
