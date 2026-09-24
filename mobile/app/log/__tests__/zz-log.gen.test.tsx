/**
 * A GENERATOR, not a test. Mounts a member's permanent record (the log page)
 * and converts the resolved React Native tree to HTML, so its light — and the
 * join where the picture behind it meets the room — can be measured.
 *
 * Run: MOCKUPS=1 npx jest zz-log.gen
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { toHtml } from '@/src/components/profile/__tests__/zz-render.lib';
import { POSTERS, POSTER_PATHS, LOCAL_ART } from '@/src/components/profile/__tests__/zz-art.gen';

import LogDetailScreen from '../[id]';

const OUT = 'C:/Users/OMEN/AppData/Local/Temp/claude/C--Users-OMEN-OneDrive-Desktop-divisionops-reelhouse-mobile/e2141512-2b50-44d3-be60-96590e558dd6/scratchpad/mockups';
const LOG_ID = '22222222-2222-4222-8222-222222222222';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));

let mockQuery: Record<string, unknown>;
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: () => mockQuery,
  useQueryClient: () => ({
    setQueryData: jest.fn(), getQueryData: jest.fn(), invalidateQueries: jest.fn(),
    cancelQueries: jest.fn(() => Promise.resolve()), removeQueries: jest.fn(),
  }),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: '22222222-2222-4222-8222-222222222222' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: () => {},
}));
jest.mock('@/src/stores/auth', () => {
  const state = { user: { id: 'me', username: 'visitor' }, isAuthenticated: true };
  const useAuthStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state) : state);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => state;
  return { useAuthStore };
});
jest.mock('@/src/hooks/useClearance', () => ({ useClearance: () => ({ held: true, standing: 'held', open: jest.fn() }) }));
jest.mock('@/src/hooks/useVault', () => ({ useVault: () => ({ note: null, loaded: true, unreachable: false }) }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));
jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(), flushOfflineQueue: jest.fn(), getOfflineQueue: jest.fn(() => []),
}));
jest.mock('@/src/components/ShareToLoungeModal', () => () => null);
jest.mock('@/src/components/moderation/ReportSheet', () => () => null);
jest.mock('@/src/components/moderation/ContentActionSheet', () => ({ ContentActionSheet: () => null }));
// The real address shapes, so the renderer finds each picture's art by its path.
jest.mock('@/src/lib/tmdb', () => {
  const actual = jest.requireActual('@/src/lib/tmdb');
  return {
    ...actual,
    tmdb: {
      ...actual.tmdb,
      backdrop: (p: string, size = 'w1280') => `https://image.tmdb.org/t/p/${size}${p}`,
      poster: (p: string, size = 'w342') => `https://image.tmdb.org/t/p/${size}${p}`,
    },
  };
});

const LOG = {
  id: LOG_ID, film_id: 843, film_title: 'In the Mood for Love', poster_path: POSTER_PATHS[1], year: 2000,
  rating: 5, review: 'Every corridor is a held breath. The film is the space between two people who have decided not to touch, and it never once lets you forget the rain.',
  pull_quote: null, drop_cap: true, alt_poster: null, status: 'watched', is_spoiler: false,
  watched_date: '2026-08-12', watched_with: null, physical_media: null, abandoned_reason: null,
  is_autopsied: false, autopsy: null, user_id: 'u1', created_at: '2026-08-12T21:00:00Z', editorial_header: null,
};
const PROFILE = { id: 'u1', username: 'morpho', role: 'archivist', avatar_url: null, member_no: 7 };

const STATES: [string, Record<string, unknown>][] = [
  ['log', { data: { log: LOG, profile: PROFILE, comments: [], commentTotal: 0 }, isLoading: false }],
  // An Auteur's record: the crimson sheet over the same picture.
  ['log-auteur', { data: { log: LOG, profile: { ...PROFILE, role: 'auteur' }, comments: [], commentTotal: 0 }, isLoading: false }],
  // No picture at all: no backdrop, so no veil and no bloom.
  ['log-noart', { data: { log: { ...LOG, poster_path: null }, profile: PROFILE, comments: [], commentTotal: 0 }, isLoading: false }],
];

const RUN = !!process.env.MOCKUPS;
const gate = RUN ? describe : describe.skip;
gate('log page generator', () => {
  it.each(STATES)('writes %s', async (name, q) => {
    mkdirSync(OUT, { recursive: true });
    mockQuery = q;
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<LogDetailScreen />); });
    const html = toHtml(r.toJSON(), { posters: POSTERS, local: LOCAL_ART });
    writeFileSync(join(OUT, `${name}.html`), html, 'utf8');
    console.log(`WROTE ${name}: ${html.length} bytes`);
    expect(html.length).toBeGreaterThan(3000);
  });
});
