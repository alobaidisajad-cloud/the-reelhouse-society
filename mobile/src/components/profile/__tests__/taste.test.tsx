/**
 * taste.test.tsx — the two panels that used to invent a personality.
 *
 * ── WHAT WAS WRONG ───────────────────────────────────────────────────────────
 * TasteDNA and CinematicInsights each fetched films from TMDB, from the phone,
 * four at a time with a 400ms pause, and stopped at sixty:
 *
 *     const idsToFetch = filmIds.slice(0, 60);   // limit for mobile perf
 *
 * A member with five thousand films got a "cinematic fingerprint" drawn from
 * sixty of them. TasteDNA said nothing about it at all. For a VISITOR reading a
 * non-Auteur profile it was worse: those sixty came from the fifty logs that
 * happened to have loaded, so even the denominator was fiction.
 *
 * The server counts across the whole archive now. These guards hold three
 * things: that the fetching is gone and cannot creep back, that a ranking is
 * never drawn from an archive we have not read, and that a partial answer says
 * so on screen.
 */
import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render } from '@testing-library/react-native';

import { CinematicInsights } from '../CinematicInsights';
import type { TasteProfile } from '@/src/constants/taste';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));

const HERE = join(__dirname, '..');
const read = (f: string) => readFileSync(join(HERE, f), 'utf8');
/** These files DOCUMENT what they deleted; prose must not satisfy its own guard. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const person = (id: number, name: string, count: number) => ({
  id,
  name,
  profile_path: `/${name}.jpg`,
  count,
});

const taste = (over: Partial<TasteProfile> = {}): TasteProfile => ({
  films_total: 100,
  films_known: 100,
  genres: [
    { name: 'Drama', count: 40 },
    { name: 'Horror', count: 25 },
    { name: 'Comedy', count: 10 },
  ],
  actors: [person(1, 'Toshiro', 12), person(2, 'Setsuko', 9)],
  directors: [person(3, 'Kurosawa', 12), person(4, 'Ozu', 8)],
  countries: [{ code: 'JP', count: 60 }],
  total_runtime: 12000,
  ...over,
});

// ════════════════════════════════════════════════════════════════════════════
// THE FETCH IS GONE — and cannot come back by accident
// ════════════════════════════════════════════════════════════════════════════
describe('neither panel builds a portrait from the phone any more', () => {
  const PANELS = ['TasteDNA.tsx', 'CinematicInsights.tsx'] as const;

  it.each(PANELS)('%s does not cap an archive at a fixed number of films', (f) => {
    // The defect itself: `filmIds.slice(0, 60)`.
    //
    // Aimed at the SOURCE list, not at every slice. `genres.slice(0, 6)` is a
    // display cap on a ranking the server already computed over everything —
    // showing six bars instead of forty is a layout decision and always was.
    // Slicing the films the ranking is DERIVED from is the bug, and the two
    // look identical if you only match `slice(0, N)`.
    expect(code(read(f))).not.toMatch(/\b\w*(?:[Ii]ds|[Ff]ilms|[Ll]ogs)\s*\??\.?\s*slice\s*\(/);
  });

  it.each(PANELS)('%s calls nothing on the TMDB client', (f) => {
    // `tmdb.profile(...)` is a pure string builder and is allowed; anything that
    // reaches the network is not. Enumerated rather than listed: every member
    // EXCEPT the four URL builders is a fetch.
    const IMAGE_BUILDERS = /^(poster|backdrop|profile|logo|posterThumb|youtubeThumbnail)$/;
    const calls = [...code(read(f)).matchAll(/\btmdb\.(\w+)\s*\(/g)].map((m) => m[1]);
    expect(calls.filter((c) => !IMAGE_BUILDERS.test(c))).toEqual([]);
  });

  it.each(PANELS)('%s hand-rolls no cache, batch, or retry apparatus', (f) => {
    const src = code(read(f));
    for (const ghost of ['LRUCache', 'GLOBAL_TMDB_CACHE', 'INFLIGHT_TMDB_REQUESTS', 'GENRE_MAP']) {
      expect(src).not.toContain(ghost);
    }
  });

  it.each(PANELS)('%s takes the payload as a prop rather than fetching it', (f) => {
    // Behavioural, not name-based: the component must DESTRUCTURE `taste`. A
    // guard on the word "taste" alone would pass on the import line.
    expect(code(read(f))).toMatch(/\{\s*taste[,\s}]/);
  });

  it('the deleted machinery is gone from the whole module, not just its callers', () => {
    // Both caches were EXPORTED. Deleting the use while leaving the export is
    // how dead code survives a cleanup — and how it gets re-adopted later.
    expect(code(read('CinematicInsights.tsx'))).not.toMatch(/export\s+const\s+(GLOBAL_TMDB_CACHE|INFLIGHT_TMDB_REQUESTS)/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// A RANKING IS NEVER DRAWN FROM AN ARCHIVE WE HAVE NOT READ
// ════════════════════════════════════════════════════════════════════════════
describe('CinematicInsights refuses to guess', () => {
  it('shows the ranking once the archive is read', async () => {
    const { getByText } = render(<CinematicInsights taste={taste()} />);
    expect(getByText('Kurosawa')).toBeTruthy();
    expect(getByText('Toshiro')).toBeTruthy();
  });

  it('says what it is doing instead of ranking 30 films out of 2,000', async () => {
    // The failure this pass exists to remove, reappearing in a new place: on the
    // first day the films table ships, a large archive is mostly unread.
    const { getByText, queryByText } = render(
      <CinematicInsights taste={taste({ films_total: 2000, films_known: 30 })} />,
    );
    expect(getByText('READING YOUR ARCHIVE')).toBeTruthy();
    // Crucially it must NOT have drawn the names it was handed.
    expect(queryByText('Kurosawa')).toBeNull();
  });

  it('reports real progress while reading, not a bare spinner', async () => {
    const { getByText } = render(
      <CinematicInsights taste={taste({ films_total: 2000, films_known: 30 })} />,
    );
    expect(getByText(/30 of .*2,?000 films catalogued/)).toBeTruthy();
  });

  it('tells a member with two films to log more, rather than reading for ever', async () => {
    const { getByText } = render(
      <CinematicInsights taste={taste({ films_total: 2, films_known: 2 })} />,
    );
    expect(getByText(/at least 3 films/i)).toBeTruthy();
  });

  it('renders nothing at all rather than an empty frame when there is no payload', async () => {
    // No payload is a page still loading, or a request that failed — NOT an
    // empty archive. They are different claims and only one is ours to make.
    const { toJSON } = render(<CinematicInsights taste={null} />);
    expect(toJSON()).toBeNull();
  });

  it('a member who has logged nothing is told so, not left under a spinner', async () => {
    // The distinction the line above turns on: here the server ANSWERED, and
    // the answer was zero. That is finished, not slow — so it must not land in
    // "READING YOUR ARCHIVE", which never resolves because there is nothing to
    // read and no request outstanding.
    const { getByText, queryByText } = render(
      <CinematicInsights taste={taste({ films_total: 0, films_known: 0, genres: [], actors: [], directors: [] })} />,
    );
    expect(getByText(/at least 3 films/i)).toBeTruthy();
    expect(queryByText('READING YOUR ARCHIVE')).toBeNull();
  });

  it('divides by what was READ, never by the whole archive', async () => {
    // 40 Drama out of 50 read is 80%. Dividing by films_total (100) would print
    // 40% — an honest-looking number computed from two different denominators,
    // which is precisely the class of bug being removed.
    const { getByText } = render(
      <CinematicInsights taste={taste({ films_total: 50, films_known: 50 })} />,
    );
    expect(getByText('80%')).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// A PARTIAL ANSWER SAYS SO
// ════════════════════════════════════════════════════════════════════════════
describe('the difference between "your taste" and "your taste so far" is visible', () => {
  it('labels a ranking drawn from most, but not all, of the archive', async () => {
    const { getByText } = render(
      <CinematicInsights taste={taste({ films_total: 100, films_known: 95 })} />,
    );
    // Above the floor, so it ranks — and it admits what it ranked.
    //
    // Asserted on the two NUMBERS rather than the sentence. This panel sets the
    // line as a small-caps meta rule ("BASED ON 95 OF 100 FILMS"); TasteDNA sets
    // the same fact as a subtitle ("from 95 of your 100 films"). The rule is
    // shared, the voice belongs to the panel, and pinning the prose here would
    // make a typographic choice unchangeable without a test edit.
    expect(getByText('Kurosawa')).toBeTruthy();
    expect(getByText(/\b95\b.*\b100\b/)).toBeTruthy();
  });

  it('drops the label once everything is read', async () => {
    // "BASED ON 100 OF 100 FILMS" is noise on a finished profile.
    const { queryByText } = render(<CinematicInsights taste={taste()} />);
    expect(queryByText(/BASED ON/i)).toBeNull();
  });
});
