/**
 * csv-import-invariants.test.ts
 * ─────────────────────────────
 * The CSV import was broken from the day it was written, in four separate ways,
 * and every one of them was invisible from the code alone. These are the exact
 * invariants that make it work, asserted against the source so a plausible-looking
 * edit cannot quietly restore any of them.
 *
 * Each was verified against the live database or the live TMDB proxy:
 *
 *  1. onConflict must be user_id,film_id — the only unique index that exists.
 *     'user_id,film_title' has none, so PostgREST rejected every import with
 *     "there is no unique or exclusion constraint matching the ON CONFLICT
 *     specification".
 *
 *  2. Films must be identified BEFORE the insert. Writing film_id: 0 and
 *     enriching afterwards cannot work: logs_user_id_film_id_key is UNIQUE on
 *     (user_id, film_id), so the SECOND row of any import collided with the
 *     first. Verified: first insert succeeds, second raises duplicate key.
 *
 *  3. The column is poster_path. The old background step wrote `poster`, which
 *     does not exist on logs — "column poster of relation logs does not exist".
 *
 *  4. The year must be a search PARAMETER, never appended to the query text.
 *     Verified against the proxy: "The Matrix 1999" returns 0 results, while
 *     "The Matrix" with year=1999 returns the film. Appending it would have made
 *     the importer report every title as unidentifiable — a failure that looks
 *     like the member's file is at fault.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const importSrc = readFileSync(join(__dirname, '..', 'components', 'CSVImport.tsx'), 'utf8');
const tmdbSrc = readFileSync(join(__dirname, '..', 'tmdb.ts'), 'utf8');

/** Source minus comments, so the documentation of an old bug never satisfies a test. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
}

describe('CSV import invariants', () => {
  const imp = code(importSrc);

  it('upserts on the unique index that exists, not on film_title', () => {
    expect(imp).toContain("onConflict: 'user_id,film_id'");
    expect(imp).not.toContain("onConflict: 'user_id,film_title'");
  });

  it('never writes a placeholder film_id', () => {
    expect(imp).not.toMatch(/film_id:\s*0\b/);
  });

  it('identifies films before inserting, not in the background afterwards', () => {
    const resolveAt = imp.indexOf('searchByTitleYear');
    const insertAt = imp.indexOf('.upsert(');
    expect(resolveAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(-1);
    expect(resolveAt).toBeLessThan(insertAt);
    expect(imp).not.toContain('enrichImportedFilms');
  });

  it('writes poster_path, the column that exists', () => {
    expect(imp).toContain('poster_path:');
    expect(imp).not.toMatch(/^\s*poster:/m);
  });

  it('reports titles it could not identify instead of dropping them silently', () => {
    expect(imp).toContain('setSkippedCount');
    expect(code(importSrc)).toContain('skippedCount');
  });

  it('de-duplicates within one import, so a request cannot conflict with itself', () => {
    expect(imp).toMatch(/new Map<number,/);
  });
});

describe('TMDB lookup invariants', () => {
  const tm = code(tmdbSrc);

  it('passes the year as a parameter and never appends it to the query', () => {
    expect(tm).toContain('searchByTitleYear');
    expect(tm).toMatch(/&year=\$\{year\}/);
    // The failing shape: a year interpolated straight into the query text.
    expect(tm).not.toMatch(/query=\$\{[^}]*\}\s*\$\{year/);
    // And the query term itself must be the title and nothing else. Asserting the
    // absence of one bad pattern is not enough — a first pass at this test still
    // passed when the year was concatenated a different way. Pinning the
    // construction closes every variant at once.
    const fn = tm.slice(tm.indexOf('searchByTitleYear'));
    expect(fn.slice(0, fn.indexOf('topRated'))).toMatch(
      /const q = encodeURIComponent\(title\)\s*$/m,
    );
  });

  it('falls back to the title alone, so a wrong year costs precision not the row', () => {
    const fn = tm.slice(tm.indexOf('searchByTitleYear'));
    const body = fn.slice(0, fn.indexOf('topRated'));
    expect((body.match(/\/search\/movie\?query=/g) || []).length).toBe(2);
  });
});
