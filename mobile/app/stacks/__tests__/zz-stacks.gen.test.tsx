/**
 * A GENERATOR, not a test. Mounts the stack page and converts the resolved
 * React Native tree to HTML, so its light can be measured rather than argued.
 * Mock setup follows stack-detail.redesign.test.tsx, which already knew how to
 * stand this page up; the gradients here are the real ones, so they render.
 *
 * Run: MOCKUPS=1 npx jest zz-stacks.gen  (see mockups/README.md)
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { toHtml } from '@/src/components/profile/__tests__/zz-render.lib';
import { LAYOUTS, atLayout, whenRendering, writeScreen } from '@/mockups/paths';
import { POSTERS, POSTER_PATHS, POSTER_TITLES, LOCAL_ART } from '@/src/components/profile/__tests__/zz-art.gen';

import StackDetailScreen from '../[id]';

const STACK_ID = '11111111-1111-4111-8111-111111111111';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ ...require('@/mockups/paths').PHONE, scale: 3, fontScale: require('@/mockups/paths').textSize.scale }),
}));

let mockStackData: Record<string, unknown>;
/** The member's own withheld pieces, as the house sends the list: none, unless a state says so. */
let mockWithheld: unknown[] = [];
jest.mock('expo-router', () => ({
  ...require('@/test-utils/expoRouterMock').expoRouterMock(),
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismiss: jest.fn() },
  useLocalSearchParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@tanstack/react-query', () => ({
  QueryClient: class { defaultOptions = {}; getQueryCache = () => ({ subscribe: () => () => {} }); setQueryDefaults = () => {}; invalidateQueries = () => Promise.resolve(); },
  // The house's own client (the wall's, asked again when a stack is found gone) sets these up.
  onlineManager: { setEventListener: () => {} },
  focusManager: { setEventListener: () => {} },
  useQueryClient: () => ({
    setQueryData: jest.fn(), getQueryData: jest.fn(), removeQueries: jest.fn(),
    invalidateQueries: jest.fn(), cancelQueries: jest.fn(() => Promise.resolve()),
  }),
  useQuery: (opts: { queryKey: unknown[] }) => {
    const key = String(opts.queryKey[0]);
    if (key === 'stackComments') return { data: [] };
    if (key === require('@/src/hooks/useMyWithheld').MY_WITHHELD) return { data: mockWithheld };
    if (key === 'stack') return { data: mockStackData, isLoading: false, isError: false };
    return { data: undefined, isLoading: false, isError: false };
  },
}));
jest.mock('@/src/stores/films', () => {
  const state = { logs: [], _loggedIndex: {}, lists: [], _listEndorsedIndex: {}, toggleListEndorse: jest.fn(), deleteList: jest.fn() };
  const useListStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state) : state);
  (useListStore as unknown as { getState: () => unknown }).getState = () => state;
  return { useListStore };
});
jest.mock('@/src/stores/blockStore', () => {
  // Nobody hidden: the page leaves when its curator is (useLeavesWhenHidden asks isHidden).
  const state = {
    blockUser: jest.fn(), muteUser: jest.fn(), isBlocked: () => false, isMuted: () => false,
    isHidden: () => false, _blockedIndex: new Set<string>(), _mutedIndex: new Set<string>(),
  };
  const useBlockStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state) : state);
  (useBlockStore as unknown as { getState: () => unknown }).getState = () => state;
  return { useBlockStore };
});
// The store as the app reads it: through a selector, or whole by getState. One that ignored the
// selector handed the page the whole state for its user, so no reader was ever signed in.
jest.mock('@/src/stores/auth', () => {
  const state = { user: { id: 'u2', username: 'visitor', is_social_private: false }, isAuthenticated: true };
  const useAuthStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state) : state);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => state;
  return { useAuthStore };
});
jest.mock('@/src/services/StackService', () => ({
  STACK_COMMENT_PAGE: 50,
  StackService: { getStackFullPayload: jest.fn(), getStackComments: jest.fn(), addStackComment: jest.fn() },
}));
jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: jest.fn(() => []),
}));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));
// The real address shape, so the renderer finds each poster's art by its path.
jest.mock('@/src/lib/tmdb', () => ({ tmdb: { poster: (p: string, size: string) => `https://image.tmdb.org/t/p/${size}${p}` } }));
// The shared, faithful list stand-in: it gives each cell 1/numColumns of the
// width, as the phone does. A hand-made one here never read `numColumns`.
jest.mock('@/src/components/layout/CinematicFlashList', () => ({
  CinematicFlashList: require('@/mockups/tabs/flashListMock').makeFlashListMock().FlashList,
}));
jest.mock('@/src/components/ShareToLoungeModal', () => () => null);
jest.mock('@/src/components/moderation/ReportSheet', () => () => null);
jest.mock('@/src/components/moderation/ContentActionSheet', () => ({ ContentActionSheet: () => null }));

const FILMS = Array.from({ length: 9 }, (_, i) => ({ id: 100 + i, title: POSTER_TITLES[i], poster_path: POSTER_PATHS[i] }));
const STACK = {
  id: STACK_ID, title: 'Rooms With No Exit', userId: 'u1', user: 'morpho',
  description: 'Films where the walls close in and the camera refuses to leave.',
  createdAt: '2026-06-01T00:00:00Z', films: FILMS, filmCount: FILMS.length,
  isPrivate: false, isRanked: true, critiqueCount: 0,
};

const STATES: [string, Record<string, unknown>][] = [
  ['stack', {}],
  // No film with art: no hero, so no veil — the room itself is the ground.
  ['stack-noart', { films: FILMS.map((f) => ({ ...f, poster_path: null })) }],
  // The reader's own stack, which the house withholds: marked for them, the appeal-by date and the
  // verdict a tap away (round 14).
  ['stack-own-withheld', { userId: 'u2', user: 'visitor', withheldAt: '2026-11-18T10:00:00Z' }],
];
/** The states whose reader reads a stack of theirs withheld: the list the house sends them. */
const WITHHELD: Record<string, unknown[]> = {
  'stack-own-withheld': [{ kind: 'list', piece_id: STACK_ID, verdict_id: 'v-list', appeal_by: '2026-12-18T10:00:00Z', appealed: false }],
};

// Each state in every layout: the captions' two-line box grows with the text.
const RUNS = STATES.flatMap(([name, over]) => LAYOUTS.map((l) => [`${name}${l.suffix}`, over, l, name] as const));

whenRendering('stack page generator', () => {
  it.each(RUNS)('writes %s', async (name, over, layout, state) => {
    mockStackData = { list: { ...STACK, ...over }, endorseCount: 3 };
    mockWithheld = WITHHELD[state] ?? [];
    const html = await atLayout(layout, async () => {
      let r!: ReturnType<typeof render>;
      await act(async () => { r = render(<StackDetailScreen />); });
      return toHtml(r.toJSON(), { posters: POSTERS, local: LOCAL_ART });
    });
    writeScreen(name, html);
    console.log(`WROTE ${name}: ${html.length} bytes`);
    expect(html.length).toBeGreaterThan(3000);
    // A withheld stack drawn with its mark, and only then.
    expect(html.split('WITHHELD BY THE HOUSE').length - 1).toBe(WITHHELD[state]?.length ?? 0);
  });
});
