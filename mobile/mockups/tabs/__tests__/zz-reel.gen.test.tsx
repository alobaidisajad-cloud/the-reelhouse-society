/**
 * A GENERATOR, not a test. Mounts the real Reel with its community feed
 * pre-filled from real TMDB films, and converts the tree to HTML: every kind of
 * frame (each rank's stock, a still, a pull-quote, a spoiler, an abandoned log, a
 * breakdown, right-to-left words, a long name and title), the stacks as cans, and
 * an empty reel, each at every text size (LAYOUTS).
 * Run: MOCKUPS=1 npx jest zz-reel.gen  (see mockups/README.md)
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { toHtml } from '../../../src/components/profile/__tests__/zz-render.lib';
import { LAYOUTS, atLayout, readFixture, whenRendering, writeScreen } from '@/mockups/paths';
import { LOCAL_ART } from '../../../src/components/profile/__tests__/zz-art.gen';

const LISTS = readFixture<any>('lobby.json');
const RAW = readFixture<Record<string, string>>('lobby-art.json');
const posters: Record<string, { title: string; data: string }> = {};
for (const [p, data] of Object.entries(RAW)) if (data) posters[p] = { title: '', data };

jest.mock('expo-router', () => ({
  ...require('@/test-utils/expoRouterMock').expoRouterMock(),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));
jest.mock('expo-router/react-navigation', () => ({ ...require('@/test-utils/navigationMock').navigationMock(), useScrollToTop: jest.fn(), useIsFocused: () => true }));
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
  for (const k of ['select', 'eq', 'neq', 'not', 'order', 'limit', 'in', 'is', 'single', 'maybeSingle', 'gte', 'lte', 'lt', 'gt', 'or', 'ilike', 'range', 'filter', 'match', 'contains', 'abortSignal']) chain[k] = self;
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], count: 412, error: null }).then(res);
  return { supabase: { from: () => chain, rpc: () => chain, channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: jest.fn() } };
});
jest.mock('@/src/stores/auth', () => {
  const s = { isAuthenticated: true, user: { id: 'me', username: 'kane', role: 'archivist', tier: 'archivist', preferences: {}, is_social_private: false } };
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
const trending = LISTS.trending as { id: number; title: string; poster_path: string; backdrop_path: string }[];
const ARABIC = 'يُعد هذا الفيلم تأملاً طويلاً في الانتظار، وفي الصبر، وفي ما يبقى من المرء حين لا يبقى شيء.';
const LONG = 'The prison is not the subject. Patience is. Every frame is a man deciding, again, not to give up, and the film never once asks us to admire him for it. It simply waits with him, the way a friend would, through the years the story skips and the ones it lingers in, until the waiting itself becomes the thing we came to watch.';
/** One of every kind of frame, by rank, in the order a reel might run them. */
const KINDS: Record<string, unknown>[] = [
  { role: 'auteur', username: 'morpho', film: trending[0], still: true, pull_quote: 'Every frame is a man deciding, again, not to give up.', review: LONG, drop_cap: true,
    watched_with: 'Ines', physical_media: '35mm print', status: 'rewatched', is_autopsied: true, autopsy: { _v: 2, story: 9, script: 8, acting: 10, cinematography: 9, editing: 7, sound: 8 } },
  { role: 'archivist', username: 'vesper', film: trending[1], still: true, physical_media: '4K Blu-ray', review: 'The twist lands because the first act already told you, twice.', is_spoiler: true },
  { role: 'cinephile', username: 'halloway', film: canon[1], status: 'abandoned', rating: 0, abandoned_reason: 'Two hours in and the family still had not done anything I could not have guessed.' },
  { role: 'cinephile', username: 'marguerite_moss_of_the_longest', film: canon[2], review: 'Pacino gets colder with every scene and the film never once tells you to notice.' },
  { role: 'auteur', username: 'ug.mb', film: canon[3], is_autopsied: true, autopsy: { _v: 2, story: 8, acting: 9, sound: 6 } },
  { role: 'archivist', username: 'nadia', film: trending[2], still: true, pull_quote: 'A long wait, and worth it.', review: ARABIC },
  { role: 'cinephile', username: 'kane', film: { ...canon[4], title: 'Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb' }, review: 'Some films are watched. This one is attended.' },
  { role: 'cinephile', username: 'wren', film: canon[5], review: null },
];
const feed = KINDS.map(({ film, still, ...k }, i) => {
  const f = film as { id: number; title: string; poster_path: string; backdrop_path?: string };
  return {
    id: 'r' + i, user_id: 'm' + i, avatar_url: null, film_id: f.id, film_title: f.title, poster_path: f.poster_path, year: 1990 + i,
    rating: 5 - (i % 3), review: null, status: 'watched', created_at: new Date(Date.now() - (i + 1) * 2 * 3600e3).toISOString(),
    editorial_header: still ? f.backdrop_path ?? null : null, pull_quote: null, drop_cap: false, watched_with: null,
    is_autopsied: false, autopsy: null, abandoned_reason: null, is_spoiler: false,
    // Every shape a count takes on a bar: none (drawn as nothing), one, a few,
    // and the widest the formatter makes (`999K` fits the narrowest column).
    certify_count: [12, 0, 1, 214, 2140, 999_000, 3, 0][i],
    critique_count: [3, 0, 1, 31, 0, 9_900, 0, 58][i],
    ...k,
  };
});
/** Every kind of can: ranked, empty, a title that runs long, a curator's long handle, none certified. */
const stacks = [
  { title: 'Films That Wait For You', curator: 'vesper', count: 11, certifyCount: 48, isRanked: true, films: canon.slice(0, 3) },
  { title: 'Rain, Mostly', curator: 'marguerite_moss_of_the_longest', count: 7, certifyCount: 0, isRanked: false, films: canon.slice(3, 5) },
  { title: 'Every Film I Watched Alone In An Empty Cinema On A Tuesday Afternoon In The Rain', curator: 'halloway', count: 23, certifyCount: 9, isRanked: true, films: canon.slice(5, 6) },
  { title: 'Begun', curator: 'kane', count: 0, certifyCount: 1, isRanked: false, films: [] },
  { title: 'The Long Goodbyes', curator: 'ug.mb', count: 3, certifyCount: 214, isRanked: false, films: canon.slice(6, 9) },
].map((s, i) => ({ id: 's' + i, description: '', curatorId: 'c' + i, createdAt: '2026-10-01T00:00:00Z', ...s,
  films: s.films.map((f) => ({ id: f.id, title: f.title, poster_path: f.poster_path })) }));

/** The Reel as `state` leaves it: the logs, the stacks, or an empty reel. */
const STATES = [['reel', 'logs'], ['reel-stacks', 'stacks'], ['reel-empty', 'empty']] as const;
const RUNS = STATES.flatMap(([name, state]) => LAYOUTS.map((l) => [`${name}${l.suffix}`, state, l] as const));

whenRendering('reel generator', () => {
  it.each(RUNS)('writes %s', async (name, state, layout) => {
    const html = await atLayout(layout, async () => {
      const client = testQueryClient({ queries: { staleTime: Infinity } });
      client.setQueryData(['feed', 'community'], { pages: [state === 'empty' ? [] : feed], pageParams: [undefined] });
      client.setQueryData(['feed', 'stacks', 'all', '', 'me'], { pages: [stacks], pageParams: [undefined] });
      let r!: ReturnType<typeof render>;
      await act(async () => {
        r = render(<QueryClientProvider client={client}><ReelScreen /></QueryClientProvider>);
        await new Promise((res) => setTimeout(res, 0));
      });
      if (state === 'stacks') await act(async () => { await fireEvent.press(r.getAllByLabelText('Stacks')[0]); });
      // Past the crossfade, so each section is drawn plainly shown or hidden, as a member sees it.
      await act(async () => { await new Promise((res) => setTimeout(res, 1200)); });
      return toHtml(r.toJSON(), { posters, local: LOCAL_ART });
    });
    writeScreen(name, html);
    console.log(`${name}:`, html.length, 'bytes |', (html.match(/<img /g) || []).length, 'images |', (html.match(/class="poster"/g) || []).length, 'empty frames');
    expect(html.length).toBeGreaterThan(5000);
  });
});
