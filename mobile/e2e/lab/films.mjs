#!/usr/bin/env node
/**
 * films.mjs — the thirty films the speed lab opens in a row as the member (films.sh), filling the
 * query cache to a real member's size, and the judge of the cache's writes on that run (round 13).
 *
 *   node e2e/lab/films.mjs ids            the thirty ids, one a line (films.sh opens each)
 *   node e2e/lab/films.mjs paths          the catalogue paths still to record, for e2e/tmdb/record.mjs
 *   node e2e/lab/films.mjs judge <dir>    <dir>/films.log, the device log of the run: judged
 *
 * The cache is written to the phone at most once a second, when the JS thread is idle
 * (src/lib/queryClient.ts), each sample of a write traced as `[e2e] cache.persist {"chars":…,"ms":…,"beat":…}`. A gate
 * that reads only what the E2E flows happen to write never meets a cache of a member who has opened
 * film after film; this run makes one. The judge fails the run when:
 *   - fewer than FILMS films answered their read (`[e2e] film.data`): the run did not fill the cache;
 *   - the largest write is under MEMBER_SIZE characters: the cache never reached a member's size,
 *     so the times say nothing of it (a film the sealed world holds no recording of answers "not in
 *     the archive", and is no film read: record it, `paths` above);
 *   - any write held the JS thread over CACHE_WRITE_MS, or could not be measured with the phone
 *     itself unstarved (screen-times.mjs's judgeCacheWrites, the same for every run that reads the trace).
 * The films are the sealed world's recorded films (e2e/db/lab-seed.mjs's), those whose whole page
 * is recorded first, then the rest by id.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { recordedFilms } from '../db/lab-seed.mjs';
import { normalizeTmdbPath } from '../supabase/functions/tmdb-proxy/normalize.mjs';
import { CACHE_WRITE_MS, judgeCacheWrites, readCacheWrites } from '../screen-times.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const INDEX = join(HERE, '..', 'supabase', 'functions', 'tmdb-proxy', 'fixtures', 'index.json');

/** How many films the run opens, one after another, as a member does in an evening. */
export const FILMS = 30;
/**
 * The least the largest write must hold to be a member's cache: thirty films kept as their pages
 * draw them are some 10-12 KB each (src/hooks/filmAsDrawn.ts), so 300-360 thousand characters with
 * the Lobby's and the Reel's reads; a cache under 250,000 is one the run did not fill.
 */
export const MEMBER_SIZE = 250_000;

/** The catalogue path a film's page asks for (src/lib/tmdb.ts's detailPath), as the stand-in keys it. */
export const detailPath = (id) =>
  normalizeTmdbPath(`/movie/${id}?append_to_response=credits,videos,recommendations,similar,watch/providers,release_dates`);

/** The thirty films: those whose page the sealed world has recorded first, then the rest by id. */
export function labFilms(index = JSON.parse(readFileSync(INDEX, 'utf8')), films = recordedFilms()) {
  const recorded = (id) => Object.prototype.hasOwnProperty.call(index, detailPath(id));
  const ids = films.map(([id]) => id);
  return [...ids.filter(recorded), ...ids.filter((id) => !recorded(id))].slice(0, FILMS);
}

/** The films of the run whose page is not recorded yet: their paths, for record.mjs. */
export function unrecorded(index = JSON.parse(readFileSync(INDEX, 'utf8')), films = recordedFilms()) {
  return labFilms(index, films).map(detailPath).filter((path) => !Object.prototype.hasOwnProperty.call(index, path));
}

/** The run's device log judged: { lines, failed }. */
export function judge(log, missing = []) {
  const read = new Set();
  for (const line of log.split(/\r?\n/)) {
    const m = /\[e2e\] film\.data (\{[^}\n]*\})/.exec(line);
    if (!m) continue;
    try { read.add(JSON.parse(m[1]).id); } catch { /* not a trace */ }
  }
  const writes = judgeCacheWrites(readCacheWrites(log));
  const { largest, slowest } = writes;
  const lines = [`films read: ${read.size} of ${FILMS}`,
    `the query cache written ${writes.count} times: the largest ${largest} characters, the slowest ${slowest} ms (bound ${CACHE_WRITE_MS} ms)`];
  const failed = [];
  if (read.size < FILMS) failed.push(`only ${read.size} of ${FILMS} films answered their read: the run did not fill the cache`);
  if (largest < MEMBER_SIZE) {
    failed.push(`the largest write held ${largest} characters, under a member's ${MEMBER_SIZE}: the cache never reached the size the bound is for`
      + (missing.length ? `; ${missing.length} of the films have no recording: node e2e/tmdb/record.mjs --from <(node e2e/lab/films.mjs paths)` : ''));
  }
  failed.push(...writes.problems);
  return { lines, failed };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [what, dir] = process.argv.slice(2);
  if (what === 'ids') { process.stdout.write(`${labFilms().join('\n')}\n`); process.exit(0); }
  if (what === 'paths') { process.stdout.write(unrecorded().map((p) => `${p}\n`).join('')); process.exit(0); }
  if (what === 'judge' && dir) {
    const file = join(dir, 'films.log');
    const { lines, failed } = judge(existsSync(file) ? readFileSync(file, 'utf8') : '', unrecorded());
    console.log(lines.join('\n'));
    for (const f of failed) console.log(`✗ ${f}`);
    process.exit(failed.length ? 1 : 0);
  }
  console.error('usage: node e2e/lab/films.mjs ids | paths | judge <dir>');
  process.exit(2);
}
