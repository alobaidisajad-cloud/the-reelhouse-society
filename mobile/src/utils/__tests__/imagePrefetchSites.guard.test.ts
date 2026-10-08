/**
 * imagePrefetchSites.guard.test.ts — a picture is fetched ahead only where a
 * screen is about to draw it, at the size it draws it; and never at start-up.
 *
 * On Android, expo-image's prefetch does not just download: it decodes each
 * picture whole into memory, under a key no view ever asks for (a view's key
 * carries its own size). The disk copy is shared; the decode is waste. The app
 * once fetched up to ~85 posters ahead as a member's cold start began — 50 log
 * posters at w500, watchlist and archive posters at w342, fifteen trending ones —
 * none at a size any screen draws them; fifteen alone cost a fresh start a
 * half-second native-memory collection (study run 37628665206).
 *
 * So: every place that fetches ahead is listed here, with the size it fetches
 * and the screen that draws that picture at that size; a new place fails until
 * it is added with both. And the store a cold start restores fetches nothing.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative, sep } from 'path';

const MOBILE = join(__dirname, '..', '..', '..');
const read = (f: string) => readFileSync(join(MOBILE, f), 'utf8');

/** Every place allowed to fetch a picture ahead: the size, and who draws it at that size. */
const SITES: Record<string, { size: string; drawnBy: string; calls: number }> = {
  // The posters the tab is about to draw, as the member opens it.
  'src/components/profile/ProfileWatchlistTab.tsx': { size: 'w185', drawnBy: 'src/components/profile/ProfilePosterCard.tsx', calls: 1 },
  'src/components/profile/ProfileLedgerTab.tsx': { size: 'w185', drawnBy: 'src/components/profile/ProfileLedgerTab.tsx', calls: 1 },
  'src/components/profile/ProfilePhysicalTab.tsx': { size: 'w185', drawnBy: 'src/components/profile/ProfilePhysicalTab.tsx', calls: 1 },
  // The first four of each stack, a second after the Stacks are read.
  'src/stores/domain/listSlice.ts': { size: 'w185', drawnBy: 'src/components/profile/ProfileListsTab.tsx', calls: 1 },
};

const files: string[] = [];
const walk = (dir: string) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '__tests__'].includes(e.name)) walk(p); } else if (/\.tsx?$/.test(e.name)) files.push(p);
  }
};
walk(join(MOBILE, 'app'));
walk(join(MOBILE, 'src'));
const rel = (p: string) => relative(MOBILE, p).split(sep).join('/');

describe('the places that fetch a picture ahead', () => {
  const found = Object.fromEntries(files
    .map((f) => [rel(f), (readFileSync(f, 'utf8').match(/\bprefetch\s*\(/g) ?? []).length] as const)
    .filter(([, n]) => n > 0));

  it('are the listed ones, each as many times as listed — a new one is added here with its size and its screen', () => {
    expect(Object.keys(found).length).toBeGreaterThan(0);
    expect(found).toEqual(Object.fromEntries(Object.entries(SITES).map(([f, s]) => [f, s.calls])));
  });

  it('each fetches the size its screen draws, and that screen draws it', () => {
    for (const [file, { size, drawnBy }] of Object.entries(SITES)) {
      const sizes = (src: string) => [...src.matchAll(/tmdb\.poster\([^)]*'(w\d+|original)'\)/g)].map((m) => m[1]);
      expect({ file, fetches: [...new Set(sizes(read(file)))] }).toEqual({ file, fetches: [size] });
      expect({ drawnBy, draws: sizes(read(drawnBy)) }).toEqual({ drawnBy, draws: expect.arrayContaining([size]) });
    }
  });
});

describe('a cold start', () => {
  const mockStored: { value: string | null } = { value: null };
  beforeAll(() => {
    jest.resetModules();
  });

  it('restores the films store without fetching a picture or a list ahead', async () => {
    const film = (id: number) => ({ id, title: `Film ${id}`, poster_path: `/p${id}.jpg`, year: 2020 });
    mockStored.value = JSON.stringify({
      state: { logs: [], watchlist: [film(1), film(2)], physicalArchive: [film(3)], lists: [], interactions: [] },
      version: 0,
    });
    jest.doMock('@/src/stores/mmkv-storage', () => ({
      ...jest.requireActual('@/src/stores/mmkv-storage'),
      createAsyncMMKVStorage: () => ({
        // As the app's storage hands it back: already parsed.
        getItem: () => (mockStored.value ? JSON.parse(mockStored.value) : null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      }),
    }));
    // The store's own copies of both: modules were reset for the stored state above.
    const prefetch = jest.spyOn(require('expo-image').Image, 'prefetch');
    const trending = jest.spyOn(require('@/src/lib/tmdb').tmdb, 'trending');
    const { rehydrateFilmStore, useFilmStore } = require('@/src/stores/films');
    await rehydrateFilmStore();
    await new Promise((r) => setTimeout(r, 0));
    // It did restore: the watchlist is back, so a fetch had every reason to run.
    expect(useFilmStore.getState().watchlist.map((w: { id: number }) => w.id)).toEqual([1, 2]);
    expect(prefetch).not.toHaveBeenCalled();
    expect(trending).not.toHaveBeenCalled();
  });
});
