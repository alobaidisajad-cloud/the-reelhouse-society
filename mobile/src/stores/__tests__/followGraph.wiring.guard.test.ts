/**
 * followGraph.wiring.guard.test.ts — the follow list reaches the store one way.
 *
 * GAP D: a list read from the server replaces the store's only through
 * commitHydratedGraph, which folds in the acts still queued; this fails if
 * anything else sets the lists. (What a failed read does is driven in
 * aFailedLoadKeepsWhoYouFollow.test.ts.)
 *
 * GAP E: the list saved on the phone is read back at boot, or a cold start
 * shows every member as unfollowed until the server answers.
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

  it('the loader commits through it', () => {
    const calls = code(slice).match(/commitHydratedGraph\(userId, allUsernames, allRequested\);/g) ?? [];
    expect(calls).toHaveLength(1);
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
