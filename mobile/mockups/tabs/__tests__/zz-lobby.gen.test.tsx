/**
 * A GENERATOR, not a test. Mounts the real Lobby with its query
 * cache pre-filled from real TMDB lists, and converts the tree to HTML.
 * Run: MOCKUPS=1 npx jest zz-lobby.gen  (see mockups/README.md)
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toHtml } from '../../../src/components/profile/__tests__/zz-render.lib';
import { readFixture, whenRendering, writeScreen } from '@/mockups/paths';
import { LOCAL_ART } from '../../../src/components/profile/__tests__/zz-art.gen';

const LISTS = readFixture<any>('lobby.json');
const RAW = readFixture<Record<string, string>>('lobby-art.json');
const posters: Record<string, { title: string; data: string }> = {};
for (const [p, data] of Object.entries(RAW)) if (data) posters[p] = { title: '', data };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));
jest.mock('@react-navigation/native', () => ({ useScrollToTop: jest.fn(), useIsFocused: () => true }));
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
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));
jest.mock('@shopify/flash-list', () => require('../flashListMock').makeFlashListMock());
jest.mock('@/src/lib/supabase', () => {
  const chain: any = {};
  const self = () => chain;
  for (const k of ['select', 'eq', 'neq', 'not', 'order', 'limit', 'in', 'is', 'single', 'gte', 'lte']) chain[k] = self;
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], count: 412, error: null }).then(res);
  return { supabase: { from: () => chain, rpc: () => chain, channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: jest.fn() } };
});
jest.mock('@/src/stores/auth', () => {
  const s = { isAuthenticated: true, user: { id: 'me', username: 'kane', role: 'archivist', tier: 'archivist', preferences: {} } };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useAuthStore as any).getState = () => s;
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


const canon = LISTS.canon as { id: number; title: string; poster_path: string }[];
const REVIEWS = [
  'The prison is not the subject. Patience is. Every frame is a man deciding, again, not to give up.',
  'Brando plays power as tiredness. The quiet scenes are the loud ones.',
  'Pacino gets colder with every scene and the film never once tells you to notice.',
  'A courtroom drama with no courtroom. Twelve men and a fan that does not work.',
];
const USERS = [['morpho', 'auteur'], ['ug.mb', 'cinephile'], ['vesper', 'archivist'], ['halloway', 'cinephile']];
const pulse = REVIEWS.map((text, i) => ({
  id: `p${i}`, user_id: `m${i}`, user: USERS[i][0], userRole: USERS[i][1], userAvatar: null,
  film: { id: canon[i].id, title: canon[i].title, poster_path: canon[i].poster_path },
  rating: 5 - (i % 2), text, dropCap: i === 0, pullQuote: '', status: 'watched', abandoned_reason: null,
  watchedWith: null, is_autopsied: false, autopsy: null, is_spoiler: false, editorialHeader: null, time: `${i + 2}h ago`,
}));
const featured = {
  id: 'feat', film_id: canon[4].id, film_title: canon[4].title, poster_path: canon[4].poster_path, rating: 5,
  review: 'Some films are watched. This one is attended. Three hours pass like a sermon you did not want to end.',
  status: 'watched', abandoned_reason: null, watched_with: null, pull_quote: null, drop_cap: true,
  editorial_header: null, is_autopsied: false, autopsy: null, is_spoiler: false,
  created_at: new Date(Date.now() - 5 * 3600e3).toISOString(), user_id: 'm9',
  profiles: { username: 'morpho', role: 'auteur', avatar_url: null },
};

whenRendering('lobby generator', () => {
  it('writes the Lobby', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
    client.setQueryData(['lobby', 'trending'], LISTS.trending);
    client.setQueryData(['lobby', 'canon'], LISTS.canon);
    client.setQueryData(['socialPulse', 0], pulse);
    client.setQueryData(['featuredCritique', 0], featured);
    let r!: ReturnType<typeof render>;
    await act(async () => {
      r = render(<QueryClientProvider client={client}><LobbyScreen /></QueryClientProvider>);
      await new Promise((res) => setTimeout(res, 0));
    });
    const html = toHtml(r.toJSON(), { posters, local: LOCAL_ART });
    writeScreen('lobby', html);
    console.log('lobby:', html.length, 'bytes |', (html.match(/<img /g) || []).length, 'images |', (html.match(/class="poster"/g) || []).length, 'empty frames');
    expect(html.length).toBeGreaterThan(5000);
  });
});
