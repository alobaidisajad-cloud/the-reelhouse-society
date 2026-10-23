/**
 * Every pushed screen's header starts at the pushed header's top.
 *
 * A pushed screen has no top bar above it, and each drew its header from its
 * own sum on the inset: four floors (20, 44, 56, 60) and four gaps, and the
 * Dispatch's reached pages none at all, their back arrow under the clock. Each
 * route is drawn here at three top insets and its header must start at
 * usePushedHeaderTop's value, at the same place every time. The route list is
 * the app directory's own: a new route fails here until it is measured or
 * named as having no header.
 */
import React, { act } from 'react';
import { relative, sep } from 'path';
import { files as universe } from '@/test-utils/universe';
import { render } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { MOBILE } from '@/test-utils/readCode';
import { INSETS, placesAt, topValues } from '@/test-utils/topEdge';
import { pushedHeaderTop } from '@/src/components/layout/navMetrics';
import { supabase } from '@/src/lib/supabase';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useLoungeStore } from '@/src/stores/lounge';

// Each case draws a whole screen at three insets: seconds on a busy machine.
jest.setTimeout(60_000);

let mockInsetTop = 59;
jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => mockReact.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: mockInsetTop, bottom: 34, left: 0, right: 0 }),
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
    user: { id: 'me', username: 'kane', role: mockRole, tier: 'archivist', is_social_private: false, preferences: {} },
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
      // A person's file, while it is read: its way back is drawn from the first frame.
      if (opts.queryKey[0] === 'person') return { data: undefined, isLoading: true, error: null, refetch: jest.fn() };
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
    arrange: () => { mockRole = 'admin'; secondKey(true); } },
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
/** The admin's second factors, as the Tribunal's door reads them (P0.94): the key given this session, or none registered. */
const KEY = { id: '00000000-0000-4000-8000-000000000001', factor_type: 'totp', status: 'verified', friendly_name: 'Tribunal key' } as const;
const secondKey = (held: boolean) => Object.assign(supabase.auth, {
  mfa: supabaseFake({ mfa: held ? { level: 'aal2', code: '246810', factors: [KEY] } : { code: '246810' } }).client.auth.mfa,
});

const STATES: (Route & { name: string })[] = [
  { name: 'the Tribunal\'s door, a key to register', file: 'app/(admin)/tribunal.tsx', draw: () => { const C = require('@/app/(admin)/tribunal').default; return <C />; },
    arrange: () => { mockRole = 'admin'; secondKey(false); } },
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

/** Routes with no header to place: each says why. */
const NO_HEADER: Record<string, string> = {
  'app/auth-callback.tsx': 'a centred page that only says the link is being read, then leaves',
  'app/+not-found.tsx': 'a centred page whose one control is RETURN TO LOBBY',
  'app/dossier/[id].tsx': 'a redirect to the Dispatch reader',
  'app/lounge.tsx': 'a redirect to the Lounge tab',
  'app/year-in-cinema.tsx': 'full-bleed slides; its close button is an overlay, measured with the overlays',
};

const { useLocalSearchParams } = jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock };

async function measure(route: Route): Promise<string[]> {
  const missing: string[] = [];
  let same = null as Set<string> | null;
  for (const insetTop of INSETS) {
    mockInsetTop = insetTop;
    route.arrange?.();
    useLocalSearchParams.mockReturnValue(route.params ?? {});
    let r!: ReturnType<typeof render>;
    await act(async () => {
      r = render(
        <QueryClientProvider client={testQueryClient(route.live ? {} : { queries: { enabled: false } })}>
          {route.draw()}
        </QueryClientProvider>,
      );
    });
    await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
    const want = pushedHeaderTop(insetTop);
    const at = placesAt(r.toJSON(), want);
    if (at.size === 0) missing.push(`${insetTop}pt: no top at ${want}, only ${topValues(r.toJSON())}`);
    same = same ? new Set([...same].filter((p) => at.has(p))) : at;
    r.unmount();
  }
  if (missing.length === 0 && same!.size === 0) missing.push('the top moved between insets: no one place holds it');
  return missing;
}

afterEach(() => {
  mockRole = 'archivist';
  mockRoom = null;
  useLocalSearchParams.mockReturnValue({});
  (supabase.from as jest.Mock).mockImplementation(houseFrom);
  delete (supabase.auth as { mfa?: unknown }).mfa;
});

describe.each(ROUTES.map((r) => [r.file, r] as const))('%s', (_file, route) => {
  it('starts its header at the pushed header’s top, at every inset', async () => {
    expect(await measure(route)).toEqual([]);
  });
});

describe.each(STATES.map((r) => [r.name, r] as const))('%s', (_name, route) => {
  it('starts its header at the pushed header’s top, at every inset', async () => {
    expect(await measure(route)).toEqual([]);
  });
});

it('measures every pushed route in app/, or names why it has no header', () => {
  const routes = universe('routes')
    .map((f) => relative(MOBILE, f).split(sep).join('/'))
    // Layouts draw no page; the tabs and the modal routes have tests of their own.
    .filter((f) => !f.endsWith('/_layout.tsx') && !f.startsWith('app/(tabs)/') && !f.startsWith('app/(modals)/'))
    .filter((f) => f !== 'app/dispatch/compose.tsx');
  expect(routes.length).toBeGreaterThan(15);
  const named = new Set([...ROUTES.map((r) => r.file), ...Object.keys(NO_HEADER)]);
  expect(routes.filter((f) => !named.has(f))).toEqual([]);
  expect([...named].filter((f) => !routes.includes(f))).toEqual([]);
});
