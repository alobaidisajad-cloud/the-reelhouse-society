/**
 * A GENERATOR, not a test. Mounts the person page and converts the resolved
 * React Native tree to HTML, so its light — and the join where its hero meets
 * the room — can be measured rather than argued.
 *
 * Run: MOCKUPS=1 npx jest zz-person.gen
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { toHtml } from '@/src/components/profile/__tests__/zz-render.lib';
import { POSTERS, POSTER_PATHS, POSTER_TITLES, LOCAL_ART } from '@/src/components/profile/__tests__/zz-art.gen';

import PersonDetailScreen from '../[id]';

const OUT = 'C:/Users/OMEN/AppData/Local/Temp/claude/C--Users-OMEN-OneDrive-Desktop-divisionops-reelhouse-mobile/e2141512-2b50-44d3-be60-96590e558dd6/scratchpad/mockups';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
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
jest.mock('@/src/components/layout/CinematicFlashList', () => {
  const React = require('react');
  const { View } = require('react-native');
  const render = (c: React.ReactNode) => (typeof c === 'function' ? React.createElement(c as never) : c);
  return { CinematicFlashList: ({ ListHeaderComponent, ListFooterComponent, data, renderItem, contentContainerStyle }: {
    ListHeaderComponent?: React.ReactNode; ListFooterComponent?: React.ReactNode; data?: unknown[];
    renderItem?: (a: { item: unknown; index: number }) => React.ReactNode; contentContainerStyle?: unknown;
  }) => React.createElement(View, { style: { flex: 1 } },
    React.createElement(View, { style: contentContainerStyle },
      render(ListHeaderComponent),
      React.createElement(View, { style: { flexDirection: 'row', flexWrap: 'wrap' } },
        ...(data ?? []).map((item, index) =>
          React.createElement(React.Fragment, { key: index }, renderItem ? renderItem({ item, index }) : null))),
      render(ListFooterComponent))) };
});

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

const RUN = !!process.env.MOCKUPS;
const gate = RUN ? describe : describe.skip;
gate('person page generator', () => {
  it.each(STATES)('writes %s', async (name, q) => {
    mkdirSync(OUT, { recursive: true });
    mockQuery = { ...q, refetch: jest.fn() };
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<PersonDetailScreen />); });
    const html = toHtml(r.toJSON(), { posters: POSTERS, local: LOCAL_ART });
    writeFileSync(join(OUT, `${name}.html`), html, 'utf8');
    console.log(`WROTE ${name}: ${html.length} bytes`);
    expect(html.length).toBeGreaterThan(1500);
  });
});
