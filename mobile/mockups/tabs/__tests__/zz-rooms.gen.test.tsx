/**
 * A GENERATOR, not a test. The two screens with colour families of
 * their own: the Darkroom (mood tints) and the Lounge (salon cards).
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { toHtml } from '../../../src/components/profile/__tests__/zz-render.lib';
import { readFixture, whenRendering, writeScreen } from '@/mockups/paths';
import { LOCAL_ART } from '../../../src/components/profile/__tests__/zz-art.gen';

const LISTS = readFixture<any>('lobby.json');
const RAW = readFixture<Record<string, string>>('lobby-art.json');
const posters: Record<string, { title: string; data: string }> = {};
for (const [p, data] of Object.entries(RAW)) if (data) posters[p] = { title: '', data };

const mockUser = { id: 'me', username: 'kane', role: 'archivist', tier: 'archivist', preferences: {} };
jest.mock('@/src/stores/auth', () => {
  const build = () => ({ user: mockUser, isAuthenticated: true });
  const useAuthStore = (sel?: (s: unknown) => unknown) => (sel ? sel(build()) : build());
  (useAuthStore as any).getState = () => build();
  return { useAuthStore };
});
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}), useFocusEffect: () => {},
}));
jest.mock('@react-navigation/native', () => ({ useScrollToTop: jest.fn(), useIsFocused: () => true }));
jest.mock('@react-native-community/netinfo', () => ({ useNetInfo: () => ({ isConnected: true }) }));
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
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
  __esModule: true, default: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));
jest.mock('@shopify/flash-list', () => require('../flashListMock').makeFlashListMock());
jest.mock('@/src/lib/supabase', () => {
  const chain: any = {};
  const self = () => chain;
  for (const k of ['select', 'eq', 'neq', 'not', 'order', 'limit', 'in', 'is', 'single', 'gte', 'lte']) chain[k] = self;
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
  return { supabase: { from: () => chain, rpc: () => chain, channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: jest.fn() } };
});
// Read lazily: the screen fetches on mount and would overwrite a store fixture
// with the mock's empty page, leaving the grid blank.
const mockFilms: unknown[] = [];
jest.mock('@/src/lib/tmdb', () => ({
  tmdb: {
    discover: jest.fn(() => Promise.resolve({ results: mockFilms, total_pages: 3 })),
    search: jest.fn(() => Promise.resolve({ results: mockFilms })),
    poster: (p: string, s: string) => `https://image.tmdb.org/t/p/${s}${p}`,
  },
}));

// eslint-disable-next-line import/first
import DarkroomScreen from '@/app/(tabs)/darkroom';
// eslint-disable-next-line import/first
import LoungeScreen from '@/app/(tabs)/lounge';
// eslint-disable-next-line import/first
import { useDiscoverStore } from '@/src/stores/discover';
// eslint-disable-next-line import/first
import { useLoungeStore } from '@/src/stores/lounge';
// eslint-disable-next-line import/first
import { MOODS } from '@/src/components/darkroom/constants';

const canon = LISTS.canon as { id: number; title: string; poster_path: string; release_date: string; vote_average: number }[];


whenRendering('rooms generator', () => {
  it('writes the Darkroom, in a mood', async () => {
    mockFilms.push(...canon.slice(0, 8).map(f => ({
      id: f.id, title: f.title, poster_path: f.poster_path, release_date: f.release_date, vote_average: f.vote_average,
    })));
    useDiscoverStore.setState({
      page: 1, query: '', inputVal: '', mood: MOODS[1] as never,
      accumulatedFilms: canon.slice(0, 8).map(f => ({
        id: f.id, title: f.title, poster_path: f.poster_path, release_date: f.release_date, vote_average: f.vote_average,
      })) as never,
    } as never);
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<DarkroomScreen />); await new Promise(res => setTimeout(res, 0)); });
    const html = toHtml(r.toJSON(), { posters, local: LOCAL_ART });
    writeScreen('darkroom', html);
    console.log('darkroom:', html.length, 'bytes |', (html.match(/<img /g) || []).length, 'images');
    expect(html.length).toBeGreaterThan(3000);
  });

  it('writes the Lounge', async () => {
    const room = (i: number, over: Record<string, unknown> = {}) => ({
      id: 'l' + i, name: ['The Nitrate Circle', 'Kurosawa Weekly', 'Midnight Programmers'][i],
      description: ['Silent era and early sound, every Thursday.', 'One Kurosawa a week, in order.', 'Whatever is on after midnight.'][i],
      is_private: i === 2, creator_id: 'm' + i, created_at: '2026-06-01T00:00:00Z',
      member_count: [42, 18, 7][i], unread_count: i === 0 ? 3 : 0,
      last_message: ['Sunrise holds up.', 'Ikiru next week.', 'Anyone awake?'][i],
      last_message_at: new Date(Date.now() - (i + 1) * 3600e3).toISOString(),
      is_member: i < 2, cover_image: null, ...over,
    });
    useLoungeStore.setState({ lounges: [room(0), room(1), room(2)], loading: false } as never);
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<LoungeScreen />); await new Promise(res => setTimeout(res, 0)); });
    const html = toHtml(r.toJSON(), { posters, local: LOCAL_ART });
    writeScreen('lounge', html);
    console.log('lounge:', html.length, 'bytes');
    expect(html.length).toBeGreaterThan(3000);
  });
});
