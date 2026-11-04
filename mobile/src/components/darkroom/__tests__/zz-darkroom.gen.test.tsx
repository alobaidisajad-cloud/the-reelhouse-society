/**
 * A GENERATOR, not a test. The Darkroom in every state its drawing shows
 * (design/redesign/darkroom-final): the room as first opened, a bath chosen, the
 * settings open, a search with an artist and an undeveloped plate, the sheet
 * developing, a search that matches nothing, settings that develop nothing, the
 * archives unreachable with the last visit's prints and with nothing kept, a
 * right-to-left search, and the small hours. Each at every layout CI measures.
 *
 * Run: MOCKUPS=1 npx jest zz-darkroom.gen  (see mockups/README.md)
 */
import React, { act } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { toHtml } from '@/src/components/profile/__tests__/zz-render.lib';
import { LAYOUTS, atLayout, readFixture, whenRendering, writeScreen } from '@/mockups/paths';
import { LOCAL_ART } from '@/src/components/profile/__tests__/zz-art.gen';
import { supabaseFake } from '@/test-utils/supabaseFake';

const LISTS = readFixture<any>('lobby.json');
const RAW = readFixture<Record<string, string>>('lobby-art.json');
const posters: Record<string, { title: string; data: string }> = {};
for (const [p, data] of Object.entries(RAW)) if (data) posters[p] = { title: '', data };

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ ...require('@/mockups/paths').PHONE, scale: 3, fontScale: require('@/mockups/paths').textSize.scale }),
}));
const mockUser = { id: 'me', username: 'kane', role: 'archivist', tier: 'archivist', preferences: {}, is_social_private: false };
jest.mock('@/src/stores/auth', () => {
  const build = () => ({ user: mockUser, isAuthenticated: true });
  const useAuthStore = (sel?: (s: unknown) => unknown) => (sel ? sel(build()) : build());
  (useAuthStore as any).getState = () => build();
  return { useAuthStore };
});
jest.mock('expo-router', () => ({
  ...require('@/test-utils/expoRouterMock').expoRouterMock(),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}), useFocusEffect: () => {},
}));
jest.mock('expo-router/react-navigation', () => ({ ...require('@/test-utils/navigationMock').navigationMock(), useScrollToTop: jest.fn(), useIsFocused: () => true }));
// The connection, as each state needs it.
let mockOnline = true;
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  useNetInfo: () => ({ isConnected: mockOnline }),
  default: { addEventListener: () => () => {} },
}));
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
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
jest.mock('@shopify/flash-list', () => require('@/mockups/tabs/flashListMock').makeFlashListMock());
/** The house, as strict as production: each state's data is set in the stores, so it holds nothing. */
const mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
// What the catalogue answers, as each state needs it: a page, nothing, refused, or not yet.
let mockAnswer: () => Promise<unknown> = () => Promise.resolve({ results: [], total_pages: 1 });
jest.mock('@/src/lib/tmdb', () => ({
  tmdb: {
    discover: jest.fn(() => mockAnswer()),
    search: jest.fn(() => mockAnswer()),
    poster: (p: string, s: string) => `https://image.tmdb.org/t/p/${s}${p}`,
    profile: (p: string, s: string) => `https://image.tmdb.org/t/p/${s}${p}`,
  },
}));
// eslint-disable-next-line import/first
import DarkroomScreen from '@/app/(tabs)/darkroom';
// eslint-disable-next-line import/first
import { useDiscoverStore, sheetCacheKey } from '@/src/stores/discover';
// eslint-disable-next-line import/first
import { useFilmStore } from '@/src/stores/films';
// eslint-disable-next-line import/first
import { storage } from '@/src/stores/mmkv-storage';
// eslint-disable-next-line import/first
import { MOODS } from '@/src/components/darkroom/constants';

type Film = { id: number; title?: string; name?: string; poster_path?: string | null; profile_path?: string | null; release_date?: string; media_type?: string };
const canon = (LISTS.canon as Film[]).slice(0, 12).map((f) => ({ id: f.id, title: f.title, poster_path: f.poster_path, release_date: f.release_date }));
const ARTIST: Film = { id: 9001, name: 'Hayao Miyazaki', media_type: 'person', profile_path: canon[0]!.poster_path };
const SEARCHED: Film[] = [ARTIST, ...canon.slice(0, 6).map((f, i) => (i === 4 ? { ...f, poster_path: null, title: 'Obsession' } : f))];
const ARABIC: Film[] = [
  { id: 9101, title: 'الرسالة', poster_path: null, release_date: '1976-03-09' },
  { ...canon[2]!, title: 'رسالة إلى الوالي', release_date: '1998-01-01' },
];
const DEFAULT_SHEET = sheetCacheKey(`default:null_popularity.desc_____0`);

const page = (results: Film[]) => () => Promise.resolve({ results, total_pages: results.length ? 3 : 0 });
const lastPage = (results: Film[]) => () => Promise.resolve({ results, total_pages: 1 });
const refused = () => Promise.reject(new Error('the archives are away'));
const never = () => new Promise<never>(() => {});

type State = {
  online?: boolean;
  answer: () => Promise<unknown>;
  store?: Record<string, unknown>;
  kept?: Film[];
  hour?: number;
  press?: string;
};
const STATES: [string, State][] = [
  ['dr-open', { answer: page(canon) }],
  ['dr-mood', { answer: page(canon.slice(0, 9)), store: { mood: MOODS[1] } }],
  ['dr-filters', { answer: page(canon.slice(0, 6)), store: { filters: { ...useDiscoverStore.getState().filters, genreId: 18, decade: { label: '1990s', from: '1990-01-01', to: '1999-12-31' }, sortBy: 'vote_average.desc' } }, press: 'Expand filters' }],
  ['dr-search', { answer: lastPage(SEARCHED), store: { query: 'miyazaki', inputVal: 'miyazaki' } }],
  ['dr-loading', { answer: never }],
  ['dr-nomatch', { answer: lastPage([]), store: { query: 'the glowing briefcase', inputVal: 'the glowing briefcase' } }],
  ['dr-nothing', { answer: lastPage([]), store: { filters: { ...useDiscoverStore.getState().filters, genreId: 99, minRating: 8.5, language: 'hi' } } }],
  ['dr-offline', { answer: refused, kept: canon.slice(0, 9) }],
  ['dr-offline-none', { online: false, answer: refused }],
  ['dr-rtl', { answer: lastPage(ARABIC), store: { query: 'الرسالة', inputVal: 'الرسالة' } }],
  ['dr-late', { answer: page(canon), hour: 3 }],
];

const RUNS = STATES.flatMap(([name, state]) => LAYOUTS.map((l) => [`${name}${l.suffix}`, state, l] as const));

whenRendering('darkroom generator', () => {
  it.each(RUNS)('writes %s', async (name, state, layout) => {
    mockOnline = state.online ?? true;
    mockAnswer = state.answer;
    storage.clearAll();
    if (state.kept) storage.set(DEFAULT_SHEET, JSON.stringify(state.kept));
    useDiscoverStore.setState({
      page: 1, query: '', inputVal: '', mood: null, accumulatedFilms: [],
      filters: { genreId: null, decade: null, yearFrom: null, yearTo: null, language: null, sortBy: 'popularity.desc', minRating: 0 },
      ...state.store,
    } as never);
    // Two films logged, two saved, the ledger held: the edge prints show their ticks and SAVEs.
    useFilmStore.setState({
      _loggedIndex: { [canon[3]!.id]: true, [canon[6]!.id]: true },
      _watchlistIndex: { [canon[1]!.id]: true, [canon[6]!.id]: true },
      marksKnown: 'held',
    } as never);
    // The day, so the title is The Darkroom; the small hours for Late Night Projection. Only the
    // date is fixed; the timers stay real.
    jest.useFakeTimers({
      now: new Date(2026, 8, 30, state.hour ?? 15, 0),
      doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
        'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
        'cancelIdleCallback', 'hrtime', 'performance'],
    });
    const html = await atLayout(layout, async () => {
      let r!: ReturnType<typeof render>;
      try {
        await act(async () => { r = render(<DarkroomScreen />); await new Promise((res) => setTimeout(res, 0)); });
        if (state.press) await act(async () => { await fireEvent.press(r.getByLabelText(new RegExp(`^${state.press}`))); });
      } finally {
        jest.useRealTimers();
      }
      const out = toHtml(r.toJSON(), { posters, local: LOCAL_ART });
      r.unmount();
      return out;
    });
    writeScreen(name, html);
    console.log(`WROTE ${name}: ${html.length} bytes`);
    expect(html.length).toBeGreaterThan(3000);
  });
});
