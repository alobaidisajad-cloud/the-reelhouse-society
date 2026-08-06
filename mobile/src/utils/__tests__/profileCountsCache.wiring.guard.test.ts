/**
 * profileCountsCache.wiring.guard.test.ts — the seed must actually be used
 * ───────────────────────────────────────────────────────────────────────
 * profileCountsCache.test.ts proves the cache is correct. On this codebase that has
 * already been measured as not the same thing: batch 14 deleted three real call sites
 * and the entire suite stayed green.
 *
 * Both ends live inside useProfileData, a hook that drives Supabase, four film stores
 * and a 22-case reducer. A render test would be mocking scaffolding rather than
 * behaviour. So this is a deletion tripwire over the two call sites, plus the property
 * that is silently wrong rather than loudly broken: seeding only SOME of the counts.
 */
import * as fs from 'fs';
import * as path from 'path';

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'hooks', 'useProfileData.ts'), 'utf8');

describe('useProfileData keeps the exact counts', () => {
  it('imports and calls both ends', () => {
    expect(src).toMatch(/import\s*\{[^}]*readCachedCounts[^}]*\}\s*from\s*['"][^'"]*profileCountsCache['"]/);
    expect(src).toMatch(/import\s*\{[^}]*writeCachedCounts[^}]*\}\s*from\s*['"][^'"]*profileCountsCache['"]/);
    expect(src).toMatch(/readCachedCounts\(/);
    expect(src).toMatch(/writeCachedCounts\(/);
  });

  it('writes the counts the server actually returned, not a rebuilt object', () => {
    expect(src).toMatch(/writeCachedCounts\([^,]+,\s*countsResult\s*\)/);
  });

  it('writes only where the counts are exact — after the fetch, on the self path', () => {
    // Caching anything else would persist a guess and seed it forever.
    const write = src.indexOf('writeCachedCounts(');
    const fetched = src.indexOf('ProfileDataService.fetchCounts(');
    expect(fetched).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(fetched);
  });
});

describe('the cold-start seed', () => {
  const seed = (() => {
    const at = src.indexOf('const seeded = readCachedCounts(');
    expect(at).toBeGreaterThan(-1);
    return src.slice(at, at + 700);
  })();

  it('seeds from the cache rather than from zeros', () => {
    expect(seed).toMatch(/SET_COUNTS/);
    expect(seed).toMatch(/seeded\?\.watchlist/);
  });

  it('seeds EVERY count, not just the one that was reported', () => {
    // The flash was reported on WATCHLIST, but ARCHIVE, LEDGER, VAULT and STACKS all
    // read the same window and all flashed the same way. Fixing only the one that was
    // complained about is the exact failure this project keeps writing tests against.
    for (const field of ['logs', 'ledger', 'watchlist', 'vault', 'lists']) {
      expect(seed).toMatch(new RegExp(`${field}:\\s*seeded\\?\\.${field}`));
    }
  });

  it('still falls back to zero on the very first open, rather than crashing', () => {
    for (const field of ['logs', 'ledger', 'watchlist', 'vault', 'lists']) {
      expect(seed).toMatch(new RegExp(`${field}:\\s*seeded\\?\\.${field}\\s*\\?\\?\\s*0`));
    }
  });

  it('seeds the signed-in account, never a hardcoded or foreign id', () => {
    expect(src).toMatch(/readCachedCounts\(cachedSelf\.id\)/);
  });
});
