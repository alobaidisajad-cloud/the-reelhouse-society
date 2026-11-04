/**
 * A GENERATOR, not a test. The Lounge in every state its drawing shows
 * (design/redesign/lounge-final): an Archivist's corridor with four salons of
 * their own (new words, two at the door, awaiting, a quiet one), a Cinephile's
 * (LISTEN IN, BY REQUEST), one salon of one's own, none (The Velvet Seats
 * Await), a search that the directory has nothing more for, a quiet corridor,
 * the salons being read, the salons not reached, and the closed door for a
 * visitor. Each at every layout CI measures.
 *
 * Run: MOCKUPS=1 npx jest zz-lounge.gen  (see mockups/README.md)
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
// The viewer, as each state needs them: their rank, or none signed in.
let mockViewer: { id: string; username: string; role: string; tier: string; is_social_private: boolean } | null = null;
jest.mock('@/src/stores/auth', () => {
  const build = () => ({ user: mockViewer, isAuthenticated: !!mockViewer, rereadProfile: () => Promise.resolve() });
  const useAuthStore = (sel?: (s: unknown) => unknown) => (sel ? sel(build()) : build());
  (useAuthStore as any).getState = () => build();
  (useAuthStore as any).subscribe = () => () => {};
  return { useAuthStore };
});
jest.mock('expo-router', () => ({
  ...require('@/test-utils/expoRouterMock').expoRouterMock(),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}), useFocusEffect: () => {},
}));
jest.mock('expo-router/react-navigation', () => ({ ...require('@/test-utils/navigationMock').navigationMock(), useScrollToTop: jest.fn(), useIsFocused: () => true }));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  useNetInfo: () => ({ isConnected: true }),
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
jest.mock('@/src/lib/tmdb', () => ({
  tmdb: {
    poster: (p: string, s: string) => `https://image.tmdb.org/t/p/${s}${p}`,
    backdrop: (p: string, s: string) => `https://image.tmdb.org/t/p/${s}${p}`,
  },
}));
// eslint-disable-next-line import/first
import LoungeScreen from '@/app/(tabs)/lounge';
// eslint-disable-next-line import/first
import { useLoungeStore, type LoungeRoom } from '@/src/stores/lounge';

type Film = { id: number; title: string; poster_path: string; backdrop_path?: string };
const art = [...(LISTS.trending as Film[]), ...(LISTS.canon as Film[])];
const ago = (minutes: number) => new Date(Date.now() - minutes * 60e3).toISOString();
const faces = (letters: string) => [...letters].map((c) => ({ username: c.toLowerCase() + 'member', avatar_url: null }));

const MINE: LoungeRoom[] = [
  { id: 'm1', name: 'The Nitrate Circle', description: 'Silent era and early sound, every Thursday.', is_private: false, creator_id: 'other', created_at: ago(9000),
    member_count: 42, cover_image: art[0]!.backdrop_path ?? art[0]!.poster_path, mine: true, membership_status: 'approved', unread_count: 3, last_message_at: ago(4), memberFaces: faces('VHM') },
  { id: 'm2', name: 'Rain, Mostly', description: 'Films where it does not stop raining.', is_private: true, creator_id: 'me', created_at: ago(9000),
    member_count: 6, cover_image: art[1]!.backdrop_path ?? art[1]!.poster_path, mine: true, membership_status: 'approved', unread_count: 5, pending_count: 2, last_message_at: ago(60), memberFaces: faces('MU') },
  { id: 'm3', name: 'Kurosawa Weekly', description: 'One Kurosawa a week, in order.', is_private: true, creator_id: 'other', created_at: ago(9000),
    member_count: 18, cover_image: art[2]!.backdrop_path ?? art[2]!.poster_path, mine: true, membership_status: 'pending', last_message_at: ago(180), memberFaces: faces('SVK') },
  { id: 'm4', name: 'Late Shows', description: 'Whatever is on after the late news.', is_private: false, creator_id: 'me', created_at: ago(9000),
    member_count: 1, cover_image: null, mine: true, membership_status: 'approved', last_message_at: ago(2880), memberFaces: faces('A') },
];
const ALL: LoungeRoom[] = [
  { id: 'a1', name: 'Midnight Programmers', description: 'Whatever is on after midnight, argued about until morning.', is_private: true, creator_id: 'x1', created_at: ago(9000), member_count: 7, cover_image: art[3]!.poster_path, last_message_at: ago(2) },
  { id: 'a2', name: 'The Ozu Hour', description: 'Tatami height, one film a month.', is_private: false, creator_id: 'x2', created_at: ago(9000), member_count: 23, cover_image: art[4]!.poster_path, last_message_at: ago(40) },
  { id: 'a3', name: 'Noir Desk', description: 'Shadows, fedoras, and the women who outsmart the men in them.', is_private: false, creator_id: 'x3', created_at: ago(9000), member_count: 112, cover_image: art[5]!.poster_path, last_message_at: ago(180) },
  { id: 'a4', name: 'First Features Only', description: 'Debuts and what they promised.', is_private: true, creator_id: 'x4', created_at: ago(9000), member_count: 41, cover_image: null, last_message_at: ago(1500) },
  { id: 'a5', name: 'The Long Takes', description: 'Films that refuse to cut away, and the people who love them for it.', is_private: false, creator_id: 'x5', created_at: ago(9000), member_count: 64, cover_image: art[6]!.poster_path, last_message_at: ago(5760) },
];

const viewer = (role: string) => ({ id: 'me', username: 'kane', role, tier: role, is_social_private: false });
type State = { who: ReturnType<typeof viewer> | null; lounges?: LoungeRoom[]; read?: boolean; failed?: boolean; type?: string };
const STATES: [string, State][] = [
  ['lg-arch', { who: viewer('archivist'), lounges: [...MINE, ...ALL] }],
  ['lg-cine', { who: viewer('cinephile'), lounges: [MINE[0]!, MINE[3]!, ...ALL] }],
  ['lg-one', { who: viewer('auteur'), lounges: [MINE[1]!, ...ALL] }],
  ['lg-none', { who: viewer('archivist'), lounges: ALL.slice(0, 3) }],
  ['lg-search', { who: viewer('archivist'), lounges: [{ ...MINE[0]!, name: 'The Noir Circle' }, ...ALL.filter((l) => l.id !== 'a3')], type: 'noir' }],
  ['lg-dir-empty', { who: viewer('auteur'), lounges: MINE.slice(0, 2) }],
  ['lg-loading', { who: viewer('archivist'), lounges: [], read: false }],
  ['lg-failed', { who: viewer('archivist'), lounges: [], failed: true }],
  ['lg-out', { who: null }],
];

const RUNS = STATES.flatMap(([name, state]) => LAYOUTS.map((l) => [`${name}${l.suffix}`, state, l] as const));

whenRendering('lounge generator', () => {
  it.each(RUNS)('writes %s', async (name, state, layout) => {
    mockViewer = state.who;
    // The store as each state holds it; its reads stand still, so what is drawn is what was set.
    useLoungeStore.setState({
      lounges: state.lounges ?? [], loungesRead: state.read ?? true, loungesFailed: state.failed ?? false, loungesLoading: false,
      fetchLounges: async () => {}, searchLounges: async () => [],
    } as never);
    const html = await atLayout(layout, async () => {
      let r!: ReturnType<typeof render>;
      await act(async () => { r = render(<LoungeScreen />); await new Promise((res) => setTimeout(res, 0)); });
      const typed = state.type;
      if (typed) await act(async () => { await fireEvent.changeText(r.getByLabelText('Search salons'), typed); await new Promise((res) => setTimeout(res, 0)); });
      const out = toHtml(r.toJSON(), { posters, local: LOCAL_ART });
      r.unmount();
      return out;
    });
    writeScreen(name, html);
    console.log(`WROTE ${name}: ${html.length} bytes`);
    expect(html.length).toBeGreaterThan(3000);
  });
});
