/**
 * theComposerKeepsItsWord.test.tsx — the page where a record is written, mounted.
 *
 * The app's signature act. Its guards used to be read out of the source —
 * `expect(src.includes('setStatus(s)'))` — which says a name is spelled in a
 * file, not that a member can reach the control, see what is chosen, or be
 * told why the seal will not take. This mounts the real route (log-modal: the
 * flow, the form, the desk, the toolkit, the docked seal) for a member of each
 * rank, a new record and an amended one, and asks the page itself.
 *
 * What a render cannot reach lives in logComposer.test.ts, and says why there.
 * What is a matter of LAYOUT — a chip reaching into its neighbour, a line box
 * at the largest type, the verdict's longest word on the narrowest phone, the
 * seal over the last row — is measured on the drawn page (zz-composer.gen →
 * mockups/tools/layout.cjs and yoga-parity.cjs, every width, every text size).
 */
import React from 'react';
import { render, renderHook, fireEvent, act, within } from '@testing-library/react-native';
import { StyleSheet, InteractionManager } from 'react-native';
import LogAtmosphere from '@/src/components/log/LogAtmosphere';
import { withTiming, ReduceMotion } from 'react-native-reanimated';
import { useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { openSociety } from '@/src/utils/openSociety';
import { validateLogSubmission, useLogFlow } from '@/src/hooks/useLogFlow';
import { writeDraft, readDraft } from '@/src/utils/memberDrafts';
import { buildFilingMark } from '@/src/components/log/logRecord';
import { tmdb } from '@/src/lib/tmdb';

import LogModalScreen from '@/app/(modals)/log-modal';

jest.mock('@/src/utils/openSociety', () => ({
  openSociety: jest.fn(),
  societyHref: jest.requireActual('@/src/utils/openSociety').societyHref,
}));
jest.mock('@/src/lib/tmdb', () => {
  const actual = jest.requireActual('@/src/lib/tmdb');
  return {
    ...actual,
    tmdb: {
      ...actual.tmdb,
      movieImages: jest.fn().mockResolvedValue({ posters: [{ file_path: '/alt.jpg' }], backdrops: [{ file_path: '/still.jpg' }] }),
      movie: jest.fn().mockResolvedValue({}),
    },
  };
});

type Tier = 'free' | 'archivist' | 'auteur';
type R = ReturnType<typeof render>;

const FILM = { filmId: '843', filmTitle: 'In the Mood for Love', filmPoster: '/mood.jpg', filmYear: '2000' };
const LOG = {
  id: 'log-1', filmId: 843, title: 'In the Mood for Love', poster: '/mood.jpg', year: 2000,
  status: 'watched', rating: 4.5, review: 'Rain on the stairs.', isSpoiler: false,
  dropCap: true, pullQuote: '', watchedWith: 'Anna', physicalMedia: 'VHS', watchedDate: '2026-08-16',
  autopsy: { story: 8 },
};

function member(tier: Tier, extra: Record<string, unknown> = {}) {
  useAuthStore.setState({
    user: { id: '33333333-3333-4333-8333-333333333333', username: 'sajjadobaidi', tier, role: 'cinephile', ...extra } as never,
    isAuthenticated: true,
  } as never);
}

async function mount(tier: Tier, params: Record<string, string>, opts: { user?: Record<string, unknown>; store?: Record<string, unknown> } = {}): Promise<R> {
  await act(async () => {
    member(tier, opts.user);
    useFilmStore.setState({ logs: [LOG], lists: [{ id: 'l1', title: 'Rain', films: [] }], _loggedIndex: {}, ...opts.store } as never);
  });
  (useLocalSearchParams as jest.Mock).mockReturnValue(params);
  let r!: R;
  await act(async () => { r = render(<LogModalScreen />); });
  return r;
}

const press = async (node: Parameters<typeof fireEvent.press>[0]) => { await act(async () => { await fireEvent.press(node); }); };
/** The page as drawn: every host element, in tree order. */
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
/** Every accessibility label on the page, in tree order. */
const labels = (r: R) => nodes(r).map((n) => n.props.accessibilityLabel).filter((l): l is string => typeof l === 'string');
/** Every run of words the page draws, one per Text. */
const words = (r: R) => nodes(r).filter((n) => n.type === 'Text')
  .map((n) => (n.children ?? []).filter((c) => typeof c === 'string').join('')).filter(Boolean);
/** The state of the ONE control carrying this name and a state — two would be a finding. */
function stateOf(r: R, label: string | RegExp): Record<string, unknown> {
  const hits = nodes(r).filter((n) => n.props.accessibilityState && typeof n.props.accessibilityLabel === 'string'
    && (typeof label === 'string' ? n.props.accessibilityLabel === label : label.test(n.props.accessibilityLabel)));
  expect(hits).toHaveLength(1);
  return hits[0].props.accessibilityState;
}

beforeEach(() => { (openSociety as jest.Mock).mockClear(); });

describe('every control the composer owns is there, by name', () => {
  // A restructure's one bad outcome is a control quietly disappearing. Asked
  // of the page by the name a screen reader says, for a member who holds every
  // tool and has opened every entry.
  it('an Auteur, every entry open, reaches each one', async () => {
    const r = await mount('auteur', FILM);
    for (const entry of ['THE EDITORIAL DESK', 'THE AUTOPSY', 'THE PHYSICAL ARCHIVE', 'THE VAULT', 'FILED', 'STACKS']) {
      await press(r.getByText(entry));
    }
    for (const name of [
      'Choose an alternate poster', 'watched', 'rewatched', 'abandoned', 'Your rating',
      'Write your film review', 'Contains spoilers',
      'Stylized drop cap', 'Pull quote', 'No header still', 'Header still 1',
      'STORY score 7', 'DVD', 'Film Print', 'Private notes',
      'Watched today', 'Watched yesterday', /Change the date\.$/, 'Watched with companion',
    ]) {
      expect(r.getAllByLabelText(name).length).toBeGreaterThan(0);
    }
    expect(r.getByText('Rain')).toBeTruthy();                       // a stack to add to
    expect(r.getByTestId('submit-log-button')).toBeTruthy();       // the seal
  });

  it('a new record with words in it can be thrown away — and only a new one', async () => {
    const fresh = await mount('free', FILM);
    expect(fresh.queryByLabelText('Discard this draft')).toBeNull();       // nothing to discard yet
    await act(async () => { await fireEvent.changeText(fresh.getByTestId('review-input'), 'A held breath.'); });
    expect(fresh.getByLabelText('Discard this draft')).toBeTruthy();
    fresh.unmount();

    // An amended record has no draft: CLOSE leaves it unsaved. "DISCARD DRAFT"
    // here cleared the member's ONE new-record draft — the review they were
    // writing about some other film — and said it was discarding this one.
    const edit = await mount('auteur', { editLogId: 'log-1' });
    expect(edit.queryByLabelText('Discard this draft')).toBeNull();
    expect(edit.queryByText('DISCARD DRAFT')).toBeNull();
  });

  it('discarding, from an amended record, never touches the new record being written', async () => {
    // The button is gone from an edit (above); this is the hook it called, so
    // the rule holds for anything that calls it next.
    const USER = '33333333-3333-4333-8333-333333333333';
    writeDraft(USER, 'log', { filmId: '550', review: 'Half a review of Fight Club.' });
    await act(async () => { member('auteur'); useFilmStore.setState({ logs: [LOG] } as never); });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ editLogId: 'log-1' });
    const edit = await renderHook(() => useLogFlow());
    await act(async () => { edit.result.current.discardDraft(); });
    expect(readDraft<{ review: string }>(USER, 'log')?.data.review).toBe('Half a review of Fight Club.');
    await edit.unmount();

    // …while a new record's own discard does clear it.
    (useLocalSearchParams as jest.Mock).mockReturnValue(FILM);
    const fresh = await renderHook(() => useLogFlow());
    await act(async () => { fresh.result.current.discardDraft(); });
    expect(readDraft(USER, 'log')).toBeNull();
    await fresh.unmount();
  });

  it('deleting is reached for past the whole record, and asked twice', async () => {
    const r = await mount('auteur', { editLogId: 'log-1' });
    const all = labels(r);
    const del = all.indexOf('Delete this entire log');
    expect(del).toBeGreaterThan(-1);
    // Past every entry of the record — it used to be the FIRST thing on this
    // page when editing. (The seal is docked; it is not in the scroll.)
    for (const entry of [/^Choose an alternate poster/, /^THE AUTOPSY/, /^THE VAULT/, /^FILED/]) {
      const at = all.findIndex((l) => entry.test(l));
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeLessThan(del);
    }
    await press(r.getByLabelText('Delete this entire log'));
    expect(r.getByText('DELETE THIS LOG? THIS CANNOT BE UNDONE.')).toBeTruthy();
    expect(r.getByLabelText('Confirm deletion')).toBeTruthy();
    await press(r.getByLabelText('Keep this log'));
    expect(r.queryByLabelText('Confirm deletion')).toBeNull();
  });
});

describe('what is chosen is said, not only shown', () => {
  it('the status, the reason for walking out, the format, the day and the stack', async () => {
    const r = await mount('auteur', FILM);
    expect(stateOf(r, 'watched').selected).toBe(true);
    await press(r.getByLabelText('rewatched'));
    expect(stateOf(r, 'rewatched').selected).toBe(true);
    expect(stateOf(r, 'watched').selected).toBe(false);

    await press(r.getByLabelText('abandoned'));
    // The reasons appear, each saying whether it is the one.
    const reasons = nodes(r).filter((n) => n.props.accessibilityRole === 'button'
      && typeof n.props.accessibilityState?.selected === 'boolean'
      && !['watched', 'rewatched', 'abandoned', 'Contains spoilers'].includes(n.props.accessibilityLabel));
    expect(reasons.length).toBeGreaterThan(1);
    const first = reasons[0].props.accessibilityLabel as string;
    expect(stateOf(r, first).selected).toBe(false);
    await press(r.getAllByLabelText(first)[0]);
    expect(stateOf(r, first).selected).toBe(true);

    await press(r.getByText('THE PHYSICAL ARCHIVE'));
    expect(stateOf(r, 'None').selected).toBe(true);
    await press(r.getByLabelText('Blu-Ray'));
    expect(stateOf(r, 'Blu-Ray').selected).toBe(true);
    expect(stateOf(r, 'None').selected).toBe(false);

    await press(r.getByText('FILED'));
    expect(stateOf(r, 'Watched today').selected).toBe(true);
    await press(r.getByLabelText('Watched yesterday'));
    expect(stateOf(r, 'Watched yesterday').selected).toBe(true);
    expect(stateOf(r, 'Watched today').selected).toBe(false);

    await press(r.getByText('STACKS'));
    expect(stateOf(r, 'Rain').selected).toBe(false);
    await press(r.getByLabelText('Rain'));
    expect(stateOf(r, 'Rain').selected).toBe(true);
  });
});

describe('the record reads as one document', () => {
  it('a new record opens calm: every entry shut', async () => {
    const r = await mount('auteur', FILM);
    for (const entry of [/^THE AUTOPSY/, /^THE PHYSICAL ARCHIVE/, /^THE VAULT/, /^FILED/]) {
      expect(stateOf(r, entry).expanded).toBe(false);
    }
    expect(r.queryByLabelText('Stylized drop cap')).toBeNull();
  });

  it('an amended record opens every entry that already holds something', async () => {
    // Editing last year's record must never make a member hunt for their own words.
    const r = await mount('auteur', { editLogId: 'log-1' });
    expect(r.getByLabelText('Stylized drop cap').props.accessibilityState.checked).toBe(true);   // the desk: a drop cap
    expect(stateOf(r, /^THE AUTOPSY/).expanded).toBe(true);                                     // a score
    expect(stateOf(r, /^THE PHYSICAL ARCHIVE/).expanded).toBe(true);                            // VHS
    expect(stateOf(r, /^FILED/).expanded).toBe(true);                                           // with Anna
    // …and the one that holds nothing stays shut.
    expect(stateOf(r, /^THE VAULT/).expanded).toBe(false);
  });

  it('the Vault never previews what it holds', async () => {
    // Every other entry shows its value. This is the one a member may not want
    // legible over someone's shoulder: it says only that it is full.
    const r = await mount('auteur', FILM);
    await press(r.getByText('THE VAULT'));
    await act(async () => { await fireEvent.changeText(r.getByLabelText('Private notes'), 'I cried at the corridor'); });
    const entry = r.getByLabelText(/^THE VAULT/);
    expect(entry.props.accessibilityLabel).not.toMatch(/corridor|cried/i);
    expect(entry.props.accessibilityLabel).not.toMatch(/empty/);
    const entryJson = nodes(r).find((n) => n.props.accessibilityLabel === entry.props.accessibilityLabel)!;
    expect(textOf(entryJson)).not.toMatch(/corridor|cried/i);
  });

  it('the header never names the film — the docket does, once', async () => {
    const r = await mount('free', FILM);
    expect(words(r).filter((w) => w === 'In the Mood for Love')).toHaveLength(1);
    expect(words(r).join(' ')).not.toMatch(/Log a Film/i);
    const search = await mount('free', {});
    expect(words(search).join(' ')).not.toMatch(/Log a Film/i);
  });

  it('a previous take is quoted back in the member’s own words, angle brackets and all', async () => {
    const previous = { id: 'log-0', filmId: 843, rating: 4, review: '<p>Watched <The Batman> again</p>', viewCount: 2, watchedDate: '2026-01-02' };
    const r = await mount('auteur', FILM, { store: { _loggedIndex: { 843: previous } } });
    expect(r.getByText('YOUR PREVIOUS TAKE')).toBeTruthy();
    expect(words(r).join(' ')).toContain('Watched <The Batman> again');
    expect(words(r).join(' ')).not.toContain('<p>');
  });
});

describe('a rank you lack is a key and a name, never a no', () => {
  it('each tool says which rank opens it — asked of the registry, not typed in the form', async () => {
    const free = await mount('free', FILM);
    const all = labels(free).join('\n');
    expect(all).toMatch(/The Editorial Desk\. Opens with The Archivist\./);
    expect(all).toMatch(/THE PHYSICAL ARCHIVE\. Opens with THE ARCHIVIST\./);
    expect(all).toMatch(/THE VAULT\. Opens with THE ARCHIVIST\./);
    expect(all).toMatch(/THE AUTOPSY\. Opens with THE AUTEUR\./);
    expect(all).toMatch(/Curatorial Control\. .*Opens with The Auteur\./);
    expect(words(free).join(' ')).not.toMatch(/UNLOCK WITH ARCHIVIST|UPGRADE/);
    free.unmount();

    // An Archivist holds three of them, and the Auteur's two stay keyed.
    const archivist = await mount('archivist', FILM);
    const held = labels(archivist).join('\n');
    expect(held).not.toMatch(/(Editorial Desk|PHYSICAL ARCHIVE|VAULT)\. Opens with/i);
    expect(held).toMatch(/THE AUTOPSY\. Opens with THE AUTEUR\./);
    expect(held).toMatch(/Curatorial Control\. .*Opens with The Auteur\./);
  });

  it('a locked tool is shown, inert and silent, under one rope that says what it guards', async () => {
    const r = await mount('free', FILM);
    await press(r.getByText('THE VAULT'));
    // The instrument is there to be seen…
    const field = r.getByLabelText('Private notes', { includeHiddenElements: true });
    // …but inert to touch and silent to a screen reader: the pair, not one.
    let n = field.parent, inert = false, hidden = false;
    while (n) {
      if (n.props.pointerEvents === 'none') inert = true;
      if (n.props.accessibilityElementsHidden && n.props.importantForAccessibility === 'no-hide-descendants') hidden = true;
      n = n.parent;
    }
    expect(inert).toBe(true);
    expect(hidden).toBe(true);

    const rope = r.getByLabelText(/^The Vault\. Clearance required\./);
    expect(within(rope).getByText('[ CLEARANCE REQUIRED ]')).toBeTruthy();
    expect(within(rope).getByText('✦ ASCEND THE RANKS')).toBeTruthy();
  });

  it('a member whose dues ran out is asked back, not pitched to', async () => {
    const r = await mount('free', FILM, { user: { entitlement_source: 'revenuecat' } });
    await press(r.getByText('THE VAULT'));
    const rope = r.getByLabelText(/^The Vault\. Your dues have lapsed\./);
    expect(within(rope).getByText('[ YOUR DUES HAVE LAPSED ]')).toBeTruthy();
    expect(within(rope).getByText('✦ RESUME YOUR STANDING')).toBeTruthy();
  });

  it('the rope goes to the Society saying what was reached for, and comes back to the words', async () => {
    const fresh = await mount('free', FILM);
    await press(fresh.getByText('THE VAULT'));
    await press(fresh.getByLabelText(/^The Vault\. Clearance required\./));
    const href = new URL((openSociety as jest.Mock).mock.calls[0][0], 'https://x');
    expect(href.pathname).toBe('/membership');
    expect(href.searchParams.get('reason')).toBe('the-vault');
    // A new record keeps a draft, so the form is the way back…
    expect(href.searchParams.get('returnTo')).toBe('/log-modal');
    fresh.unmount();

    // …an amended one keeps none, so its way back is the record itself. (The
    // shelf's rope, not the Vault's: on an amended record the Vault first asks
    // the server for the note, and there is no server here — it says so.)
    (openSociety as jest.Mock).mockClear();
    const edit = await mount('free', { editLogId: 'log-1' });
    // Already open: the record holds a VHS, and an entry holding something opens itself.
    await press(edit.getByLabelText(/^The Physical Archive\. Clearance required\./));
    const back = new URL((openSociety as jest.Mock).mock.calls[0][0], 'https://x');
    expect(back.searchParams.get('reason')).toBe('physical-archive');
    expect(back.searchParams.get('returnTo')).toBe('/log/log-1');
  });
});

describe('the verdict, and the seal that cannot disagree with the save', () => {
  it('unrated: the hint for half reels is there, and the score is not', async () => {
    const r = await mount('free', FILM);
    expect(r.getByText('TAP LEFT HALF FOR ½ REELS')).toBeTruthy();
    expect(r.getByText('awaiting your verdict')).toBeTruthy();
    expect(words(r).join(' ')).not.toMatch(/\/ 5/);
  });

  it('rated: the word, and the score printed once — the hint is gone', async () => {
    const r = await mount('auteur', { editLogId: 'log-1' });
    expect(r.getByText('Masterpiece')).toBeTruthy();
    // A score ends "/ 5"; the review's counter ("19/5000") is not one.
    expect(words(r).filter((w) => /\/ ?5$/.test(w))).toEqual(['4.5 / 5']);
    expect(r.queryByText('TAP LEFT HALF FOR ½ REELS')).toBeNull();
  });

  it.each([
    ['watched, nothing yet', 'watched', 0, ''],
    ['watched, words only', 'watched', 0, 'A held breath.'],
  ])('%s: the seal says exactly what the validator says', async (_what, _status, _rating, review) => {
    const r = await mount('free', FILM);
    if (review) await act(async () => { await fireEvent.changeText(r.getByTestId('review-input'), review); });
    const reason = validateLogSubmission('watched', 0, review, '');
    const label = r.getByTestId('submit-log-button').props.accessibilityLabel as string;
    // The reason travels in the LABEL: accessibilityLiveRegion is Android-only,
    // and a dim button that reads "Seal the record" and does nothing is a dead
    // end without sight.
    expect(label).toBe(reason ? `SEAL THE RECORD. ${reason}` : 'SEAL THE RECORD');
  });

  it('once sealable, the line is the finished record’s own filing mark', async () => {
    const r = await mount('auteur', { editLogId: 'log-1' });
    const mark = buildFilingMark({ watched_date: LOG.watchedDate, watched_with: LOG.watchedWith, physical_media: LOG.physicalMedia });
    const line = words(r).find((w) => w.startsWith('FILED · '));
    expect(line).toBeDefined();
    for (const entry of mark) expect(line).toContain(entry.value);
  });
});

describe('the film behind the record', () => {
  it('is the docket’s own picture — one download, one decode', async () => {
    jest.useFakeTimers();
    try {
      const r = await mount('free', FILM);
      await act(async () => { jest.advanceTimersByTime(500); });
      const uris = nodes(r).filter((n) => n.props.source?.uri)
        .map((n) => n.props.source.uri as string)
        .filter((u) => u.includes('/mood.jpg'));
      // The docket and the atmosphere, and nothing larger.
      expect(uris.length).toBeGreaterThanOrEqual(2);
      expect(new Set(uris)).toEqual(new Set([tmdb.poster('/mood.jpg', 'w342')]));
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('the film arrives after the entrance, and cannot be starved', () => {
  // A decode must never compete with the sheet sliding up, so the film waits
  // for the interactions to settle — and the one element carrying the
  // atmosphere must not hang on a promise that can be starved.
  const film = (r: R) => nodes(r).some((n) => n.props.source?.uri === tmdb.poster('/mood.jpg', 'w342'));

  it('with the interactions never settling, it still arrives', async () => {
    jest.useFakeTimers();
    const cancel = jest.fn();
    const spy = jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(() => ({ cancel }) as never);
    try {
      const r = await act(async () => render(<LogAtmosphere posterPath="/mood.jpg" />));
      expect(film(r)).toBe(false);                             // not during the entrance
      await act(async () => { jest.advanceTimersByTime(449); });
      expect(film(r)).toBe(false);
      await act(async () => { jest.advanceTimersByTime(1); });
      expect(film(r)).toBe(true);                              // the backstop
    } finally {
      spy.mockRestore();
      jest.useRealTimers();
    }
  });

  it('and leaving first cancels both the wait and the backstop', async () => {
    jest.useFakeTimers();
    const cancel = jest.fn();
    const spy = jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(() => ({ cancel }) as never);
    try {
      const set = jest.spyOn(global, 'setTimeout');
      const clear = jest.spyOn(global, 'clearTimeout');
      const r = await act(async () => render(<LogAtmosphere posterPath="/mood.jpg" />));
      const at = set.mock.calls.findIndex((c) => c[1] === 450);
      expect(at).toBeGreaterThan(-1);                          // the backstop, waiting
      const backstop = set.mock.results[at].value;
      await act(async () => { r.unmount(); });
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(clear).toHaveBeenCalledWith(backstop);            // …and gone with the screen
      set.mockRestore();
      clear.mockRestore();
    } finally {
      spy.mockRestore();
      jest.useRealTimers();
    }
  });
});

describe('a member who asked for less motion gets less', () => {
  it('the film’s fade and the verdict’s ignition both defer to the system setting', async () => {
    (withTiming as jest.Mock).mockClear();
    jest.useFakeTimers();
    try {
      const r = await mount('auteur', { editLogId: 'log-1' });            // a verdict word is lit
      await act(async () => { jest.advanceTimersByTime(500); });        // the film arrives
      expect(r.getByText('Masterpiece')).toBeTruthy();
      const asks = (withTiming as jest.Mock).mock.calls.filter(([to]) => to === 1);
      expect(asks.length).toBeGreaterThanOrEqual(2);
      for (const [, config] of asks) expect(config).toEqual(expect.objectContaining({ reduceMotion: ReduceMotion.System }));
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('the page speaks in one type scale', () => {
  // BADGE · LABEL · ASIDE · PROSE · TITLE · HERO. It had FOURTEEN sizes, all at
  // one volume — the largest single reason the page read as cramped. Read off
  // the page as it renders, every entry open, for each kind of member.
  const SCALE = [9, 10, 11, 14, 17, 28];

  // Not counted: the autopsy's gauge, shown in the composer "exactly as a reader
  // will see it" — the finished record's own component, at the record's sizes
  // (its 16pt scores). It is a preview of another page, and it is that page's
  // to change. Recognised by its header, which only the gauge carries.
  // Its header holds exactly these words and no others; any wider match is an
  // ancestor, and an ancestor is the whole page.
  const isGauge = (n: J) => (n.children ?? []).some((c) => typeof c !== 'string'
    && textOf(c) === '✦THE AUTOPSYConfidential');

  it('every word the composer draws is set at one of six sizes', async () => {
    const sizes = new Set<number>();
    const counted: string[] = [];
    let previews = 0;
    const walk = (n: unknown) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      const j = n as J;
      if (isGauge(j)) { previews++; return; }
      if (j.type === 'Text' || j.type === 'TextInput') {
        const size = StyleSheet.flatten(j.props.style)?.fontSize;
        if (typeof size === 'number') { sizes.add(size); counted.push(textOf(j)); }
      }
      (j.children ?? []).forEach(walk);
    };
    const take = (r: R) => walk(r.toJSON());
    for (const [tier, params] of [['auteur', FILM], ['free', FILM], ['auteur', { editLogId: 'log-1' }]] as const) {
      const r = await mount(tier, params);
      // An amended record opens what it holds by itself; pressing would shut it.
      if (!('editLogId' in params)) {
        for (const entry of ['THE EDITORIAL DESK', 'THE AUTOPSY', 'THE PHYSICAL ARCHIVE', 'THE VAULT', 'FILED', 'STACKS']) {
          await press(r.getAllByText(entry)[0]);
        }
      }
      take(r);
      await press(r.getByLabelText('abandoned'));
      take(r);
      r.unmount();
    }
    take(await mount('free', {}));   // the first frame: finding the film
    // A record carrying an alternate poster: its corner badge is the 9.
    take(await mount('auteur', { editLogId: 'log-1' }, { store: { logs: [{ ...LOG, altPoster: '/alt.jpg' }] } }));
    expect([...sizes].sort((a, b) => a - b)).toEqual(SCALE);
    // The exclusion found the gauge — it did not quietly skip nothing — and
    // the page around it was still read: the badges only an amended record
    // carries are among the words counted.
    expect(previews).toBeGreaterThan(0);
    expect(counted).toEqual(expect.arrayContaining(['EDITING', 'ALT', 'RESEAL THE RECORD']));
  }, 15000);   // five whole pages and every section opened: ~2.5 s alone, past 5 s under a full run
});

describe('the docket is a hero, not a thumbnail', () => {
  it('the poster and the sheet you write on are sized for what they hold', async () => {
    const r = await mount('free', FILM);
    // The docket's poster: of the two pictures of the film, the one laid out in
    // the flow (the other is the atmosphere, absolute, behind everything).
    const posters = nodes(r).filter((n) => n.props.source?.uri?.includes('/mood.jpg'))
      .map((n) => StyleSheet.flatten(n.props.style)).filter((s) => s.position !== 'absolute');
    expect(posters).toHaveLength(1);
    const ps = posters[0];
    expect(ps.width).toBeGreaterThanOrEqual(120);
    expect(ps.height).toBeGreaterThanOrEqual(180);
    // 130 showed about six lines between an autopsy and a date picker, in a critique app.
    expect(StyleSheet.flatten(r.getByTestId('review-input').props.style).minHeight).toBeGreaterThanOrEqual(170);
  });
});
