/**
 * routeParams — the one reader of a route's parameters (P4.4).
 *
 * A route's parameters come from a link: one a member tapped, one another app opened, one typed.
 * Each screen read them its own way (taking an array's first value or not, parseInt, a bare cast),
 * so `/log-modal?filmId=abc` began a log of film NaN, a poster path from a link went into a
 * picture's address as it came, and a kind was cast to a FilingKind unchecked. Each screen now
 * names the kind of each value it reads, and is handed it in that kind or not at all: a value of
 * another shape is a value that is not there, and the screen does what it does without it. Each
 * name given but refused is listed too (`refused`), for a screen where a value's absence means
 * something else: an amend whose stack id is bad is never a new stack. The parser only reads;
 * nothing is written because a link was opened.
 *
 * everyRouteReadsThroughTheParser fails on any other read of a route's parameters.
 */
import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { cleanForStorage } from '@/src/utils/sanitizeInput';
import { returnAfterSignIn } from '@/src/components/MembersOnly';

/** A value's kind: the value in it, or undefined for one of another shape. */
export type Kind<T> = (raw: string) => T | undefined;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const P = {
  /** One of the house's rows, by its id (lower case, as the house writes it). */
  uuid: ((raw) => (UUID.test(raw) ? raw.toLowerCase() : undefined)) as Kind<string>,
  /** A film or a person at TMDB, by its number. */
  tmdbId: ((raw) => (/^[1-9][0-9]{0,9}$/.test(raw) ? Number(raw) : undefined)) as Kind<number>,
  /** A year, as a release date's first four figures. */
  year: ((raw) => (/^[0-9]{4}$/.test(raw) ? raw : undefined)) as Kind<string>,
  /** A poster's path at TMDB's image host: `/` then its name. */
  posterPath: ((raw) => (/^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(raw) ? raw : undefined)) as Kind<string>,
  /** One of these words, exactly. */
  oneOf: <T extends string>(...words: readonly T[]): Kind<T> => (raw) => (words as readonly string[]).includes(raw) ? (raw as T) : undefined,
  /**
   * Words carried in a link (a title, a handle, a draft's opening): cleaned as stored words are
   * (no invisible or control characters), at most `max` characters; none left is none.
   */
  words: (max: number): Kind<string> => (raw) => {
    const clean = Array.from(cleanForStorage(raw)).slice(0, max).join('').trim();
    return clean || undefined;
  },
  /** A screen a sign-in may return to (returnAfterSignIn's shapes); any other is none. */
  returnTo: ((raw) => {
    const to = returnAfterSignIn(raw);
    return to === raw ? to : undefined;
  }) as Kind<string>,
} as const;

type Shape = Record<string, Kind<unknown>> & { refused?: never };
export type Parsed<S extends Shape> = { [K in keyof S]: S[K] extends Kind<infer T> ? T | undefined : never }
  & { refused: readonly (keyof S & string)[] };

/**
 * The values a shape names, each in its kind, and the names given a value of another shape: a
 * repeated key is read by its first value; an empty one is not given.
 */
export function readParams<S extends Shape>(raw: Record<string, string | string[] | undefined>, shape: S): Parsed<S> {
  const out: Record<string, unknown> = {};
  const refused: string[] = [];
  for (const [name, kind] of Object.entries(shape)) {
    const given = raw[name];
    const first = Array.isArray(given) ? given[0] : given;
    const value = typeof first === 'string' && first !== '' ? kind(first) : undefined;
    if (value === undefined && typeof first === 'string' && first !== '') refused.push(name);
    out[name] = value;
  }
  return { ...out, refused } as Parsed<S>;
}

/** The route's parameters a shape names, each in its kind or not there (readParams). */
export function useRouteParams<S extends Shape>(shape: S): Parsed<S> {
  const raw = useLocalSearchParams() as Record<string, string | string[] | undefined>;
  const key = Object.keys(shape).map((k) => `${k}=${String(raw[k] ?? '')}`).join('&');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- read again when a named value changes, not the object around it
  return useMemo(() => readParams(raw, shape), [key, shape]);
}
