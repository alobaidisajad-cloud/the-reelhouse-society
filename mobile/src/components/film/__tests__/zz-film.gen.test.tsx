/**
 * A GENERATOR, not a test. Mounts the real film page with the real Odyssey
 * payload and converts the resolved tree to HTML, so the mockup is the page
 * rather than a drawing of it.
 *
 * Run: MOCKUPS=1 npx jest zz-film.gen  (see mockups/README.md)
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { toHtml } from '../../profile/__tests__/zz-render.lib';
import { LOCAL_ART } from '../../profile/__tests__/zz-art.gen';
import { LAYOUTS, atLayout, readFixture, whenRendering, writeScreen } from '@/mockups/paths';
import { FilmDetailLayout } from '../FilmDetailLayout';
import { FilmDetailProvider } from '@/src/providers/FilmDetailProvider';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: '1' }),
  useFocusEffect: () => {},
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn(),
}));
/**
 * Everything below the action row waits on `InteractionManager` — a good
 * pattern on a device, and in a static render it simply never fires, so the
 * first pass produced a page with two images on it. Run the callback at once.
 */
jest.mock('react-native/Libraries/Interaction/InteractionManager', () => ({
  __esModule: true,
  default: {
    runAfterInteractions: (fn: () => void) => { fn(); return { cancel: () => {} }; },
    createInteractionHandle: () => 1,
    clearInteractionHandle: () => {},
  },
  runAfterInteractions: (fn: () => void) => { fn(); return { cancel: () => {} }; },
}));
/**
 * Real safe-area insets, for this generator only.
 *
 * The suite-wide mock returns zeros, which is the right neutral for a test and
 * the wrong thing for a PICTURE: with `top: 0` the floating back button lands
 * at 20pt, underneath the status bar, and the mockup shows a collision that
 * does not exist on a device. iPhone 14: 59 above, 34 below.
 */
jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: any) => mockReact.createElement(View, null, children),
    SafeAreaView: ({ children, ...props }: any) => mockReact.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});
// The phone is 390pt; the test renderer says 750 and would lay out for a tablet.
// The text size is set per layout: the cast rail sizes itself from it, so the
// large-type picture has to be laid out at large type, not just drawn larger.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: require('@/mockups/paths').textSize.scale }),
}));
// FlashList measures off-screen; lay the children out plainly so the geometry
// in the mockup is the geometry the phone draws.
jest.mock('@shopify/flash-list', () => require('@/mockups/tabs/flashListMock').makeFlashListMock());

/**
 * ── THE FIXTURE LIVES IN THE PROJECT ─────────────────────────────────────────
 * `odyssey.json` is a TMDB film, fetched once; it is the film this generator
 * draws. It used to sit in a temporary folder the operating system clears, and
 * the generator had to skip itself when it vanished. It is in `mockups/fixtures`
 * now, committed — it cannot be re-fetched here, because the TMDB key is
 * server-side only by design.
 */
const detail = readFixture<any>('odyssey.json');
const posters: Record<string, { title: string; data: string }> = {};
for (const [p, data] of Object.entries(readFixture<Record<string, string>>('odyssey-art.json'))) posters[p] = { title: '', data };

/** Derived exactly as app/film/[id].tsx derives it. */
const crew = detail.credits?.crew ?? [];
const videos = (detail.videos?.results ?? []).filter((v: { site: string }) => v.site === 'YouTube').slice(0, 6);
const value = {
  film: detail,
  reviews: [],
  reviewsError: null,
  similarFilms: (detail.similar?.results ?? []).slice(0, 8),
  directors: crew.filter((c: { job: string }) => c.job === 'Director').slice(0, 4),
  cast: (detail.credits?.cast ?? []).slice(0, 10),
  videos,
  trailer: videos[0] ?? null,
  verdict: null,
  score: 26,
  providers: detail['watch/providers']?.results?.US ?? null,
  studios: detail.production_companies ?? [],
  existingLog: null,
  isAuthenticated: true,
  // An archivist by default, so `film-built-locked` below is genuinely a
  // different picture rather than the same one under another name.
  isArchivist: true,
  user: { id: 'u1' },
  validFilmId: detail.id,
  loading: false,
  isError: false,
  isFocused: true,
  goBack: jest.fn(),
  handleLog: jest.fn(),
  handleRewatch: jest.fn(),
  handleOpenTrailer: jest.fn(),
  handleOpenShare: jest.fn(),
  handleOpenLounge: jest.fn(),
  handleReadFullLog: jest.fn(),
  setTrailerModalVisible: jest.fn(),
  setActiveTrailerKey: jest.fn(),
} as never;

/** Two real-shaped critiques, for the state where the house has spoken. */
const CRITIQUES = [
  {
    id: 'c1', rating: 5, status: 'watched', created_at: '2026-07-21T20:00:00Z',
    user_id: 'm1', username: 'morpho', role: 'auteur', avatar_url: null,
    review: 'If the Iliad was the epic of war, the Odyssey is the epic of what war leaves inside a man. Nolan choosing the aftermath over the battle is the whole argument.',
    pull_quote: null, drop_cap: true, is_spoiler: false, abandoned_reason: null,
  },
  {
    id: 'c2', rating: 4, status: 'watched', created_at: '2026-07-18T20:00:00Z',
    user_id: 'm2', username: 'ug.mb', role: 'cinephile', avatar_url: null,
    review: 'Three hours that never once checked its watch. The sea is a character and it is furious.',
    pull_quote: null, drop_cap: false, is_spoiler: false, abandoned_reason: null,
  },
] as never[];

const MY_LOG = {
  id: 'own', status: 'rewatched', rating: 4, viewCount: 2, watchedDate: '2026-07-21T20:00:00Z',
  review: 'Second time through and the sea is louder. What reads as an epic the first time reads as a man being punished by weather for ten years.',
} as never;

/**
 * The states, rendered from the SHIPPED page rather than a drawing of it.
 * `press` opens the tray by pressing the stub — the real control, the real
 * state change — so what is photographed is what a member would get.
 */
const STATES: [string, Record<string, unknown>, boolean][] = [
  ['film-built', {}, false],
  ['film-built-society', { reviews: CRITIQUES, existingLog: MY_LOG, verdict: { avg_rating: 4.5, rating_count: 30, log_count: 37 } }, false],
  ['film-built-tray', {}, true],
  ['film-built-tray-logged', { reviews: CRITIQUES, existingLog: MY_LOG, verdict: { avg_rating: 4.5, rating_count: 30, log_count: 37 } }, true],
  ['film-built-locked', { isArchivist: false }, true],
  ['film-built-noart', { film: { ...detail, backdrop_path: null, poster_path: null } }, false],

  /**
   * ── THE STATES NOTHING HAD EVER RENDERED ─────────────────────────────────
   * Every defect on this page was found by looking at something for the first
   * time. These five had never been drawn once — and the first two consume
   * `backdropHeightRatio`, which this pass changed from 0.65 to 0.52.
   */
  ['film-built-loading', { loading: true }, false],
  ['film-built-notfound', { film: null, validFilmId: false }, false],
  ['film-built-error', { film: null, isError: true }, false],
  // Archive-diving turns up films with almost nothing attached to them.
  ['film-built-sparse', {
    cast: [], videos: [], similarFilms: [], providers: null, directors: [], studios: [],
    film: { ...detail, tagline: null, overview: '', release_dates: null },
  }, false],
  // Signed out: every act must route to the door rather than fail quietly.
  ['film-built-signedout', { isAuthenticated: false, isArchivist: false, existingLog: null }, true],
];

/**
 * Each state in every layout (see `LAYOUTS`). The measuring tools open the
 * large ones when they measure at large sizes, so a box that sizes itself from
 * the text size is seen at its real size.
 */
const RUNS = STATES.flatMap(([name, over, tray]) => LAYOUTS.map((l) => [`${name}${l.suffix}`, over, tray, l] as const));

whenRendering('film page generator', () => {
  it.each(RUNS)('writes %s from the built page', async (name, over, openTray, layout) => {
    const html = await atLayout(layout, async () => {
      const r = render(
        <FilmDetailProvider value={{ ...(value as object), ...over } as never}>
          <FilmDetailLayout />
        </FilmDetailProvider>,
      );
      if (openTray) {
        // The real control, pressed. State never flushes synchronously here, so
        // this MUST be awaited or the tray is photographed shut.
        await fireEvent.press(r.getByTestId('film-stub'));
      }
      return toHtml(r.toJSON(), { posters, local: LOCAL_ART });
    });
    writeScreen(name, html);
    console.log(`${name}:`, html.length, 'bytes |',
      (html.match(/<img /g) || []).length, 'images |',
      (html.match(/class="poster"/g) || []).length, 'empty frames');
    /**
     * A floor, not a target. 5,000 was written when every state was a whole
     * page; the skeleton and the two error screens are legitimately a few
     * hundred bytes of chrome and nothing else. The point of the check is
     * "something rendered", so each state gets the floor it can actually meet.
     */
    const CHROME_ONLY = ['film-built-loading', 'film-built-notfound', 'film-built-error'];
    expect(html.length).toBeGreaterThan(CHROME_ONLY.includes(name.split('@')[0]) ? 1500 : 5000);
  });
});

// A real test, not a picture: it runs on every test run.
describe('the film page', () => {
  it('the tray really opens — otherwise every tray shot is a shut one', async () => {
    const r = render(
      <FilmDetailProvider value={value as never}>
        <FilmDetailLayout />
      </FilmDetailProvider>,
    );
    expect(r.queryByTestId('film-action-tray')).toBeNull();
    await fireEvent.press(r.getByTestId('film-stub'));
    expect(r.getByTestId('film-action-tray')).toBeTruthy();
  });
});
