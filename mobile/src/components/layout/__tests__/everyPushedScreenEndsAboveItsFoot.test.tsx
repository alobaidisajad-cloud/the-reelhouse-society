/**
 * Every pushed screen ends above its foot: the home indicator, or a bar docked on it.
 *
 * A pushed screen has no tab bar under it, and each drew its foot from its own
 * sum on the inset: six gaps (24, 40, 60, 64, 100, 120) and three floors, and
 * some none at all, the last line under the home indicator. Each route is drawn
 * here at three bottom insets (an SE's 0, an older notch phone's 21, a
 * home-indicator iPhone's 34), its content arrived, and each of its feet must be
 * its navMetrics helper's value at the same place every time: the scroll's end
 * (useContentBottom), or, under a docked bar, the bar on the edge and the scroll
 * above it. The routes are the page-top test's own (everyPushedHeaderStartsAtItsTop).
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { placesHoldingFoot } from '@/test-utils/bottomEdge';
import { aboveDockedBar, bottomEdge, contentBottom } from '@/src/components/layout/navMetrics';
import { scrollReserve } from '@/src/components/film/filmStubMetrics';
import { supabase } from '@/src/lib/supabase';
import { useLoungeStore } from '@/src/stores/lounge';
import { useDispatch } from '@/src/stores/dispatch';
import { toFiling } from '@/src/stores/dispatchTypes';
import { BAR_FOOT_GAP } from '@/app/lounge/[id]';
import { DOCK_ROOM, POST_DOCK_GAP } from '@/app/dispatch/[id]';

/** A person's file, as its query hands it over (thePersonFileReadsTrue's shape). */
const mockPersonFile = {
  person: {
    name: 'Wong Kar-wai', profile_path: null, birthday: '1958-07-17', deathday: null,
    place_of_birth: 'Shanghai, China', known_for_department: 'Directing', biography: 'Longing, rain, neon.',
  },
  allCredits: [{
    id: 3, title: 'In the Mood for Love', poster_path: '/p3.jpg', backdrop_path: null, release_date: '2000-09-29',
    vote_average: 7, vote_count: 100, popularity: 10, job: 'Director', jobs: ['Director'],
  }],
};
/** A stack, as its query hands it over. */
const mockStack = {
  list: {
    id: 'stack', title: 'Night Walks', description: '', userId: 'u2', user: 'morpho',
    createdAt: '2026-08-01T00:00:00Z', films: [{ id: 1, title: 'Chungking Express', poster_path: null }],
    isPrivate: false, isRanked: false,
  },
  endorseCount: 2,
};
/** A member's room, read (useMemberRoom's shape), with nothing filed yet. */
jest.mock('@/src/hooks/useMemberRoom', () => ({
  useMemberRoom: () => ({
    author: null, filings: [], filed: 0, certified: 0, totalsKnown: true, certifiedAtFetch: new Set(),
    loading: false, missing: false, failed: false, reload: jest.fn(),
    more: false, loadingMore: false, moreFailed: false, loadMore: jest.fn(),
  }),
}));
/** A filing as PostgREST returns it (readerScreen's shape), a part of a series. */
const FILING = {
  id: 'f1', kind: 'dossier', user_id: 'u2', author_username: 'tomasreyes', title: 'The Empty Room',
  body: 'An excerpt.', full_content: 'Ozu frames a room and then leaves it.\n\nThat is the argument.',
  subject_kind: null, subject_id: null, subject_title: null, options: null, closes_at: null,
  frozen_totals: null, answer_id: null, series_id: 'series', series_title: 'Ozu, in four parts',
  part_number: 1, spoiler_label: null, withheld_at: null, ended_at: null, ended_by: null,
  certify_count: 9, comment_count: 0, created_at: '2026-08-28T21:00:00Z', edited_at: null,
  profiles: { username: 'tomasreyes', member_no: 147, tier: 'auteur', role: null, is_founding: false },
};

// Each case draws a whole screen at three bottom insets: seconds on a busy machine.
jest.setTimeout(60_000);

let mockInsetBottom = 34;
jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => mockReact.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: 59, bottom: mockInsetBottom, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useScrollToTop: jest.fn(),
  useIsFocused: () => true,
  useNavigation: () => ({ addListener: () => () => {}, setOptions: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }),
  usePreventRemove: jest.fn(),
}));
jest.mock('react-native-webview', () => ({ WebView: () => null }));

let mockRole = 'archivist';
jest.mock('@/src/stores/auth', () => {
  // One object per rank, as a store keeps one: a new member each read reruns every effect on it.
  const held: Record<string, unknown> = {};
  const state = () => (held[mockRole] ??= {
    isAuthenticated: true,
    user: { id: 'me', username: 'kane', role: mockRole, tier: 'archivist', preferences: {} },
    restoreSession: () => Promise.resolve(),
    updateUser: () => Promise.resolve(),
  });
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(state()) : state());
  (useAuthStore as unknown as { getState: () => unknown }).getState = state;
  return { useAuthStore };
});

/** A member's file, loaded (memberFileFixture), in its main view or a room. */
let mockRoom: string | null = null;
jest.mock('@/src/hooks/useProfileController', () => ({
  useProfileController: () => require('./memberFileFixture').memberFile({ activeTab: mockRoom, isSelf: false }),
}));

/** A film's page, loading or arrived. */
let mockFilm: Record<string, unknown> = { data: undefined, isLoading: true, isError: false, refetch: jest.fn() };
jest.mock('@/src/hooks/useFilmDetail', () => ({ useFilmDetail: () => mockFilm }));

/** A log's page: its record, as its query hands it over (theLogPageMovesEveryCard's shape). */
const LOG = {
  id: '22222222-2222-4222-8222-222222222222', film_id: 843, film_title: 'In the Mood for Love',
  poster_path: null, year: 2000, rating: 5, review: 'Every corridor is a held breath.', pull_quote: null,
  drop_cap: false, alt_poster: null, status: 'watched', is_spoiler: false, watched_date: '2026-08-12',
  watched_with: null, physical_media: null, abandoned_reason: null, is_autopsied: false, autopsy: null,
  user_id: 'u1', created_at: '2026-08-12T21:00:00Z', editorial_header: 'yes',
};
jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: (opts: { queryKey: unknown[] }) => {
      if (opts.queryKey[0] === 'log') {
        return {
          data: { log: LOG, profile: { id: 'u1', username: 'morpho', role: 'archivist', avatar_url: null, member_no: 7 },
            comments: [], commentTotal: 0, certifyCount: 0 },
          isLoading: false, isError: false, refetch: jest.fn(),
        };
      }
      // A person's file and a stack, arrived: their scroll is drawn only then.
      if (opts.queryKey[0] === 'person') {
        return { data: mockPersonFile, isLoading: false, error: null, refetch: jest.fn() };
      }
      if (opts.queryKey[0] === 'stack') {
        return { data: mockStack, isLoading: false, isError: false, refetch: jest.fn() };
      }
      return actual.useQuery(opts);
    },
  };
});
jest.mock('@/src/hooks/useClearance', () => ({
  useClearance: () => ({ held: true, standing: 'held', open: jest.fn(), loading: false }),
}));
jest.mock('@/src/hooks/useVault', () => ({ useVault: () => ({ note: null, loaded: true, unreachable: false }) }));

type Route = {
  file: string;
  draw: () => React.ReactElement;
  params?: Record<string, string>;
  arrange?: () => void;
  /** Its reads are answered (by the mocked house), not left unasked. */
  live?: boolean;
};

const ROOM = {
  id: 'room', name: 'The Back Row', description: '', is_private: false,
  creator_id: 'host', created_at: '2026-01-01T00:00:00Z', member_count: 3,
};
/** The house's own `from`, kept to put back after a route that answers one table. */
const houseFrom = (supabase.from as jest.Mock).getMockImplementation()!;

const ROUTES: Route[] = [
  { file: 'app/film/[id].tsx', params: { id: '550' }, draw: () => { const C = require('@/app/film/[id]').default; return <C />; },
    arrange: () => { mockFilm = { data: undefined, isLoading: true, isError: false, refetch: jest.fn() }; } },
  { file: 'app/person/[id].tsx', params: { id: '287' }, draw: () => { const C = require('@/app/person/[id]').default; return <C />; } },
  { file: 'app/lounge/[id].tsx', params: { id: 'room' }, draw: () => { const C = require('@/app/lounge/[id]').default; return <C />; },
    arrange: () => {
      useLoungeStore.setState({ lounges: [ROOM] } as never);
      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        const chain = houseFrom(table);
        if (table === 'lounges') chain.maybeSingle = jest.fn().mockResolvedValue({ data: ROOM, error: null });
        return chain;
      });
    } },
  { file: 'app/user/[username].tsx', params: { username: 'morpho' }, draw: () => { const C = require('@/app/user/[username]').default; return <C />; },
    arrange: () => { mockRoom = null; } },
  { file: 'app/settings.tsx', draw: () => { const C = require('@/app/settings').default; return <C />; } },
  { file: 'app/log/[id].tsx', params: { id: LOG.id }, draw: () => { const C = require('@/app/log/[id]').default; return <C />; } },
  { file: 'app/reset-password.tsx', draw: () => { const C = require('@/app/reset-password').default; return <C />; },
    arrange: () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { id: 'me' } } }, error: null });
    } },
  { file: 'app/(admin)/tribunal.tsx', draw: () => { const C = require('@/app/(admin)/tribunal').default; return <C />; },
    arrange: () => { mockRole = 'admin'; } },
  { file: 'app/stacks/[id].tsx', params: { id: 'stack' }, draw: () => { const C = require('@/app/stacks/[id]').default; return <C />; } },
  { file: 'app/film-reviews/[id].tsx', params: { id: '550', title: 'Fight Club' }, draw: () => { const C = require('@/app/film-reviews/[id]').default; return <C />; } },
  { file: 'app/dispatch/[id].tsx', params: { id: 'gone' }, draw: () => { const C = require('@/app/dispatch/[id]').default; return <C />; } },
  { file: 'app/edit-profile.tsx', draw: () => { const C = require('@/app/edit-profile').default; return <C />; } },
  { file: 'app/dispatch/archive.tsx', draw: () => { const C = require('@/app/dispatch/archive').default; return <C />; } },
  { file: 'app/dispatch/rules.tsx', draw: () => { const C = require('@/app/dispatch/rules').default; return <C />; } },
  { file: 'app/dispatch/room/[username].tsx', params: { username: 'morpho' }, draw: () => { const C = require('@/app/dispatch/room/[username]').default; return <C />; } },
  { file: 'app/dispatch/series/[id].tsx', params: { id: 'series' }, draw: () => { const C = require('@/app/dispatch/series/[id]').default; return <C />; } },
];

/** A second state of a route whose header is drawn by other code. */
const STATES: (Route & { name: string })[] = [
  { name: 'a film arrived (the floating back and the scroll header)', file: 'app/film/[id].tsx', params: { id: '550' },
    draw: () => { const C = require('@/app/film/[id]').default; return <C />; },
    arrange: () => {
      mockFilm = {
        data: { detail: { id: 550, title: 'Fight Club', credits: { cast: [], crew: [] } }, reviews: [], similar: [], verdict: null },
        isLoading: false, isError: false, refetch: jest.fn(),
      };
    } },
  { name: 'a room of a member’s file', file: 'app/user/[username].tsx', params: { username: 'morpho' },
    draw: () => { const C = require('@/app/user/[username]').default; return <C />; },
    arrange: () => { mockRoom = 'ledger'; } },
];

/** What a route needs beyond the page-top test's drawing for its foot to be drawn. */
const ARRIVED: Record<string, { params?: Record<string, string>; arrange?: () => void }> = {
  'app/dispatch/[id].tsx': {
    params: { id: 'f1' },
    arrange: () => { useDispatch.setState({ filings: [toFiling(FILING as never)] } as never); },
  },
  'app/dispatch/series/[id].tsx': {
    arrange: () => {
      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        const chain = houseFrom(table);
        if (table === 'dispatch_posts') {
          chain.then = jest.fn((cb) => Promise.resolve(cb({ data: [FILING], error: null, count: 1 })));
        }
        return chain;
      });
    },
  },
};

/** Where each route's feet are, in the state it is drawn in, as navMetrics says. */
const FOOT: Record<string, ((b: number) => number)[]> = {
  // While the film is read: the stub's place, held on the edge.
  'app/film/[id].tsx': [bottomEdge],
  'app/person/[id].tsx': [contentBottom],
  // The composer, on the edge: the room's list ends above it, in the column.
  'app/lounge/[id].tsx': [(b) => bottomEdge(b) + BAR_FOOT_GAP],
  'app/user/[username].tsx': [contentBottom],
  'app/settings.tsx': [contentBottom],
  'app/log/[id].tsx': [contentBottom],
  'app/reset-password.tsx': [contentBottom],
  'app/(admin)/tribunal.tsx': [contentBottom],
  'app/stacks/[id].tsx': [contentBottom],
  'app/film-reviews/[id].tsx': [contentBottom],
  // The docked bar on the edge, and the scroll above the room it keeps for it.
  'app/dispatch/[id].tsx': [(b) => aboveDockedBar(b, DOCK_ROOM), (b) => bottomEdge(b) + POST_DOCK_GAP],
  'app/edit-profile.tsx': [contentBottom],
  'app/dispatch/archive.tsx': [contentBottom],
  'app/dispatch/rules.tsx': [contentBottom],
  'app/dispatch/room/[username].tsx': [contentBottom],
  'app/dispatch/series/[id].tsx': [contentBottom],
  // The stub on the edge, and the scroll above it.
  'a film arrived (the floating back and the scroll header)': [scrollReserve, bottomEdge],
  'a room of a member’s file': [contentBottom],
};

const { useLocalSearchParams } = jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock };

const draw = (route: Route, key: string) => async (insetBottom: number) => {
  mockInsetBottom = insetBottom;
  route.arrange?.();
  ARRIVED[key]?.arrange?.();
  useLocalSearchParams.mockReturnValue(ARRIVED[key]?.params ?? route.params ?? {});
  let r!: ReturnType<typeof render>;
  await act(async () => {
    r = render(
      <QueryClientProvider client={testQueryClient(route.live ? {} : { queries: { enabled: false } })}>
        {route.draw()}
      </QueryClientProvider>,
    );
  });
  // Two turns: a read that lands on the first draws its list on the second.
  await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
  await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
  return { tree: r.toJSON(), done: () => r.unmount() };
};

/** Each foot the route names, at every inset, at one place each. */
async function feet(route: Route, key: string) {
  const missing: string[] = [];
  for (const want of FOOT[key]) missing.push(...await placesHoldingFoot(draw(route, key), want));
  return missing;
}

afterEach(() => {
  mockRole = 'archivist';
  mockRoom = null;
  useLocalSearchParams.mockReturnValue({});
  (supabase.from as jest.Mock).mockImplementation(houseFrom);
  useDispatch.setState({ filings: [] } as never);
});

describe.each(ROUTES.map((r) => [r.file, r] as const))('%s', (file, route) => {
  it('ends above its foot at every bottom inset, at the same place', async () => {
    expect(await feet(route, file)).toEqual([]);
  });
});

describe.each(STATES.map((r) => [r.name, r] as const))('%s', (name, route) => {
  it('ends above its foot at every bottom inset, at the same place', async () => {
    expect(await feet(route, name)).toEqual([]);
  });
});

it('names a foot for every route the page-top test draws, and no other', () => {
  const drawn = [...ROUTES.map((r) => r.file), ...STATES.map((r) => r.name)];
  expect(Object.keys(FOOT).sort()).toEqual([...drawn].sort());
});

it('every pushed foot clears the home indicator, on a phone with none as with one', () => {
  for (const b of [0, 21, 34, 48]) {
    expect(contentBottom(b)).toBeGreaterThan(b);
    expect(bottomEdge(b)).toBeGreaterThanOrEqual(b);
    expect(aboveDockedBar(b, DOCK_ROOM)).toBeGreaterThan(b + DOCK_ROOM);
    expect(scrollReserve(b)).toBeGreaterThan(b);
  }
});
