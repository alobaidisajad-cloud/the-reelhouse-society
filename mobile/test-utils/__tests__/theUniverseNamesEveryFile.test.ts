/**
 * Every file under mobile/ and in both supabase/ trees is named by
 * test-utils/universe.js: it is in a universe, or the list of what no sweep
 * walks over says why, or (in a supabase/ tree) it has a kind. A file no rule
 * names is a file every sweep would pass over in silence, so it fails here
 * until a rule says what it is.
 *
 * And the route files are what expo-router itself loads: its own pattern,
 * read from the package, against the routes universe.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { MOBILE } from '../readCode';
import {
  everyFile, files, isTest, kindOf, notSweptBecause, rel, repoRel, routeClosure, universesOf, UNIVERSES,
  type UniverseName,
} from '../universe';

const inATree = (r: string) => /^(mobile\/)?supabase\//.test(r);
/** A path from mobile/ that is a test file, by the universe's own rule. */
const aTest = (r: string) => isTest(`mobile/${r}`);

describe('the shared file list names every file', () => {
  const all = everyFile();

  it('reads the tree at all', () => {
    expect(all.length).toBeGreaterThan(1500);
    expect(all).toContain('mobile/app/_layout.tsx');
    expect(all).toContain('supabase/migrations/archive/supabase-schema.sql');
  });

  it('every file under mobile/ is in a universe, or named as one no sweep walks over', () => {
    const unnamed = all.filter((r) => !inATree(r) && universesOf(r).length === 0 && !notSweptBecause(r));
    expect(unnamed).toEqual([]);
  });

  it('a file is never both read by a sweep and named as one no sweep reads', () => {
    expect(all.filter((r) => universesOf(r).length > 0 && notSweptBecause(r))).toEqual([]);
  });

  it('every file in both supabase/ trees has a kind', () => {
    expect(all.filter((r) => inATree(r) && kindOf(r) === 'unknown')).toEqual([]);
  });

  it('the kinds the plan names: the archive is not a migration, migrations-down holds undo files', () => {
    const kinds = (dir: string) => [...new Set(all.filter((r) => r.startsWith(dir) && r.endsWith('.sql')).map(kindOf))];
    expect(kinds('supabase/migrations/archive/')).toEqual(['not a migration']);
    expect(kinds('mobile/supabase/migrations-down/')).toEqual(['undo']);
    expect(files('migrations').map(repoRel).filter((r) => r.includes('/archive/') || r.includes('migrations-down'))).toEqual([]);
    expect(files('notMigrations').length).toBeGreaterThan(10);
  });

  it('every universe holds files, so none passes a sweep by being empty', () => {
    const empty = (Object.keys(UNIVERSES) as UniverseName[]).filter((n) => files(n).length === 0);
    expect(empty).toEqual([]);
  });
});

describe('the route files, and what they reach', () => {
  it('are what expo-router loads from app/, by its own pattern', () => {
    const ctx = readFileSync(join(MOBILE, 'node_modules', 'expo-router', '_ctx.android.js'), 'utf8');
    const source = /require\.context\([^,]+,\s*true,\s*(\/.+\/),/.exec(ctx)?.[1];
    expect(source).toBeDefined();
    const pattern = new RegExp(source!.slice(1, -1));
    const loaded = appFolder().filter((r) => pattern.test(`./${r.slice('app/'.length)}`));
    const routes = files('routes').map(rel);
    expect(routes.length).toBeGreaterThan(30);
    expect(routes.filter((r) => !loaded.includes(r))).toEqual([]);
    // The pattern also takes the tests under app/; Metro leaves each of them
    // out of the bundle (aTestNeverShipsAsAScreen.guard.test.ts holds that).
    expect(loaded.filter((r) => !routes.includes(r) && !aTest(r))).toEqual([]);
    expect(loaded.filter(aTest).length).toBeGreaterThan(10);
  });

  it('every code file a route reaches is in the app universe', () => {
    const app = new Set(files('appCode'));
    const reached = routeClosure().filter((f) => /\.[cm]?[jt]sx?$/.test(f));
    expect(reached.length).toBeGreaterThan(300);
    expect(reached.filter((f) => !app.has(f)).map(rel)).toEqual([]);
  });
});

/** Every file under app/, as a path from mobile/. */
function appFolder(): string[] {
  return everyFile().filter((r) => r.startsWith('mobile/app/')).map((r) => r.slice('mobile/'.length));
}
