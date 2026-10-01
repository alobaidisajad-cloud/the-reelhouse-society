/**
 * thePersonFileReadsTrue.test.tsx — the artist's file, asked rather than read.
 *
 * personPage.test.ts held these as text out of the source: a sort rebuilt from
 * its own source line with `new Function`, "the file contains `rows.length >
 * 0 &&`", "the screen contains `accessibilityLabel="Go back"` three times".
 * Here they are the functions, the mounted page, and the style values:
 *
 *   · THE CANON: released work, then announced, then undated — newest first;
 *   · the record card prints rows that have something to say, and NOTED only
 *     when the Defining shelf cannot answer the question itself;
 *   · every state of the page — loading, failed, arrived — has one labelled
 *     way back, the same control;
 *   · the loading skeleton has the record card's shape;
 *   · the share sends what the share sheet reads;
 *   · on Android, the portrait sits above its glow and the veil under the way out.
 *
 * Whether it all FITS — every label, line box and touch area, at every width
 * and text size — is measured on the drawn page (zz-person.gen).
 */
import React, { act } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { sortCanon, canonRank } from '@/src/components/person/canon';
import { s as personStyles } from '@/src/components/person/personStyles';
import { PersonHero } from '@/src/components/person/PersonHero';
import { resolveMode } from '@/app/(modals)/social-modal';
import { nav } from '@/src/utils/typedRouter';

import PersonDetailScreen from '../[id]';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));
let mockQuery: Record<string, unknown>;
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: () => mockQuery,
  useQueryClient: () => ({ setQueryData: jest.fn(), getQueryData: jest.fn(), invalidateQueries: jest.fn() }),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: '1032' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/src/utils/typedRouter', () => ({
  nav: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
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
jest.mock('@/src/utils/reelToast', () => {
  const t = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: t };
});
jest.mock('@/src/hooks/useClearance', () => ({ useClearance: () => ({ held: true, standing: 'held', open: jest.fn() }) }));
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
/** The list's own props, as the screen last drew them (its pull-to-refresh lives there). */
let mockListProps: Record<string, any> = {};
jest.mock('@/src/components/layout/CinematicFlashList', () => {
  const mockReact = require('react');
  const List = require('@/mockups/tabs/flashListMock').makeFlashListMock().FlashList;
  return {
    CinematicFlashList: mockReact.forwardRef((props: Record<string, any>, ref: unknown) => {
      mockListProps = props;
      return mockReact.createElement(List, { ...props, ref });
    }),
  };
});
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));

const PERSON = {
  name: 'Wong Kar-wai', profile_path: null, birthday: '1958-07-17', deathday: null,
  place_of_birth: 'Shanghai, China', known_for_department: 'Directing',
  biography: 'A director whose films are made of longing, rain, neon and the minutes that slip away between two people.',
};
const credit = (id: number, title: string, release_date: string | null, extra: Record<string, unknown> = {}) => ({
  id, title, poster_path: `/p${id}.jpg`, backdrop_path: null, release_date,
  vote_average: 7, vote_count: 100, popularity: 10, job: 'Director', jobs: ['Director'], ...extra,
});

type R = ReturnType<typeof render>;
type J = { type: string; props: Record<string, any>; children: (J | string)[] | null };
function nodes(r: R): J[] {
  const out: J[] = [];
  const go = (j: unknown) => {
    if (!j || typeof j !== 'object') return;
    if (Array.isArray(j)) { j.forEach(go); return; }
    out.push(j as J);
    ((j as J).children ?? []).forEach(go);
  };
  go(r.toJSON());
  return out;
}
const textOf = (j: J): string => (j.children ?? []).map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
const words = (r: R) => nodes(r).filter((n) => n.type === 'Text').map(textOf);
/** Does the drawn node carry every property of this style (bar any the screen sets over it)? */
const wears = (n: J, style: object, except: string[] = []) => {
  const on = StyleSheet.flatten(n.props.style) ?? {};
  return Object.entries(StyleSheet.flatten(style) as object).filter(([k]) => !except.includes(k))
    .every(([k, v]) => JSON.stringify((on as Record<string, unknown>)[k]) === JSON.stringify(v));
};

async function screen(q: Record<string, unknown>): Promise<R> {
  mockQuery = { refetch: jest.fn(), isLoading: false, error: null, ...q };
  let r!: R;
  await act(async () => { r = render(<PersonDetailScreen />); });
  return r;
}

beforeEach(() => { jest.clearAllMocks(); });

describe('THE CANON is ordered as a record', () => {
  const today = '2026-08-15';

  it('released, then announced, then undated — never the undated first', () => {
    expect(canonRank({ release_date: '2001-01-01' }, today)).toBe(0);
    expect(canonRank({ release_date: today }, today)).toBe(0);            // out today is out
    expect(canonRank({ release_date: '2027-01-01' }, today)).toBe(1);
    expect(canonRank({}, today)).toBe(2);
    expect(canonRank({ release_date: '' }, today)).toBe(2);
  });

  it('newest first within each, and the more popular first on the same day', () => {
    const order = sortCanon([
      { t: 'undated', release_date: null, popularity: 99 },
      { t: 'announced', release_date: '2030-01-01', popularity: 1 },
      { t: 'old', release_date: '1994-01-01', popularity: 5 },
      { t: 'new', release_date: '2020-01-01', popularity: 5 },
      { t: 'new, less seen', release_date: '2020-01-01', popularity: 1 },
    ], today).map((c) => c.t);
    expect(order).toEqual(['new', 'new, less seen', 'old', 'announced', 'undated']);
  });

  it('and the page draws it in that order', async () => {
    // Three credits, one to each column of the grid, so the drawn order IS the
    // sorted order (left, centre, right). The undated one is the most popular:
    // the old sort floated it to the top of the file.
    const r = await screen({ data: { person: PERSON, allCredits: [
      credit(1, 'Undated Placeholder', null, { popularity: 99, vote_count: 0 }),
      credit(2, 'Announced Picture', '2099-01-01', { vote_count: 0 }),
      credit(3, 'In the Mood for Love', '2000-09-29'),
    ] } });
    const drawn = words(r).filter((w) => ['Undated Placeholder', 'Announced Picture', 'In the Mood for Love'].includes(w));
    const last = (t: string) => drawn.lastIndexOf(t);
    expect(last('In the Mood for Love')).toBeLessThan(last('Announced Picture'));
    expect(last('Announced Picture')).toBeLessThan(last('Undated Placeholder'));
  });
});

describe('the record card says only what it knows', () => {
  const hero = (over: Record<string, unknown>) => (
    <PersonHero
      person={{ name: 'A Name', profile_path: null, birthday: null, deathday: null, place_of_birth: null } as never}
      heroBackdrop={null} photoUri={null} heroDynStyle={{ height: 300 }}
      canonCount={0} craftLabel="FILMS" careerSpan={0}
      definingFilm={null} definingWorksCount={0} isArchivist
      shareLabel="Share to lounge" handleLoungeShare={() => {}}
      showHunt={false} huntTotal={0} seenCount={0} isAuteurMastery={false}
      auteurHuntDynStyle={{ width: '0%' }} formatDossierDate={(d) => d ?? ''}
      {...over}
    />
  );
  const cards = (r: R) => nodes(r).filter((n) => wears(n, personStyles.recordCard)).length;

  it('a file with nothing to record draws no card — not an empty brass frame', async () => {
    let r!: R;
    await act(async () => { r = render(hero({})); });
    expect(cards(r)).toBe(0);
    for (const label of ['BORN', 'DIED', 'RECORD', 'NOTED']) expect(words(r)).not.toContain(label);
  });

  it('and draws one when it has a fact', async () => {
    let r!: R;
    await act(async () => { r = render(hero({ person: { name: 'A Name', birthday: '1958-07-17', place_of_birth: null, deathday: null } })); });
    expect(cards(r)).toBe(1);
    expect(words(r)).toContain('BORN');
  });

  it('NOTED stands in for the Defining shelf only when the shelf is empty', async () => {
    const film = { id: 7, title: 'In the Mood for Love' };
    let empty!: R;
    await act(async () => { empty = render(hero({ definingFilm: film, definingWorksCount: 0 })); });
    expect(words(empty)).toContain('NOTED');
    expect(empty.getByLabelText('Known for In the Mood for Love, open film')).toBeTruthy();
    empty.unmount();
    let shelved!: R;
    await act(async () => { shelved = render(hero({ definingFilm: film, definingWorksCount: 3 })); });
    expect(words(shelved)).not.toContain('NOTED');
  });
});

describe('every state of the page has the same labelled way back', () => {
  it.each([
    ['arrived', { data: { person: PERSON, allCredits: [credit(3, 'In the Mood for Love', '2000-09-29')] } }],
    ['loading', { data: undefined, isLoading: true }],
    ['failed', { data: undefined, error: new Error('offline') }],
  ])('%s', async (_state, q) => {
    const r = await screen(q);
    const back = r.getAllByLabelText('Go back');
    expect(back).toHaveLength(1);
    // The circle a member can see IS the control — not a bare icon inside a View.
    // (`top` is the screen's: the safe-area inset, set over the style.)
    expect(wears(back[0] as unknown as J, personStyles.floatingBack, ['top'])).toBe(true);
  });

  it('and the loading skeleton has the shape of the record card that arrives', async () => {
    const r = await screen({ data: undefined, isLoading: true });
    expect(nodes(r).some((n) => wears(n, personStyles.shimmerRecordCard))).toBe(true);
  });
});

describe('the share sends what the share sheet reads', () => {
  it('to the plain route, with the person, and the sheet reads it as a person', async () => {
    const r = await screen({ data: { person: PERSON, allCredits: [credit(3, 'In the Mood for Love', '2000-09-29')] } });
    await act(async () => { fireEvent.press(r.getByLabelText('Share to lounge')); });
    expect(nav.push).toHaveBeenCalledWith('/social-modal', expect.objectContaining({ personId: '1032', personName: 'Wong Kar-wai' }));
    // '/(modals)/social-modal' would count as a different room in nav's history.
    expect((nav.push as jest.Mock).mock.calls.map((c) => c[0])).not.toContain('/(modals)/social-modal');
    const sent = (nav.push as jest.Mock).mock.calls.find((c) => c[0] === '/social-modal')![1];
    expect(resolveMode(sent)).toEqual({ mode: 'share-person', valid: true });
  });
});

describe('Android paints in elevation order, so each pairing is declared', () => {
  // Style VALUES. Android orders siblings by elevation, not by JSX order.
  const elevation = (x: object) => (StyleSheet.flatten(x) as ViewStyle).elevation ?? 0;

  it('the portrait sits above its own glow', () => {
    // Without this the glow — a wash 10pt larger than the card on every side —
    // painted over the face.
    expect(elevation(personStyles.portraitGlow)).toBeGreaterThan(0);
    expect(elevation(personStyles.portraitCard)).toBeGreaterThan(elevation(personStyles.portraitGlow));
  });

  it('the veil covers the list but never the way out', () => {
    expect(elevation(personStyles.topVeil)).toBeGreaterThan(elevation(personStyles.portraitCard));
    expect(elevation(personStyles.floatingBack)).toBeGreaterThan(elevation(personStyles.topVeil));
  });
});

describe('a file that could not be reached', () => {
  const FILE = { person: PERSON, allCredits: [credit(3, 'In the Mood for Love', '2000-09-29')] };

  it('with nothing to show, says so in the house\'s words, and asks again', async () => {
    const r = await screen({ data: undefined, error: new Error('offline') });
    expect(r.getByText('Transmission Interrupted')).toBeTruthy();
    await act(async () => { fireEvent.press(r.getByLabelText('Try again')); });
    expect(mockQuery.refetch).toHaveBeenCalledTimes(1);
  });

  it('a failed refresh keeps the file on the page — it never replaces it', async () => {
    // A pull with no signal set `error` over a file already drawn, and the page
    // swapped the member's reading for "Signal Disrupted".
    const r = await screen({ data: FILE, error: new Error('offline') });
    expect(words(r)).toContain('Wong Kar-wai');
    expect(r.queryByText('Transmission Interrupted')).toBeNull();
  });

  it('and the pull that reached nothing says so', async () => {
    const r = await screen({ data: FILE, refetch: jest.fn(async () => ({ isError: true })) });
    expect(words(r)).toContain('Wong Kar-wai');
    await act(async () => { await mockListProps.refreshControl.props.onRefresh(); });
    expect(jest.requireMock('@/src/utils/reelToast').default.error)
      .toHaveBeenCalledWith('Could not refresh — check your connection.');
  });
});
