#!/usr/bin/env node
/**
 * record.mjs — record TMDB answers for the E2E stand-in.
 *
 *   node e2e/tmdb/record.mjs "/search/multi?query=The%20Godfather&page=1&include_adult=false" …
 *   node e2e/tmdb/record.mjs --from misses.txt   (a path a line, as the run lists them)
 *
 * Each path is fetched ONCE from the production tmdb-proxy — the same request
 * the app makes, with the anon key the app ships — and saved under
 * e2e/supabase/functions/tmdb-proxy/fixtures/, with fixtures/index.json
 * mapping each normalised path to its file. Read-only: it only asks the proxy
 * questions the apps already ask it.
 *
 * Re-recording a path overwrites it. A path the proxy refuses (403) is not
 * saved: the app would be refused too, and the E2E world must not answer what
 * production would not.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureName, normalizeTmdbPath } from '../supabase/functions/tmdb-proxy/normalize.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, '..', 'supabase', 'functions', 'tmdb-proxy', 'fixtures');
const INDEX = join(DIR, 'index.json');

const eas = JSON.parse(readFileSync(join(HERE, '..', '..', 'eas.json'), 'utf8'));
const { EXPO_PUBLIC_SUPABASE_URL: URL_, EXPO_PUBLIC_SUPABASE_ANON_KEY: KEY } = eas.build.production.env;

const args = process.argv.slice(2);
const paths = args[0] === '--from'
  ? readFileSync(args[1], 'utf8').split(/\r?\n/).map((l) => l.replace(/^.*E2E-TMDB-MISS\s+/, '').trim()).filter(Boolean)
  : args;
if (!paths.length) {
  console.error('Give paths to record, or --from <file>.');
  process.exit(2);
}

mkdirSync(DIR, { recursive: true });
const index = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')) : {};
let saved = 0;
for (const raw of [...new Set(paths)]) {
  const path = normalizeTmdbPath(raw);
  if (!path) { console.log(`skip   not a path: ${raw}`); continue; }
  const res = await fetch(`${URL_}/functions/v1/tmdb-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ path }),
  });
  if (res.status === 403) { console.log(`refused by the proxy, not saved: ${path}`); continue; }
  const body = await res.json();
  const file = fixtureName(path);
  writeFileSync(join(DIR, file), JSON.stringify({ path, status: res.status, body }, null, 1) + '\n');
  index[path] = file;
  saved++;
  console.log(`saved  ${res.status}  ${path}`);
}
const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => (a < b ? -1 : 1)));
writeFileSync(INDEX, JSON.stringify(sorted, null, 1) + '\n');
console.log(`\n${saved} recorded; ${Object.keys(sorted).length} in the index.`);
