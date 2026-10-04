/**
 * A GENERATOR, not a test. Mounts the real Lobby with its query cache
 * pre-filled — the wall from sample members and pieces, the programme and its
 * one-sheet from real TMDB lists — and converts the tree to HTML, in each
 * state the wall has and in every layout (see `LAYOUTS`).
 * Run: MOCKUPS=1 npx jest zz-lobby.gen  (see mockups/README.md)
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { toHtml } from '../../../src/components/profile/__tests__/zz-render.lib';
import { LAYOUTS, atLayout, readFixture, whenRendering, writeScreen } from '@/mockups/paths';
import { LOCAL_ART } from '../../../src/components/profile/__tests__/zz-art.gen';
import { featureKey, PROGRAMME_KEY, WALL_KEY, type Wall } from '@/src/components/lobby/wallRead';

const LISTS = readFixture<any>('lobby.json');
const RAW = readFixture<Record<string, string>>('lobby-art.json');
const posters: Record<string, { title: string; data: string }> = {};
for (const [p, data] of Object.entries(RAW)) if (data) posters[p] = { title: '', data };

let mockViewer: Record<string, unknown> = { id: 'me', username: 'kane', role: 'user', tier: null, preferences: {} };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));
jest.mock('@react-navigation/native', () => ({ useScrollToTop: jest.fn(), useIsFocused: () => true }));
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
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ ...require('@/mockups/paths').PHONE, scale: 3, fontScale: require('@/mockups/paths').textSize.scale }),
}));
jest.mock('@shopify/flash-list', () => require('../flashListMock').makeFlashListMock());
jest.mock('@/src/lib/supabase', () => {
  const chain: any = {};
  const self = () => chain;
  for (const k of ['select', 'eq', 'neq', 'not', 'order', 'limit', 'in', 'is', 'single', 'gte', 'lte']) chain[k] = self;
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], count: 0, error: null }).then(res);
  return { supabase: { from: () => chain, rpc: () => chain, channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: jest.fn() } };
});
jest.mock('@/src/stores/auth', () => {
  const state = () => ({ isAuthenticated: true, user: mockViewer });
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(state()) : state());
  (useAuthStore as any).getState = state;
  return { useAuthStore };
});
jest.mock('@/src/stores/films', () => {
  const actual = jest.requireActual('@/src/stores/films');
  actual.useFilmStore.setState({ fetchLogs: jest.fn(), fetchEndorsements: jest.fn() });
  return actual;
});
jest.mock('@/src/stores/notificationStore', () => {
  const s = { setupRealtime: jest.fn(), fetchNotifications: jest.fn(), unreadCount: 2 };
  const useNotificationStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useNotificationStore as any).getState = () => s;
  return { useNotificationStore };
});

// eslint-disable-next-line import/first
import LobbyScreen from '@/app/(tabs)/index';

type Film = { id: number; title: string; poster_path: string; release_date?: string };
const trending = LISTS.trending as Film[];
const canon = LISTS.canon as Film[];
const member = (username: string, role = 'user') => ({ id: `m-${username}`, username, avatar_url: null, role, tier: null, is_founding: false });

const WALL: Wall = {
  edition: '2026-09-30',
  log: {
    id: 'log-1', rating: 4, author: member('morpho', 'auteur'),
    words: 'Brando plays power as tiredness. The quiet scenes are the loud ones.',
    film: { id: canon[1].id, title: canon[1].title, poster_path: canon[1].poster_path },
  },
  stack: {
    id: 'stack-1', title: 'Films That Wait For You', description: null, films: 11, author: member('vesper', 'archivist'),
    posters: canon.slice(2, 5).map((f) => ({ film_id: f.id, title: f.title, poster_path: f.poster_path })),
  },
  filings: [
    { id: 'post-1', kind: 'dossier', title: 'A Love Letter to the Intermission', words: 4800, author: member('sajjadobaidi', 'auteur'),
      text: 'There is a moment in the second act where the camera stops pretending it is not watching, and so do we.' },
    { id: 'post-2', kind: 'take', title: 'Remakes Are a Confession', words: 120, author: member('marguerite'),
      text: 'Every remake admits the studio has run out of nerve before it has run out of money.' },
    { id: 'post-3', kind: 'seeking', title: null, words: 40, author: member('halloway', 'archivist'),
      text: 'Looking for a silent film that works on someone who swears they hate silent films.' },
  ],
};
// the longest the house can send, at the edges of what each bill holds
const LONG: Wall = {
  ...WALL,
  log: { ...WALL.log!, author: member('a_member_with_the_longest_handle', 'auteur'),
    words: 'An argument about grief staged as a road movie; it goes nowhere on purpose and arrives anyway, which is the whole trick of it, and it works every single time.',
    film: { id: 935, title: 'Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb', poster_path: canon[0].poster_path } },
  stack: { ...WALL.stack!, title: 'Every Film I Watched Alone In An Empty Cinema On A Tuesday Afternoon', films: 999, author: member('another_very_long_member_name') },
  filings: WALL.filings.map((f, i) => ({ ...f, kind: ['ballot', 'wire', 'dossier'][i], words: 12500,
    title: i === 2 ? null : 'The Longest Headline The Dispatch Would Ever Print About A Single Film' })),
};
const EMPTY: Wall = { edition: '2026-09-30', log: null, stack: null, filings: [] };

// The sample art is each film's own printed poster. Drawn as wordless (the one-sheet's usual
// case, the house's words laid over it) it shows its title twice; `-titled` draws it as it is.
const STATES: [string, Wall, Record<string, unknown>, boolean?][] = [
  ['lobby', WALL, { role: 'user', tier: null }],
  ['lobby-titled', WALL, { role: 'user', tier: null }, true],
  ['lobby-long', LONG, { role: 'admin', tier: null }],
  ['lobby-empty', EMPTY, { role: 'user', tier: null }],
  ['lobby-archivist', { ...WALL, filings: WALL.filings.slice(0, 1) }, { role: 'archivist', tier: 'archivist' }],
  ['lobby-auteur', WALL, { role: 'auteur', tier: 'auteur' }],
];
const RUNS = STATES.flatMap(([name, wall, viewer, titled]) => LAYOUTS.map((l) => [`${name}${l.suffix}`, wall, viewer, l, !!titled] as const));

whenRendering('lobby generator', () => {
  it.each(RUNS)('writes %s', async (name, wall, viewer, layout, titled) => {
    mockViewer = { id: 'me', username: 'kane', preferences: {}, ...viewer };
    const html = await atLayout(layout, async () => {
      const client = testQueryClient({ queries: { staleTime: Infinity } });
      const [feature, ...bill] = trending;
      client.setQueryData(WALL_KEY, wall);
      client.setQueryData(PROGRAMME_KEY, { feature, bill: bill.slice(0, 4) });
      client.setQueryData(featureKey(feature.id), {
        id: feature.id, title: feature.title, year: '2026', runtime: 112, director: 'David Robert Mitchell',
        art: { path: feature.poster_path, titled },
      });
      let r!: ReturnType<typeof render>;
      await act(async () => {
        r = render(<QueryClientProvider client={client}><LobbyScreen /></QueryClientProvider>);
        await new Promise((res) => setTimeout(res, 0));
      });
      return toHtml(r.toJSON(), { posters, local: LOCAL_ART });
    });
    writeScreen(name, html);
    console.log(`${name}:`, html.length, 'bytes |', (html.match(/<img /g) || []).length, 'images |', (html.match(/class="poster"/g) || []).length, 'empty frames');
    expect(html.length).toBeGreaterThan(5000);
  });
});
