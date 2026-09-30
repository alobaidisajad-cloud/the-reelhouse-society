/**
 * wallRead — what the Lobby wall asks for, each read in one place.
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WALL is one call, `get_lobby`: today's edition, chosen by the house once a
 * day (20260930_03), read as the member reads it — so a private author's piece,
 * a blocked member's and a withheld filing never arrive, and a piece that has
 * gone since the edition was chosen gives its place to the next. It carries no
 * counts: the Lobby names the honoured; the Dispatch and each page count them.
 *
 * THE PROGRAMME is the catalogue's: this week's most-watched film, set as a
 * one-sheet, and four more on the bill beside it.
 *
 * Every read THROWS when it could not be answered: an empty answer and a failed
 * one are not the same page (EmptyStates, "a failed read is never empty").
 * Everything is kept on the phone (the app's persisted query cache), so a
 * member with no signal sees the last wall they saw.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { tmdb, type TMDBArt, type TMDBMovieDetail } from '@/src/lib/tmdb';
import type { TMDBFilm } from '@/src/components/home/types';

export const WALL_KEY = ['lobby', 'wall'] as const;
// New names, never the old Lobby's: the phone keeps every read across launches, and the old
// ['lobby', 'trending'] held a plain list of films — read as this shape, it would break the wall.
export const PROGRAMME_KEY = ['lobby', 'programme'] as const;
export const featureKey = (filmId: number) => ['lobby', 'feature', filmId] as const;
/** The reads a pull always asks again: the house's own page. The programme only when out of date. */
export const LIVE_LOBBY_READS: readonly string[] = [WALL_KEY[1]];

export interface WallAuthor {
  id: string;
  username: string;
  avatar_url: string | null;
  role: string | null;
  tier: string | null;
  is_founding: boolean | null;
}
export interface WallLog {
  id: string;
  words: string;
  rating: number | null;
  film: { id: number; title: string; poster_path: string | null };
  author: WallAuthor;
}
export interface WallStack {
  id: string;
  title: string;
  description: string | null;
  films: number;
  posters: { film_id: number; title: string; poster_path: string | null }[];
  author: WallAuthor;
}
export interface WallFiling {
  id: string;
  kind: string;
  title: string | null;
  text: string;
  words: number;
  author: WallAuthor;
}
export interface Wall {
  /** The edition's day (UTC), or null before the house has chosen one. */
  edition: string | null;
  log: WallLog | null;
  stack: WallStack | null;
  filings: WallFiling[];
}

// ── Reading the answer defensively: a malformed piece is left off, never drawn half ──
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function authorOf(v: unknown): WallAuthor | null {
  if (!isObj(v)) return null;
  const id = str(v.id), username = str(v.username);
  if (!id || !username) return null;
  return {
    id, username,
    avatar_url: str(v.avatar_url), role: str(v.role), tier: str(v.tier),
    is_founding: typeof v.is_founding === 'boolean' ? v.is_founding : null,
  };
}

function logOf(v: unknown): WallLog | null {
  if (!isObj(v) || !isObj(v.film)) return null;
  const id = str(v.id), words = str(v.words), author = authorOf(v.author);
  const filmId = num(v.film.id), filmTitle = str(v.film.title);
  if (!id || !words?.trim() || !author || filmId === null || !filmTitle) return null;
  return { id, words, rating: num(v.rating), film: { id: filmId, title: filmTitle, poster_path: str(v.film.poster_path) }, author };
}

function stackOf(v: unknown): WallStack | null {
  if (!isObj(v)) return null;
  const id = str(v.id), title = str(v.title), author = authorOf(v.author), films = num(v.films);
  if (!id || !title || !author || films === null) return null;
  const posters = Array.isArray(v.posters)
    ? v.posters.flatMap((p) => {
        if (!isObj(p)) return [];
        const filmId = num(p.film_id);
        return filmId === null ? [] : [{ film_id: filmId, title: str(p.title) ?? '', poster_path: str(p.poster_path) }];
      })
    : [];
  return { id, title, description: str(v.description), films, posters, author };
}

function filingOf(v: unknown): WallFiling | null {
  if (!isObj(v)) return null;
  const id = str(v.id), kind = str(v.kind), author = authorOf(v.author);
  if (!id || !kind || !author) return null;
  return { id, kind, title: str(v.title), text: str(v.text) ?? '', words: num(v.words) ?? 0, author };
}

/** The wall as the house answered it, every piece checked; what is malformed is left off. */
export function parseWall(raw: unknown): Wall {
  if (!isObj(raw)) return { edition: null, log: null, stack: null, filings: [] };
  return {
    edition: str(raw.edition),
    log: logOf(raw.log),
    stack: stackOf(raw.stack),
    filings: Array.isArray(raw.filings) ? raw.filings.map(filingOf).filter((f): f is WallFiling => f !== null).slice(0, 3) : [],
  };
}

export async function readWall(): Promise<Wall> {
  const { data, error } = await supabase.rpc('get_lobby');
  if (error) throw error;
  return parseWall(data);
}

/** `enabled`: a member's Lobby only — the front door shows none of it. */
export function useLobbyWall(enabled: boolean) {
  return useQuery({ queryKey: WALL_KEY, queryFn: readWall, staleTime: 5 * 60 * 1000, enabled });
}

// ── THE PROGRAMME ───────────────────────────────────────────────────────────
export interface Programme {
  feature: TMDBFilm | null;
  bill: TMDBFilm[];
}

export async function readProgramme(): Promise<Programme> {
  const res = await tmdb.trending('week');
  const films = ((res?.results ?? []) as TMDBFilm[]).filter((f) => typeof f.id === 'number');
  return { feature: films[0] ?? null, bill: films.slice(1, 5) };
}

export function useProgramme(enabled: boolean) {
  return useQuery({ queryKey: PROGRAMME_KEY, queryFn: readProgramme, staleTime: 10 * 60 * 1000, enabled });
}

/** The one-sheet's art, and whether it carries printed words of its own. */
export interface SheetArt {
  path: string | null;
  /** true: the film's own poster, whose title is printed on it — the house lays no words over it */
  titled: boolean;
}

/**
 * The art, in order: the best-rated poster with no words on it; else a still
 * (a backdrop is wordless by nature, and TMDB files its wordless ones the same
 * way); else the film's own poster, titled; else none.
 */
export function pickArt(art: { posters: TMDBArt[]; backdrops: TMDBArt[] } | null, poster: string | null | undefined): SheetArt {
  const best = (list: TMDBArt[] | undefined) => [...(list ?? [])]
    .filter((a) => a && typeof a.file_path === 'string' && (a.iso_639_1 === null || a.iso_639_1 === undefined))
    .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0) || (b.width ?? 0) - (a.width ?? 0))[0];
  const wordless = best(art?.posters) ?? best(art?.backdrops);
  if (wordless) return { path: wordless.file_path, titled: false };
  if (poster) return { path: poster, titled: true };
  return { path: null, titled: false };
}

export interface FeatureSheet {
  id: number;
  title: string;
  year: string | null;
  runtime: number | null;
  director: string | null;
  art: SheetArt;
}

/** The director(s), as the credits name them; none when the catalogue names none. */
export function directorOf(detail: TMDBMovieDetail | null | undefined): string | null {
  const names = (detail?.credits?.crew ?? []).filter((c) => c.job === 'Director').map((c) => c.name).filter(Boolean);
  return names.length ? names.slice(0, 2).join(' & ') : null;
}

/**
 * The one-sheet for this week's film: its detail (the same read the film page
 * makes, so a tap opens the page already filled) and its wordless art. The
 * sheet stands on what the programme already knows while these arrive, and on
 * that alone if they cannot be reached.
 */
export async function readFeature(film: TMDBFilm): Promise<FeatureSheet> {
  const [detail, art] = await Promise.all([
    tmdb.detail(film.id).catch(() => null),
    tmdb.keyArt(film.id).catch(() => null),
  ]);
  const release = detail?.release_date || film.release_date || '';
  return {
    id: film.id,
    title: detail?.title || film.title || film.name || '',
    year: /^\d{4}/.test(release) ? release.slice(0, 4) : null,
    runtime: typeof detail?.runtime === 'number' && detail.runtime > 0 ? detail.runtime : null,
    director: directorOf(detail),
    art: pickArt(art, detail?.poster_path ?? film.poster_path),
  };
}

export function useFeature(film: TMDBFilm | null) {
  return useQuery({
    queryKey: featureKey(film?.id ?? 0),
    queryFn: () => readFeature(film as TMDBFilm),
    enabled: !!film,
    staleTime: 24 * 60 * 60 * 1000,
  });
}
