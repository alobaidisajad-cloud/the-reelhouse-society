/**
 * A GENERATOR, not a test. Mounts the person page and converts the resolved
 * React Native tree to HTML, so its light — and the join where its hero meets
 * the room — can be measured rather than argued.
 *
 * Run: MOCKUPS=1 npx jest zz-person.gen  (see mockups/README.md)
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { toHtml } from '@/src/components/profile/__tests__/zz-render.lib';
import { LAYOUTS, atLayout, whenRendering, writeScreen } from '@/mockups/paths';
import { POSTERS, POSTER_PATHS, POSTER_TITLES, LOCAL_ART } from '@/src/components/profile/__tests__/zz-art.gen';

import PersonDetailScreen from '../[id]';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: require('@/mockups/paths').textSize.scale }),
}));

let mockQuery: Record<string, unknown>;
jest.mock('@tanstack/react-query', () => ({
  useQuery: () => mockQuery,
  useQueryClient: () => ({ setQueryData: jest.fn(), getQueryData: jest.fn(), invalidateQueries: jest.fn() }),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: '1032' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/src/stores/films', () => {
  const state = { _loggedIndex: {} };
  const useArchiveStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state) : state);
  return { useArchiveStore };
});
jest.mock('@/src/stores/auth', () => {
  const state = { user: { id: 'me', username: 'visitor' } };
  const useAuthStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state) : state);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => state;
  return { useAuthStore };
});
jest.mock('@/src/hooks/useClearance', () => ({ useClearance: () => ({ held: true, standing: 'held', open: jest.fn() }) }));
// The real address shapes, so the renderer finds each picture's art by its path.
jest.mock('@/src/lib/tmdb', () => {
  const actual = jest.requireActual('@/src/lib/tmdb');
  return {
    ...actual,
    tmdb: {
      ...actual.tmdb,
      person: jest.fn(), personCredits: jest.fn(),
      backdrop: (p: string) => `https://image.tmdb.org/t/p/w1280${p}`,
      poster: (p: string, size = 'w342') => `https://image.tmdb.org/t/p/${size}${p}`,
      profile: (p: string, size = 'h632') => `https://image.tmdb.org/t/p/${size}${p}`,
    },
  };
});
// The shared, faithful list stand-in. A hand-made one here laid the three-
// column filmography out as six 65pt columns (it never read `numColumns`), and
// a measurement then reported film titles too wide for cards half their size.
jest.mock('@/src/components/layout/CinematicFlashList', () => ({
  CinematicFlashList: require('@/mockups/tabs/flashListMock').makeFlashListMock().FlashList,
}));

const PERSON = {
  name: 'Wong Kar-wai', profile_path: null, birthday: '1958-07-17', deathday: null,
  place_of_birth: 'Shanghai, China', known_for_department: 'Directing',
  biography: 'A director whose films are made of longing, rain, neon and the minutes that slip away between two people.',
};
const CREDITS = Array.from({ length: 6 }, (_, i) => ({
  id: 200 + i, title: POSTER_TITLES[i], poster_path: POSTER_PATHS[i],
  // Backdrops drawn from the same art the renderer holds.
  backdrop_path: POSTER_PATHS[i], release_date: `${1990 + i * 4}-05-01`,
  vote_average: 8 - i * 0.2, vote_count: 3000 - i * 300, popularity: 50 - i,
  job: 'Director', jobs: ['Director'],
}));

const STATES: [string, Record<string, unknown>][] = [
  ['person', { data: { person: PERSON, allCredits: CREDITS }, isLoading: false, error: null }],
  // No film with a backdrop: no hero picture, so no veil and no bloom.
  ['person-noart', { data: { person: PERSON, allCredits: CREDITS.map((c) => ({ ...c, backdrop_path: null })) }, isLoading: false, error: null }],
  ['person-loading', { data: undefined, isLoading: true, error: null }],
];

// Each state in every layout: the filmography's title box grows with the text.
const RUNS = STATES.flatMap(([name, q]) => LAYOUTS.map((l) => [`${name}${l.suffix}`, q, l] as const));

whenRendering('person page generator', () => {
  it.each(RUNS)('writes %s', async (name, q, layout) => {
    mockQuery = { ...q, refetch: jest.fn() };
    const html = await atLayout(layout, async () => {
      let r!: ReturnType<typeof render>;
      await act(async () => { r = render(<PersonDetailScreen />); });
      return toHtml(r.toJSON(), { posters: POSTERS, local: LOCAL_ART });
    });
    writeScreen(name, html);
    console.log(`WROTE ${name}: ${html.length} bytes`);
    expect(html.length).toBeGreaterThan(1500);
  });
});
