/**
 * A GENERATOR, not a test. Mounts the real film page with the real Odyssey
 * payload and converts the resolved tree to HTML, so the mockup is the page
 * rather than a drawing of it.
 *
 * Run: MOCKUPS=1 npx jest zz-film.gen  (see mockups/README.md)
 */
import React from 'react';
import { act, render, fireEvent } from '@testing-library/react-native';
import { toHtml } from '../../profile/__tests__/zz-render.lib';
import { LOCAL_ART } from '../../profile/__tests__/zz-art.gen';
import { LAYOUTS, atLayout, readFixture, whenRendering, writeScreen } from '@/mockups/paths';
import { FilmDetailLayout } from '../FilmDetailLayout';
import { FALL_MS } from '../FilmActionTray';
import { FilmDetailProvider } from '@/src/providers/FilmDetailProvider';
import { youtubeKey } from '@/src/utils/outsideValues';

jest.mock('expo-router', () => ({
  ...require('@/test-utils/expoRouterMock').expoRouterMock(),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  // The module's router, as the real one has it (the failed page names its way out).
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
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
/** And the frame the rest of the page waits for after the hero (FilmDetailLayout's heroDrawn), at once too. */
beforeEach(() => {
  jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((frame: FrameRequestCallback) => { frame(0); return 0; });
});
afterEach(() => jest.restoreAllMocks());
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
    SafeAreaProvider: ({ children, style }: any) => mockReact.createElement(View, { style: [{ flex: 1 }, style] }, children),
    SafeAreaView: ({ children, ...props }: any) => mockReact.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, ...require('@/mockups/paths').PHONE }),
  };
});
// The phone is 390pt; the test renderer says 750 and would lay out for a tablet.
// The text size is set per layout: the cast rail sizes itself from it, so the
// large-type picture has to be laid out at large type, not just drawn larger.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ ...require('@/mockups/paths').PHONE, scale: 3, fontScale: require('@/mockups/paths').textSize.scale }),
}));
// FlashList measures off-screen; lay the children out plainly so the geometry
// in the mockup is the geometry the phone draws.
jest.mock('@shopify/flash-list', () => require('@/mockups/tabs/flashListMock').makeFlashListMock());
// The member's country, fixed: a picture is the same on every machine, and this
// one is a member in Britain, whose certificate and services are Britain's.
jest.mock('@/src/utils/deviceRegion', () => ({ deviceRegion: () => 'GB', regionOf: () => 'GB' }));

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
const videos = (detail.videos?.results ?? []).filter((v: { site: string; key: string }) => v.site === 'YouTube' && youtubeKey(v.key)).slice(0, 6);
const value = {
  film: detail,
  reviews: [],
  reviewsFailed: false,
  reviewsReading: false,
  retry: jest.fn(),
  similarFilms: (detail.similar?.results ?? []).slice(0, 8),
  directors: crew.filter((c: { job: string }) => c.job === 'Director').slice(0, 4),
  cast: (detail.credits?.cast ?? []).slice(0, 10),
  videos,
  trailer: videos[0] ?? null,
  // Read, and nobody has rated it: the commonest film.
  verdict: { avg_rating: null, rating_count: 0, log_count: 0 },
  score: 26,
  // Every country's list, as the route hands it on (one country's would be read as the map).
  providers: detail['watch/providers']?.results ?? null,
  studios: detail.production_companies ?? [],
  existingLog: null,
  // The ledger held whole: a film it does not hold is known to be unseen.
  marksUnknown: null,
  rereadMarks: jest.fn(),
  isAuthenticated: true,
  // An archivist by default, so `film-built-locked` below is genuinely a
  // different picture rather than the same one under another name.
  isArchivist: true,
  user: { id: 'u1', is_social_private: false },
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
  playVideo: jest.fn(),
} as never;

/**
 * Two real-shaped critiques, for the state where the house has spoken: a ranked member with a name
 * of an ordinary length beside a rank (the byline's tightest line), and a short name with none.
 */
const CRITIQUES = [
  {
    id: 'c1', rating: 5, status: 'watched', created_at: '2026-07-21T20:00:00Z',
    user_id: 'm1', username: 'morpho.lumiere', role: 'auteur', avatar_url: null,
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
/** Nothing round a film but the film: no cast, no footage, nowhere to watch it, nobody's word. */
const ALONE = { cast: [], videos: [], trailer: null, similarFilms: [], providers: null, directors: [], studios: [] };
const UNRELEASED = { ...ALONE, film: { ...detail, release_date: '2031-07-16', status: 'Post Production', vote_average: 0, release_dates: null, budget: 0, revenue: 0 } };
const UNDATED = { ...ALONE, film: { ...detail, release_date: '', status: 'In Production', runtime: 0, vote_average: 0, release_dates: null, budget: 0, revenue: 0 } };
const EARLY = {
  ...ALONE,
  film: {
    ...detail, title: 'The Arrival of a Train', tagline: null, release_date: '1895-12-28', runtime: 1,
    genres: [{ id: 99, name: 'Documentary' }], production_countries: [{ iso_3166_1: 'FR', name: 'France' }],
    original_language: 'fr', release_dates: null, budget: 0, revenue: 0, vote_average: 7.1,
  },
};
const BARE = {
  ...ALONE,
  film: {
    ...detail, tagline: null, overview: '', release_date: '', status: 'Released', runtime: null, genres: [],
    production_countries: [], original_language: '', release_dates: null, budget: 0, revenue: 0, vote_average: 0,
    backdrop_path: null, poster_path: null,
  },
};
// A good id TMDB no longer has: the catalogue answered, and the answer is nothing.
const REMOVED = { film: null, validFilmId: 603, isError: false };

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
  // The member's ledger still being read, and not read: whether they have seen it is not known.
  ['film-built-tray-reading', { marksUnknown: 'reading' }, true],
  ['film-built-tray-unread', { marksUnknown: 'failed' }, true],

  /**
   * ── FILMS AT THEIR EXTREMES ──────────────────────────────────────────────
   * A film the house has not reached the date of, one with no date and a
   * reason, one from 1895, one TMDB knows nothing about, and an id TMDB
   * has since removed.
   */
  ['film-built-unreleased', { ...UNRELEASED }, false],
  ['film-built-undated', { ...UNDATED }, false],
  ['film-built-1890s', { ...EARLY }, false],
  // Drawn shut: the page is the extreme here, and an open tray holds the page behind it still.
  ['film-built-bare', { ...BARE }, false],
  ['film-built-removed', { ...REMOVED }, false],
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
    const CHROME_ONLY = ['film-built-loading', 'film-built-notfound', 'film-built-error', 'film-built-removed'];
    expect(html.length).toBeGreaterThan(CHROME_ONLY.includes(name.split('@')[0]) ? 1500 : 5000);
  });
});

// A real test, not a picture: it runs on every test run.
describe('the film page', () => {
  const page = (over: Record<string, unknown> = {}) => render(
    <FilmDetailProvider value={{ ...(value as object), ...over } as never}>
      <FilmDetailLayout />
    </FilmDetailProvider>,
  );

  it('says when the critiques could not be read, and asks again', async () => {
    const retry = jest.fn();
    const r = page({ reviewsFailed: true, retry });
    expect(r.getByText('The critiques could not be reached.')).toBeTruthy();
    expect(r.queryByText('The projection box awaits.')).toBeNull();
    await fireEvent.press(r.getByLabelText('Try again: ask for the critiques'));
    expect(retry).toHaveBeenCalled();
  });

  it('draws the hero with its film alone, and the rest of the page the frame after', async () => {
    // The frame held: what the answer's own commit draws (P4.53, critical-path.mjs).
    let next: FrameRequestCallback | null = null;
    (globalThis.requestAnimationFrame as unknown as jest.Mock).mockImplementation((frame: FrameRequestCallback) => { next = frame; return 1; });
    const r = page();
    expect(r.getByText((value as unknown as { film: { title: string } }).film.title)).toBeTruthy();
    expect(r.queryByText('THE PLAYERS')).toBeNull();
    expect(r.queryByText('The projection box awaits.')).toBeNull();
    expect(next).not.toBeNull();
    await act(async () => { next?.(0); });
    expect(r.getByText('THE PLAYERS')).toBeTruthy();
    expect(r.getByText('The projection box awaits.')).toBeTruthy();
  });

  it('invites the first voice only when the critiques were read', () => {
    const r = page();
    expect(r.getByText('The projection box awaits.')).toBeTruthy();
    expect(r.queryByText('The critiques could not be reached.')).toBeNull();
  });

  it('while the critiques are still coming, sets down no section at all: no invitation, nothing to leap up the page', () => {
    const r = page({ reviewsReading: true });
    expect(r.queryByText('The projection box awaits.')).toBeNull();
    expect(r.queryByText('The critiques could not be reached.')).toBeNull();
    expect(r.getByText('THE PLAYERS')).toBeTruthy();
  });

  it('rates and lists for the member’s own country, and says which', () => {
    const r = page();
    expect(r.getByText('PG  ·  GB')).toBeTruthy();
    expect(r.getByText('LISTED FOR UNITED KINGDOM')).toBeTruthy();
    expect(r.getByText('RENT')).toBeTruthy();
    expect(r.getByText('BUY')).toBeTruthy();
    expect(r.queryByText('STREAM FREE')).toBeNull();
  });

  it('claims no verdict it does not know', () => {
    const r = page({ verdict: null });
    expect(r.queryByText('THE HOUSE HAS NOT SPOKEN')).toBeNull();
    expect(r.getByTestId('verdict-unknown', { includeHiddenElements: true })).toBeTruthy();
  });

  it('a film the ledger does not hold, while it is read, is never offered as unseen: nothing files a viewing', async () => {
    const handleLog = jest.fn();
    const rereadMarks = jest.fn();
    const r = page({ marksUnknown: 'reading', handleLog, rereadMarks });
    expect(r.getByText('READING YOUR LEDGER')).toBeTruthy();
    expect(r.queryByText('LOG THIS FILM')).toBeNull();
    expect(r.queryByText('NOT YET SEEN')).toBeNull();
    await fireEvent.press(r.getByTestId('film-stub'));
    expect(r.queryByText('ADD TO THE WATCHLIST')).toBeNull();
    expect(r.getByText('READING YOUR WATCHLIST')).toBeTruthy();
    await fireEvent.press(r.getByTestId('film-act-log'));
    expect(handleLog).not.toHaveBeenCalled();
    expect(rereadMarks).toHaveBeenCalled();
  });

  it('a ledger that could not be read is said, and asked for again', async () => {
    const rereadMarks = jest.fn();
    const r = page({ marksUnknown: 'failed', rereadMarks });
    expect(r.getByText('YOUR LEDGER UNREAD')).toBeTruthy();
    await fireEvent.press(r.getByTestId('film-stub'));
    expect(r.getByText('YOUR LEDGER COULD NOT BE READ')).toBeTruthy();
    await fireEvent.press(r.getByTestId('film-act-watchlist'));
    expect(rereadMarks).toHaveBeenCalled();
  });

  it('a film the ledger holds is known, read or not: its log is never hidden behind the read', async () => {
    const r = page({ marksUnknown: 'reading', existingLog: MY_LOG });
    expect(r.getByText('SEEN ×2')).toBeTruthy();
    await fireEvent.press(r.getByTestId('film-stub'));
    expect(r.getByText('EDIT YOUR LOG')).toBeTruthy();
  });

  it('a film whose date is still ahead OPENS then, and is never released', () => {
    const r = page(UNRELEASED);
    expect(r.getByText('OPENS')).toBeTruthy();
    expect(r.getByText('JULY 16, 2031')).toBeTruthy();
    expect(r.queryByText('RELEASE')).toBeNull();
    // The hero is read aloud as one label; its lines are drawn, and hidden from the reader.
    expect(r.getByText(/^1H 50M\s+·\s+2031\s+·\s+US$/, { includeHiddenElements: true })).toBeTruthy();
  });

  it('a film with no date says why, where its year goes and in the particulars', () => {
    const r = page(UNDATED);
    expect(r.getByText(/^—\s+·\s+IN PRODUCTION\s+·\s+US$/, { includeHiddenElements: true })).toBeTruthy();
    expect(r.getByText('In production')).toBeTruthy();
  });

  it('a film of 1895 reads as 1895, and its day as the day it was', () => {
    const r = page(EARLY);
    expect(r.getByText('1M  ·  1895  ·  FR  ·  TMDB 7.1', { includeHiddenElements: true })).toBeTruthy();
    expect(r.getByText('RELEASE')).toBeTruthy();
    expect(r.getByText('DECEMBER 28, 1895')).toBeTruthy();
  });

  it('a film nothing is known of says one dash, never a value it made up', async () => {
    const r = page(BARE);
    await fireEvent.press(r.getByTestId('film-stub'));
    // The meta line under the title, and the tray's own line under it.
    expect(r.getAllByText('—', { includeHiddenElements: true })).toHaveLength(2);
    expect(r.queryByText(/—  ·  —/, { includeHiddenElements: true })).toBeNull();
    expect(r.queryByText('RELEASE')).toBeNull();
    // Every word the page draws, read off the tree.
    const said: string[] = [];
    const read = (n: unknown): void => {
      if (typeof n === 'string') said.push(n);
      else if (Array.isArray(n)) n.forEach(read);
      else if (n && typeof n === 'object') read((n as { children?: unknown }).children);
    };
    read(r.toJSON());
    expect(said.length).toBeGreaterThan(20);
    expect(said.filter((w) => /undefined|null|NaN|Invalid Date|\$0\.0M|^0M/.test(w))).toEqual([]);
    // Shut again, the page drawn whole: an open tray holds the page behind it still.
    await fireEvent.press(r.getByTestId('film-tray-scrim'));
    await act(async () => { await new Promise((done) => setTimeout(done, FALL_MS + 20)); });
    expect(r.queryByTestId('film-action-tray')).toBeNull();
  });

  it('an id TMDB has removed is not in the Archive: never unreachable, never an empty page', () => {
    const r = page(REMOVED);
    expect(r.getByText('Not in the Archive')).toBeTruthy();
    expect(r.queryByText('Transmission Interrupted')).toBeNull();
    expect(r.getByLabelText(/Go back|Return to the Lobby/)).toBeTruthy();
  });

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
