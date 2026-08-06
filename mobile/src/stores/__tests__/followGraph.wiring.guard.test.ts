/**
 * followGraph.wiring.guard.test.ts — the two gaps my own review found
 * ──────────────────────────────────────────────────────────────────
 * Neither of these is in the audit register. Both were found by asking what else was
 * wrong in the same area, and both would have survived every other fix in this batch.
 *
 * GAP D — there are TWO hydrators. The joined query, and a fallback that runs whenever
 * that join fails. Both replaced the follow lists outright. Fixing only the one being
 * read would have left the fallback erasing pending follows on exactly the runs where
 * something is already going wrong. So reconciliation lives at ONE funnel and this
 * fails if a third caller ever sets those lists directly.
 *
 * GAP E — the follow graph is written to device storage on every follow and was never
 * read back. `followStore.hydrateFromCache` existed with zero callers, so the graph
 * started empty on every cold start: offline it stayed empty, every profile read
 * FOLLOW instead of FOLLOWING, and the following feed switched itself off.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const slice = fs.readFileSync(path.join(ROOT, 'stores', 'domain', 'socialSlice.ts'), 'utf8');
const layout = fs.readFileSync(path.join(ROOT, '..', 'app', '_layout.tsx'), 'utf8');

/** Source with comments stripped — prose about these calls must not satisfy a guard. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('GAP D · every hydrator goes through one reconciler', () => {
  it('the reconciler exists and reads the pending queue', () => {
    expect(slice).toMatch(/export function reconcileGraphWithPendingMutations/);
    expect(slice).toMatch(/function commitHydratedGraph/);
    expect(slice).toMatch(/getOfflineQueue\(\)/);
  });

  it('BOTH hydrators commit through it', () => {
    const calls = code(slice).match(/commitHydratedGraph\(userId, allUsernames, allRequested\);/g) ?? [];
    expect(calls).toHaveLength(2);
  });

  it('the FALLBACK hydrator is one of them — it is the easy one to miss', () => {
    const fallback = slice.slice(slice.indexOf('async function _hydrateFollowingFallback'));
    expect(fallback).toMatch(/commitHydratedGraph\(/);
    expect(code(fallback)).not.toMatch(/getState\(\)\.setFollowing\(/);
  });

  it('nothing else sets the lists behind the funnel\'s back', () => {
    // Exactly two direct writes may remain: inside commitHydratedGraph itself, and the
    // unfollow rollback (which restores a snapshot, not a hydrated graph).
    const c = code(slice);
    expect((c.match(/getState\(\)\.setFollowing\(/g) ?? [])).toHaveLength(2);
    expect((c.match(/getState\(\)\.setRequested\(/g) ?? [])).toHaveLength(2);
  });
});

describe('GAP E · the follow cache is finally read', () => {
  it('boot hydrates the follow store from its own cache', () => {
    expect(layout).toMatch(/import\s*\{[^}]*useSocialStore[^}]*\}\s*from\s*['"][^'"]*followStore['"]/);
    expect(code(layout)).toMatch(/useSocialStore\.getState\(\)\.hydrateFromCache\(/);
  });

  it('it happens beside the block store, before first render AND after the session settles', () => {
    // Two calls, mirroring blockStore exactly: the cached id may not be the id the
    // session ultimately resolves to, and the cache is keyed by id.
    const calls = code(layout).match(/useSocialStore\.getState\(\)\.hydrateFromCache\(/g) ?? [];
    expect(calls).toHaveLength(2);

    // Whitespace-collapsed, because stripping comments leaves blank lines behind and
    // the point is adjacency of the CALLS, not how much prose sits between them.
    const flat = code(layout).replace(/\s+/g, ' ');
    expect(flat).toMatch(/useBlockStore\.getState\(\)\.hydrateFromCache\(userId\); useSocialStore\.getState\(\)\.hydrateFromCache\(userId\);/);
    expect(flat).toMatch(/useBlockStore\.getState\(\)\.syncFromServer\(uid\)[^;]*; useSocialStore\.getState\(\)\.hydrateFromCache\(uid\);/);
  });
});
