/**
 * A GENERATOR, not a test. Mounts the log composer — the route a member opens
 * to write a record, header, document and docked seal — and converts it to
 * HTML, so the layout audits measure it at every width and text size: every
 * chip against its neighbour, every line box at the largest type, the seal
 * against the last row, the verdict's longest word on the narrowest phone.
 * (logComposer.test.ts once checked each of those by reading the stylesheet.)
 *
 * Run: MOCKUPS=1 npx jest zz-composer.gen  (see mockups/README.md)
 */
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { toHtml } from '@/src/components/profile/__tests__/zz-render.lib';
import { whenRendering, writeScreen } from '@/mockups/paths';
import { POSTERS, POSTER_PATHS, LOCAL_ART } from '@/src/components/profile/__tests__/zz-art.gen';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { useVaultStore } from '@/src/stores/vaultStore';
import { useSocialStore } from '@/src/stores/followStore';

import LogModalScreen from '@/app/(modals)/log-modal';
import { View } from 'react-native';
import LogVerdict from '@/src/components/log/LogVerdict';
import { st } from '@/src/components/log/LogModalStyles';
import { RATING_LABELS } from '@/src/hooks/useLogFlow';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ ...require('@/mockups/paths').PHONE, scale: 3, fontScale: require('@/mockups/paths').textSize.scale }),
}));
jest.mock('@/src/utils/openSociety', () => ({
  openSociety: jest.fn(),
  societyHref: jest.requireActual('@/src/utils/openSociety').societyHref,
}));
// The real address shapes, so the renderer finds each picture's art by its path.
jest.mock('@/src/lib/tmdb', () => {
  const actual = jest.requireActual('@/src/lib/tmdb');
  return {
    ...actual,
    tmdb: {
      ...actual.tmdb,
      poster: (p: string, size = 'w342') => `https://image.tmdb.org/t/p/${size}${p}`,
      backdrop: (p: string, size = 'w1280') => `https://image.tmdb.org/t/p/${size}${p}`,
      // Real art, so the alternate posters and the header stills are DRAWN —
      // an empty answer left both strips, and every control in them, unmeasured.
      movieImages: jest.fn().mockResolvedValue({
        posters: require('@/src/components/profile/__tests__/zz-art.gen').POSTER_PATHS.slice(0, 5).map((file_path: string) => ({ file_path })),
        backdrops: require('@/src/components/profile/__tests__/zz-art.gen').POSTER_PATHS.slice(5, 9).map((file_path: string) => ({ file_path })),
      }),
      movie: jest.fn().mockResolvedValue({}),
      search: jest.fn().mockResolvedValue({
        results: require('@/src/components/profile/__tests__/zz-art.gen').POSTER_PATHS.slice(0, 4).map((poster_path: string, i: number) => ({
          id: 900 + i, title: require('@/src/components/profile/__tests__/zz-art.gen').POSTER_TITLES[i], poster_path, release_date: `${1994 + i * 3}-01-01`, media_type: 'movie',
        })),
        searchType: 'exact', matchedContext: '',
      }),
    },
  };
});

const FILM = { filmId: '843', filmTitle: 'In the Mood for Love', filmPoster: POSTER_PATHS[1], filmYear: '2000' };
const REVIEW = 'Every corridor is a held breath. The film is the space between two people who have decided not to touch, and it never once lets you forget the rain on the stairs.';

type Tier = 'free' | 'archivist' | 'auteur' | 'out' | 'lapsed';
const member = (tier: Tier) => useAuthStore.setState(tier === 'out'
  ? { user: null, isAuthenticated: false } as never
  : {
    user: {
      id: '33333333-3333-4333-8333-333333333333', username: 'sajjadobaidi', role: 'cinephile',
      // A rank once granted and since ended: what the house calls lapsed.
      ...(tier === 'lapsed' ? { tier: 'free', entitlement_source: 'revenuecat' } : { tier }),
    } as never,
    isAuthenticated: true,
  } as never);

/** A record to amend, and two stacks to add the film to. */
const LOG = {
  id: 'log-1', filmId: 843, title: FILM.filmTitle, poster: FILM.filmPoster, year: 2000,
  status: 'watched', rating: 4.5, review: REVIEW, isSpoiler: false, dropCap: false, pullQuote: '',
  watchedWith: 'Anna', physicalMedia: 'VHS', watchedDate: '2026-08-16', viewingId: 'v-1',
};
const LISTS = [
  { id: 'l1', title: 'Rain on the Stairs', films: [] },
  { id: 'l2', title: '80s', films: [] },
];
/** Let the component's own timers and promises run (the search waits 400ms). */
const settle = (ms = 0) => act(async () => { await new Promise((res) => setTimeout(res, ms)); });

/** Each state: who is writing, what the route was opened with, and what they did. */
const STATES: [string, Tier, Record<string, string>, (r: ReturnType<typeof render>) => Promise<void>][] = [
  // The first frame: finding the film — and what the search finds.
  ['composer-search', 'free', {}, async () => {}],
  ['composer-results', 'free', {}, async (r) => {
    await fireEvent.changeText(r.getByLabelText('Search for a film to log'), 'mood');
    await settle(500);
  }],
  // Signed out: the whole page is the way in.
  ['composer-signedout', 'out', FILM, async () => {}],
  // A new record, as it opens — calm, every entry closed.
  ['composer', 'free', FILM, async () => {}],
  // An Auteur with every instrument open and a full manuscript.
  ['composer-open', 'auteur', FILM, async (r) => {
    await fireEvent.changeText(r.getByTestId('review-input'), REVIEW);
    for (const entry of ['THE EDITORIAL DESK', 'THE AUTOPSY', 'THE PHYSICAL ARCHIVE', 'THE VAULT', 'FILED', 'STACKS']) {
      const hit = r.queryAllByText(entry)[0];
      if (hit) await fireEvent.press(hit);
    }
  }],
  // Curatorial Control open: the alternate posters under the docket.
  ['composer-posters', 'auteur', FILM, async (r) => {
    await settle();
    await fireEvent.press(r.getByLabelText('Choose an alternate poster'));
  }],
  // Naming a companion: the members you follow, offered as you type "@".
  ['composer-companion', 'auteur', FILM, async (r) => {
    await fireEvent.press(r.getAllByText('FILED')[0]);
    await fireEvent.changeText(r.getByLabelText('Watched with companion'), 'with @m');
  }],
  // The day it was watched, and the calendar that changes it.
  ['composer-calendar', 'auteur', FILM, async (r) => {
    await fireEvent.press(r.getAllByText('FILED')[0]);
    await fireEvent.press(r.getByLabelText(/Change the date\.$/));
  }],
  // Amending a record: everything it holds, open — and asked to delete it.
  ['composer-edit', 'auteur', { editLogId: 'log-1' }, async () => {}],
  ['composer-delete', 'auteur', { editLogId: 'log-1' }, async (r) => {
    await fireEvent.press(r.getByLabelText('Delete this entire log'));
  }],
  // A member whose rank ended, over a note they wrote: read in full, theirs to
  // remove, not to change.
  // (It opens itself: an entry that holds something opens when it arrives.)
  ['composer-kept', 'lapsed', { editLogId: 'log-1' }, async () => {}],
  // A Cinephile who opened the tools they do not hold: instruments and gates.
  ['composer-locked', 'free', FILM, async (r) => {
    for (const entry of ['THE EDITORIAL DESK', 'THE PHYSICAL ARCHIVE', 'THE VAULT']) await fireEvent.press(r.getByText(entry));
  }],
  // Walking out: the status row, and the reasons that wrap.
  ['composer-abandoned', 'archivist', FILM, async (r) => {
    await fireEvent.press(r.getByText(/abandoned/i));
  }],
];

/**
 * Every word the verdict can say, each in the slot the page gives it — the
 * record's content column, its sheet, its section — so the audits measure the
 * longest ("Masterpiece", "Unwatchable", "Really Good") at every width and
 * text size, shrunk as the phone shrinks it. (logComposer.test.ts once checked
 * this with a width-per-letter constant for the display face.)
 */
whenRendering('composer generator', () => {
  it('writes composer-verdicts', async () => {
    const words = [...new Set(Object.values(RATING_LABELS))];
    const ratingFor = (w: string) => Number(Object.entries(RATING_LABELS).find(([, v]) => v === w)![0]);
    // `before` is a first render showing some OTHER word in every slot.
    const page = (before: boolean) => (
      <View style={st.formContent}>
        <View style={st.sheet}>
          {words.map((w) => <View key={w} style={st.sec}><LogVerdict status={before ? 'abandoned' : 'watched'} rating={ratingFor(w)} /></View>)}
          <View style={st.sec}><LogVerdict status={before ? 'watched' : 'abandoned'} rating={before ? 5 : 0} /></View>
          <View style={st.sec}><LogVerdict status="watched" rating={0} /></View>
        </View>
      </View>
    );
    let r!: ReturnType<typeof render>;
    // A word ignites from opacity 0 when it first appears. Drawn at that first
    // frame it is invisible, and the audits skip what cannot be seen. So every
    // slot first shows another word, then the one under test — which is drawn
    // lit, as a member sees it once their tap has landed.
    await act(async () => { r = render(page(true)); });
    await act(async () => { r.rerender(page(false)); });
    const html = toHtml(r.toJSON(), {});
    writeScreen('composer-verdicts', html);
    expect(words.length).toBeGreaterThanOrEqual(5);
    for (const w of [...words, 'Abandoned', 'awaiting your verdict']) expect(html).toContain(w);
    expect(html).not.toMatch(/opacity:\s*0[;"]/);
  });

  it.each(STATES)('writes %s', async (name, tier, params, act_) => {
    member(tier);
    useFilmStore.setState({ logs: [LOG], lists: LISTS, _loggedIndex: {} } as never);
    useSocialStore.setState({ following: ['morpho', 'mara', 'vesper', 'halloway'] } as never);
    // The record's note, already fetched from the Vault — the fetch itself is
    // the server's, and this is a drawing.
    useVaultStore.setState({
      notes: { 'v-1': 'The corridor again. I could not look at the stairs.' },
      loaded: { 'log-1': true }, unreachable: {},
      loadForLog: async () => {},
    } as never);
    (useLocalSearchParams as jest.Mock).mockReturnValue(params);
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<LogModalScreen />); });
    // Each press lands on its own (fireEvent acts for itself), so a step can
    // find what the one before it opened; one act around them all held every
    // update back until the end, and the calendar could never be reached.
    await act_(r);
    await settle();
    const html = toHtml(r.toJSON(), { posters: POSTERS, local: LOCAL_ART });
    writeScreen(name, html);
    console.log(`WROTE ${name}: ${html.length} bytes`);
    // Something was drawn, and it has a control to measure — the signed-out
    // page is one sentence and one way in, so size alone says nothing.
    expect(html.length).toBeGreaterThan(1500);
    expect(html).toContain('data-press=');
  });
});
