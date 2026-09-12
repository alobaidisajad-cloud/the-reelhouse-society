/**
 * theArchivePagesOnWhatTheServerGave.test.ts — a film's archive repeating itself.
 * ─────────────────────────────────────────────────────────────────────────────
 * `useDispatchArchive` pages a film's filings with `.range(from, …)`, and
 * `loadMore` passed `filings.length` as the next offset.
 *
 * `parseFilingRows` DROPS a row it cannot read. So the number of filings on
 * screen runs BEHIND the offset the server has actually served, and the next
 * page starts too early: every row after an unreadable one is fetched a second
 * time and shown twice. One malformed filing is enough, and it repeats at every
 * seam after it.
 *
 * notificationStore already carries the warning in its cursor form — "Taken
 * from the RAW row, not the salvaged one" — and the archive had the
 * offset-shaped version of exactly that bug.
 *
 * The ordering gained a tiebreaker in the same change: two filings made in the
 * same instant could swap places between requests, which hands the reader a
 * duplicate at the page seam even when nothing fails to parse.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const SRC = fs.readFileSync(path.join(ROOT, 'src/hooks/useDispatchArchive.ts'), 'utf8');

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const CODE = stripComments(SRC);

describe('the archive pages on what the server gave', () => {
  it('loadMore does NOT use the number of rows on screen as the offset', () => {
    // The defect, exactly: `page(filings.length)`.
    expect(CODE).not.toMatch(/page\(\s*filings\.length\s*\)/);
  });

  it('loadMore pages from the server-side offset', () => {
    expect(CODE).toMatch(/page\(\s*fetched\.current\s*\)/);
  });

  it('the offset counts RAW rows, not the ones that survived parsing', () => {
    // `raw` is taken from rows.data before parseFilingRows touches it.
    expect(CODE).toMatch(/const raw = rows\.data\?\.length \?\? 0;/);
    expect(CODE).toMatch(/fetched\.current = from === 0 \? raw : fetched\.current \+ raw;/);
    // And "is there more" asks the same raw count — a short page after
    // salvage is not the end of the list.
    expect(CODE).toMatch(/setMore\(raw === ARCHIVE_PAGE\)/);
  });

  it('the offset is reset when the film changes and when the search clears', () => {
    // Belt and braces, and said plainly: `page(0)` already sets the offset from
    // the raw count, so these two resets only matter when that fetch never
    // completes — a stale generation, or a failure — after which a loadMore
    // would page from the PREVIOUS film's offset.
    //
    // The behavioural test cannot reach that case, which mutation-checking
    // proved by deleting this and watching it stay green. So the claim lives
    // here, in the source pin, where it is honest about being a shape check.
    expect((CODE.match(/fetched\.current = 0;/g) ?? []).length).toBe(2);
  });

  it('the ordering carries a tiebreaker, so pages cannot shuffle', () => {
    expect(CODE).toMatch(/\.order\('created_at', \{ ascending: false \}\)\s*\.order\('id', \{ ascending: false \}\)/);
  });

  it('the detector would SEE the old shape — not passing on an empty file', () => {
    expect(/page\(\s*filings\.length\s*\)/.test('void page(filings.length);')).toBe(true);
    expect(CODE.length).toBeGreaterThan(2000);
  });
});
