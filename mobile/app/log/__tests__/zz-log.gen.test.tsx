/**
 * A GENERATOR, not a test. Mounts a member's permanent record (the log page)
 * and converts the resolved React Native tree to HTML, so every kind of record —
 * each rank's stock, a still or none, a quote, the essay, the Vault, the viewings,
 * the breakdown, the band and the critiques — is measured at every text size.
 *
 * Run: MOCKUPS=1 npx jest zz-log.gen  (see mockups/README.md)
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { toHtml } from '@/src/components/profile/__tests__/zz-render.lib';
import { LAYOUTS, atLayout, readFixture, whenRendering, writeScreen } from '@/mockups/paths';
import { POSTERS, POSTER_PATHS, LOCAL_ART } from '@/src/components/profile/__tests__/zz-art.gen';

import LogDetailScreen from '../[id]';

const LOG_ID = '22222222-2222-4222-8222-222222222222';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ ...require('@/mockups/paths').PHONE, scale: 3, fontScale: require('@/mockups/paths').textSize.scale }),
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
  ...require('@/test-utils/expoRouterMock').expoRouterMock(),
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: '22222222-2222-4222-8222-222222222222' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: () => {},
}));
jest.mock('@/src/stores/auth', () => {
  const state = { user: { id: 'me', username: 'kane', is_social_private: false }, isAuthenticated: true };
  const useAuthStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state) : state);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => state;
  return { useAuthStore };
});
jest.mock('@/src/hooks/useClearance', () => ({ useClearance: () => ({ held: true, standing: 'held', open: jest.fn() }) }));
jest.mock('@/src/hooks/useVault', () => ({ useVault: () => ({
  noteFor: (id: string | null | undefined) => (id === 'v-now' ? 'Watched it the week Dad moved out. The unicorn is still the bit I cannot explain to anyone.' : id === 'v-2017' ? 'Better on the second go.' : ''),
  loaded: true, unreachable: false, reload: jest.fn(), openNote: jest.fn(), closeNote: jest.fn(), confirmRemove: jest.fn(), openedNote: null,
}) }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));
jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: jest.fn(() => []),
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

// The stills: the fixtures' own backdrops, found by their paths as the posters are.
const RAW = readFixture<Record<string, string>>('lobby-art.json');
const ART: Record<string, { title: string; data: string }> = { ...POSTERS };
for (const [p, data] of Object.entries(RAW)) if (data) ART[p] = { title: '', data };
const STILL = '/b9q9VmbXDvJmTziRqkwdEmFdwhr.jpg';

const LONG = 'Every corridor is a held breath. The film is the space between two people who have decided not to touch, and it never once lets you forget the rain.\n\nWatch the clocks. Every one of them is wrong, and nobody in the film ever looks at one.';
const LOG = {
  id: LOG_ID, film_id: 843, film_title: 'In the Mood for Love', poster_path: POSTER_PATHS[1], year: 2000,
  rating: 5, review: LONG,
  pull_quote: 'Two people who have decided not to touch.', drop_cap: true, alt_poster: null, status: 'rewatched', is_spoiler: false,
  watched_date: '2026-08-12', watched_with: 'vesper', physical_media: '35MM PRINT', abandoned_reason: null,
  is_autopsied: true, autopsy: { _v: 2, story: 9, script: 8, acting: 10, cinematography: 9, editing: 7, sound: 8 },
  user_id: 'u1', created_at: '2026-08-12T21:00:00Z', editorial_header: STILL, viewing_id: 'v-now',
  viewing_history: [
    { viewingId: 'v-2017', date: '2017-01-14', rating: 4, review: 'Colder than I remembered, and better for it.', watchedWith: null },
    { viewingId: 'v-2009', date: '2009-03-02', rating: 3, review: 'I did not understand it yet.', watchedWith: 'Dad' },
  ],
};
const PROFILE = { id: 'u1', username: 'morpho', role: 'archivist', avatar_url: null, member_no: 7 };
const NOTES = [
  { id: 'c1', user_id: 'u2', username: 'vesper', avatar_url: null, body: 'The voice-over cut is the better film and you know it.', created_at: '2026-08-13T10:00:00Z' },
  { id: 'c2', user_id: 'me', username: 'kane', avatar_url: null, body: 'The clocks. I never saw the clocks.', created_at: '2026-08-13T11:00:00Z' },
];

/** Twelve marks on every letter, six above and six below: more than any script needs. */
const piled = (words: string) => [...words].map((c) => (c === ' ' ? c : c + '̖̗̘̙̜̝̀́̂̃̄̆')).join('');

/** Each kind of record, as its reader meets it. */
const KINDS: [string, Record<string, unknown>][] = [
  // An Archivist's record read by another member: the still, the quote, the essay, the viewings, the breakdown, critiques.
  ['log', { data: { log: LOG, profile: PROFILE, comments: NOTES, commentTotal: 2, certifyCount: 12 }, isLoading: false }],
  // The band with its counts, the widest the formatter makes.
  ['log-counts', { data: { log: LOG, profile: PROFILE, comments: [], commentTotal: 999_000, certifyCount: 999_000 }, isLoading: false }],
  // An Auteur's own record: its stock, EDIT on the band, the Vault's note on its paper.
  ['log-auteur', { data: { log: { ...LOG, user_id: 'me' }, profile: { ...PROFILE, id: 'me', role: 'auteur' }, comments: [], commentTotal: 0 }, isLoading: false }],
  // A Cinephile's, no still: the plain head; abandoned, its reason; no words.
  ['log-noart', { data: { log: { ...LOG, poster_path: null, editorial_header: null, status: 'abandoned', abandoned_reason: 'Two hours in and nothing I could not have guessed.',
    review: null, pull_quote: null, rating: 0, is_autopsied: false, autopsy: null, viewing_history: [], watched_with: null, physical_media: null },
    profile: { ...PROFILE, role: 'cinephile' }, comments: [], commentTotal: 0 }, isLoading: false }],
  // Right-to-left words, and a long title.
  ['log-rtl', { data: { log: { ...LOG, film_title: 'Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb', pull_quote: null, drop_cap: false,
    review: 'يُعد هذا الفيلم تأملاً طويلاً في الانتظار، وفي الصبر، وفي ما يبقى من المرء حين لا يبقى شيء.' }, profile: PROFILE, comments: [], commentTotal: 0 }, isLoading: false }],
  // Marks piled on every letter (WORKLIST P4.31), in the review and in a critique between two
  // others: the house's Text keeps four a letter, and none may reach another row (layout's INK).
  ['log-piled-marks', { data: { log: { ...LOG, pull_quote: null, drop_cap: false, review: piled('The clocks run backwards in the last reel and nobody in the room noticed but me.') },
    profile: PROFILE, comments: [NOTES[0], { ...NOTES[1], user_id: 'u3', username: 'zalgo', body: piled('It comes for every frame, and then it comes for the next.') }, NOTES[1]], commentTotal: 3 }, isLoading: false }],
];
const RUNS = KINDS.flatMap(([name, q]) => LAYOUTS.map((l) => [`${name}${l.suffix}`, q, l] as const));

whenRendering('log page generator', () => {
  it.each(RUNS)('writes %s', async (name, q, layout) => {
    mockQuery = q;
    const html = await atLayout(layout, async () => {
      let r!: ReturnType<typeof render>;
      await act(async () => { r = render(<LogDetailScreen />); });
      return toHtml(r.toJSON(), { posters: ART, local: LOCAL_ART });
    });
    writeScreen(name, html);
    console.log(`WROTE ${name}: ${html.length} bytes`);
    expect(html.length).toBeGreaterThan(3000);
  });
});
