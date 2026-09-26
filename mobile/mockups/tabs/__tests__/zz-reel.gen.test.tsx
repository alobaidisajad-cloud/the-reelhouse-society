/**
 * A GENERATOR, not a test. Mounts the real Reel with its community feed
 * pre-filled from real TMDB films, and converts the tree to HTML.
 * Run: MOCKUPS=1 npx jest zz-reel.gen  (see mockups/README.md)
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
jest.mock('@/src/stores/followStore', () => {
  const s = { following: ['m1', 'm2'], followers: [] };
  const useSocialStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useSocialStore as any).getState = () => s;
  return { useSocialStore };
});
jest.mock('@/src/stores/notificationStore', () => {
  const s = { setupRealtime: jest.fn(), fetchNotifications: jest.fn(), unreadCount: 2 };
  const useNotificationStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useNotificationStore as any).getState = () => s;
  return { useNotificationStore };
});

// eslint-disable-next-line import/first
import ReelScreen from '@/app/(tabs)/reels';

const canon = LISTS.canon as { id: number; title: string; poster_path: string }[];
const USERS = [['morpho', 'auteur'], ['ug.mb', 'cinephile'], ['vesper', 'archivist'], ['halloway', 'cinephile']];
const TEXTS = [
  'The prison is not the subject. Patience is. Every frame is a man deciding, again, not to give up.',
  '',
  'Brando plays power as tiredness. The quiet scenes are the loud ones.',
  'Pacino gets colder with every scene and the film never once tells you to notice.',
  '',
  'A courtroom drama with no courtroom. Twelve men and a fan that does not work.',
  'Some films are watched. This one is attended.',
  '',
];
const feed = canon.slice(0, 8).map((f, i) => ({
  id: 'r' + i, user_id: 'm' + i, username: USERS[i % 4][0], avatar_url: null, role: USERS[i % 4][1],
  film_id: f.id, film_title: f.title, poster_path: f.poster_path, rating: 5 - (i % 3), review: TEXTS[i] || null,
  status: i === 4 ? 'rewatched' : 'watched', created_at: new Date(Date.now() - (i + 1) * 2 * 3600e3).toISOString(),
  editorial_header: null, pull_quote: null, drop_cap: i === 0, watched_with: null, is_autopsied: false, autopsy: null,
  abandoned_reason: null, is_spoiler: false,
  // Every shape a count takes on a bar: none (drawn as nothing), one, a few,
  // and the widest the formatter makes (`999K` fits the narrowest column).
  certify_count: [12, 0, 1, 214, 2140, 999_000, 3, 0][i],
  critique_count: [3, 0, 1, 31, 0, 9_900, 0, 58][i],
}));
whenRendering('reel generator', () => {
  it('writes the Reel', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
    client.setQueryData(['feed', 'community'], { pages: [feed], pageParams: [undefined] });
    let r!: ReturnType<typeof render>;
    await act(async () => {
      r = render(<QueryClientProvider client={client}><ReelScreen /></QueryClientProvider>);
      await new Promise((res) => setTimeout(res, 0));
    });
    const html = toHtml(r.toJSON(), { posters, local: LOCAL_ART });
    writeScreen('reel', html);
    console.log('reel:', html.length, 'bytes |', (html.match(/<img /g) || []).length, 'images |', (html.match(/class="poster"/g) || []).length, 'empty frames');
    expect(html.length).toBeGreaterThan(5000);
  });
});
