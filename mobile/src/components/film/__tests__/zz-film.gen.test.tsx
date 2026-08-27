/**
 * A GENERATOR, not a test. Mounts the real film page with the real Odyssey
 * payload and converts the resolved tree to HTML, so the mockup is the page
 * rather than a drawing of it.
 *
 * Run: npx jest zz-film.gen
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { toHtml } from '../../profile/__tests__/zz-render.lib';
import { LOCAL_ART } from '../../profile/__tests__/zz-art.gen';
import { FilmDetailLayout } from '../FilmDetailLayout';
import { FilmDetailProvider } from '@/src/providers/FilmDetailProvider';

const SP = 'C:/Users/OMEN/AppData/Local/Temp/claude/C--Users-OMEN-OneDrive-Desktop-divisionops-reelhouse-mobile/e2141512-2b50-44d3-be60-96590e558dd6/scratchpad';
const ART = join(SP, 'art');
const OUT = join(SP, 'mockups');

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
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));
// FlashList measures off-screen; lay the children out plainly so the geometry
// in the mockup is the geometry the phone draws.
jest.mock('@shopify/flash-list', () => {
  const mockRN = require('react-native');
  const mockReact = require('react');
  const Mocked = mockReact.forwardRef(function MockFlashList(props: any, ref: any) {
    const data = props.data || [];
    const asEl = (C: any) => (!C ? null : mockReact.isValidElement(C) ? C : mockReact.createElement(C));
    const items = data.map((item: any, index: number) =>
      mockReact.createElement(
        mockRN.View,
        { key: props.keyExtractor ? props.keyExtractor(item, index) : String(index) },
        props.renderItem ? props.renderItem({ item, index }) : null,
      ),
    );
    const sep = props.ItemSeparatorComponent;
    const withSeps: any[] = [];
    items.forEach((el: any, i: number) => {
      withSeps.push(el);
      if (sep && i < items.length - 1) withSeps.push(mockReact.createElement(sep, { key: 's' + i }));
    });
    return mockReact.createElement(
      mockRN.View,
      { ref, style: [props.horizontal ? { flexDirection: 'row' } : null, props.contentContainerStyle] },
      asEl(props.ListHeaderComponent),
      withSeps,
      asEl(props.ListFooterComponent),
    );
  });
  return { FlashList: Mocked, FlashListProps: {} };
});

const detail = JSON.parse(readFileSync(join(ART, 'odyssey.json'), 'utf8'));
const rawArt = JSON.parse(readFileSync(join(ART, 'odyssey-art.json'), 'utf8')) as Record<string, string>;
const posters: Record<string, { title: string; data: string }> = {};
for (const [p, data] of Object.entries(rawArt)) posters[p] = { title: '', data };

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
];

describe('film page generator', () => {
  it.each(STATES)('writes %s from the built page', async (name, over, openTray) => {
    mkdirSync(OUT, { recursive: true });
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
    const html = toHtml(r.toJSON(), { posters, local: LOCAL_ART });
    writeFileSync(join(OUT, `${name}.html`), html, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`${name}:`, html.length, 'bytes |',
      (html.match(/<img /g) || []).length, 'images |',
      (html.match(/class="poster"/g) || []).length, 'empty frames');
    expect(html.length).toBeGreaterThan(5000);
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
