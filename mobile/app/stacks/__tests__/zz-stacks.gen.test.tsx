/**
 * A GENERATOR, not a test. Mounts the stack page and converts the resolved
 * React Native tree to HTML, so its light can be measured rather than argued.
 * Mock setup follows stack-detail.redesign.test.tsx, which already knew how to
 * stand this page up; the gradients here are the real ones, so they render.
 *
 * Run: MOCKUPS=1 npx jest zz-stacks.gen
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { toHtml } from '@/src/components/profile/__tests__/zz-render.lib';
import { POSTERS, POSTER_PATHS, POSTER_TITLES, LOCAL_ART } from '@/src/components/profile/__tests__/zz-art.gen';

import StackDetailScreen from '../[id]';

const OUT = 'C:/Users/OMEN/AppData/Local/Temp/claude/C--Users-OMEN-OneDrive-Desktop-divisionops-reelhouse-mobile/e2141512-2b50-44d3-be60-96590e558dd6/scratchpad/mockups';
const STACK_ID = '11111111-1111-4111-8111-111111111111';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));

let mockStackData: Record<string, unknown>;
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismiss: jest.fn() },
  useLocalSearchParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@tanstack/react-query', () => ({
  QueryClient: class { defaultOptions = {}; getQueryCache = () => ({ subscribe: () => () => {} }); },
  useQueryClient: () => ({
    setQueryData: jest.fn(), getQueryData: jest.fn(), removeQueries: jest.fn(),
    invalidateQueries: jest.fn(), cancelQueries: jest.fn(() => Promise.resolve()),
  }),
  useQuery: (opts: { queryKey: unknown[] }) => {
    const key = String(opts.queryKey[0]);
    if (key === 'stackComments') return { data: [] };
    if (key === 'stack') return { data: mockStackData, isLoading: false, isError: false };
    return { data: undefined, isLoading: false, isError: false };
  },
}));
jest.mock('@/src/stores/films', () => {
  const state = { logs: [], lists: [], _listEndorsedIndex: {}, toggleListEndorse: jest.fn(), deleteList: jest.fn() };
  const useListStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state) : state);
  (useListStore as unknown as { getState: () => unknown }).getState = () => state;
  return { useListStore };
});
jest.mock('@/src/stores/blockStore', () => {
  const state = { blockUser: jest.fn(), muteUser: jest.fn(), isBlocked: () => false, isMuted: () => false };
  const useBlockStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state) : state);
  (useBlockStore as unknown as { getState: () => unknown }).getState = () => state;
  return { useBlockStore };
});
jest.mock('@/src/stores/auth', () => ({ useAuthStore: () => ({ user: { id: 'u2', username: 'visitor' } }) }));
jest.mock('@/src/services/StackService', () => ({
  StackService: { getStackFullPayload: jest.fn(), getStackComments: jest.fn(), addStackComment: jest.fn() },
}));
jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(), flushOfflineQueue: jest.fn(), getOfflineQueue: jest.fn(() => []),
}));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));
// The real address shape, so the renderer finds each poster's art by its path.
jest.mock('@/src/lib/tmdb', () => ({ tmdb: { poster: (p: string, size: string) => `https://image.tmdb.org/t/p/${size}${p}` } }));
jest.mock('@/src/components/layout/CinematicFlashList', () => {
  const React = require('react');
  const { View } = require('react-native');
  const render = (c: React.ReactNode) => (typeof c === 'function' ? React.createElement(c as never) : c);
  return { CinematicFlashList: ({ ListHeaderComponent, data, renderItem, contentContainerStyle }: {
    ListHeaderComponent?: React.ReactNode; data?: unknown[];
    renderItem?: (a: { item: unknown; index: number }) => React.ReactNode; contentContainerStyle?: unknown;
  }) => React.createElement(View, { style: { flex: 1 } },
    React.createElement(View, { style: contentContainerStyle },
      render(ListHeaderComponent),
      React.createElement(View, { style: { flexDirection: 'row', flexWrap: 'wrap' } },
        ...(data ?? []).map((item, index) =>
          React.createElement(React.Fragment, { key: index }, renderItem ? renderItem({ item, index }) : null))))) };
});
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
];

const RUN = !!process.env.MOCKUPS;
const gate = RUN ? describe : describe.skip;
gate('stack page generator', () => {
  it.each(STATES)('writes %s', async (name, over) => {
    mkdirSync(OUT, { recursive: true });
    mockStackData = { list: { ...STACK, ...over }, endorseCount: 3 };
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<StackDetailScreen />); });
    const html = toHtml(r.toJSON(), { posters: POSTERS, local: LOCAL_ART });
    writeFileSync(join(OUT, `${name}.html`), html, 'utf8');
    console.log(`WROTE ${name}: ${html.length} bytes`);
    expect(html.length).toBeGreaterThan(3000);
  });
});
