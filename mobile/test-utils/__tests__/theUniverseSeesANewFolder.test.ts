/**
 * A file in a folder nobody has made yet is seen by every finder.
 *
 * Every finder asks test-utils/universe.js (aSweepAsksTheUniverse.test.ts holds
 * them to it), so this plants files in new folders of a made-up repo, one under
 * each universe's roots, and asks the module what it sees there. A new route
 * group, a script folder, a folder of edge functions, a subfolder of the
 * migrations: each is seen, or refused by name, never passed over.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { at, type UniverseName } from '../universe';

const { lintable } = require('../../scripts/migration-lint.cjs') as {
  lintable: (paths: string[], kindOf?: (p: string) => string) => { read: { path: string; undo: boolean }[]; unnamed: string[] };
};
const { isMigration, unnamedSql } = require('../../scripts/add-only.cjs') as {
  isMigration: (p: string) => boolean;
  unnamedSql: (p: string) => boolean;
};

/** Each planted file, from the made-up repo's root, and the universes that must hold it. */
const PLANTED: [string, UniverseName[]][] = [
  ['mobile/app/(a-new-group)/a-new-route.tsx', ['routes', 'appCode']],
  ['mobile/src/a-new-folder/deep/thing.ts', ['appCode']],
  ['mobile/src/a-new-folder/data.json', ['appData']],
  ['mobile/src/a-new-folder/__tests__/thing.test.ts', ['appTests', 'tests']],
  ['mobile/a-new-top/__tests__/top.test.ts', ['tests']],
  ['mobile/test-utils/a-new-folder/helper.ts', ['testSupport']],
  ['mobile/scripts/a-new-folder/check.mjs', ['scripts']],
  ['mobile/e2e/a-new-folder/probe.cjs', ['scripts']],
  ['mobile/mockups/a-new-folder/plate.ts', ['mockups']],
  ['mobile/.maestro/a-new-folder/flow.yaml', ['flows']],
  ['mobile/.maestro/a_new_flow.yaml', ['flows', 'runFlows']],
  ['mobile/a-new-top/notes.md', ['docs']],
  ['.github/workflows/a-new.yml', ['workflows']],
  ['supabase/migrations/20990101_01_a_new_migration.sql', ['migrations', 'supabaseSql']],
  ['mobile/supabase/migrations/20990101_02_an_old_tree_one.sql', ['migrations', 'supabaseSql']],
  ['supabase/migrations/archive/a-new-folder/old.sql', ['notMigrations', 'supabaseSql']],
  ['mobile/supabase/migrations-down/20990101_01_a_new_migration.sql', ['undo', 'supabaseSql']],
  ['mobile/supabase/schema/live-new.sql', ['snapshot', 'supabaseSql']],
  ['mobile/supabase/diagnostics/a-new-folder/a_new_rehearsal.sql', ['rehearsals', 'supabaseSql']],
  ['supabase/functions/a-new-function/index.ts', ['functions']],
  ['mobile/supabase/functions/another/deep/part.ts', ['functions']],
  ['mobile/e2e/supabase/functions/a-stand-in/index.ts', ['standIns']],
  ['src/a-new-folder/Page.tsx', ['website']],
  ['api/a-new-folder/route.ts', ['website']],
];

/** Files no universe may hold: installs, made output, another checkout. */
const NEVER: string[] = [
  'mobile/src/node_modules/pkg/index.ts',
  'mobile/mockups/out/screens/drawn.ts',
  'mobile/.claude/worktrees/copy/mobile/src/x.ts',
];

/** SQL in a subfolder of a migrations folder: the CLI never applies it, and no rule names it. */
const HIDDEN = 'supabase/migrations/a-new-folder/hidden.sql';

let root: string;
const plant = (r: string, text = '') => {
  mkdirSync(dirname(join(root, r)), { recursive: true });
  writeFileSync(join(root, r), text);
};

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'universe-'));
  for (const [r] of PLANTED) plant(r, r.endsWith('.tsx') ? "import x from '../../lib/reached';\nexport default x;\n" : '');
  // Reached only from a route, outside app/ and src/: the route closure finds it.
  plant('mobile/lib/reached.ts', 'export default 1;\n');
  for (const r of [...NEVER, HIDDEN]) plant(r);
  plant('mobile/a-new-top/unnamed.bin');
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('a file in a new folder is seen by every finder', () => {
  it.each(PLANTED)('%s', (r, names) => {
    const u = at(root);
    const holding = names.filter((n) => u.files(n).map(u.repoRel).includes(r));
    expect(holding).toEqual(names);
  });

  it('a route reaches a file outside app/ and src/, and the app universe holds it', () => {
    const u = at(root);
    expect(u.routeClosure().map(u.repoRel)).toContain('mobile/lib/reached.ts');
    expect(u.files('appCode').map(u.repoRel)).toContain('mobile/lib/reached.ts');
  });

  it.each(NEVER)('%s is in no universe', (r) => {
    expect(at(root).universesOf(r)).toEqual([]);
  });

  it('SQL in a new subfolder of the migrations is seen, is no migration, and has no kind', () => {
    const u = at(root);
    expect(u.universesOf(HIDDEN)).toEqual(['supabaseSql']);
    expect(u.kindOf(HIDDEN)).toBe('unknown');
  });

  it('a new file no rule names is refused by the census', () => {
    const u = at(root);
    expect(u.everyFile()).toContain('mobile/a-new-top/unnamed.bin');
    expect([u.universesOf('mobile/a-new-top/unnamed.bin'), u.notSweptBecause('mobile/a-new-top/unnamed.bin')]).toEqual([[], null]);
  });
});

describe('the migration checks read by kind, and refuse SQL no rule names', () => {
  const kindOf = (p: string) => at(root).kindOf(p);

  it('the lint reads a migration and an undo file, skips the archive, and refuses a new folder', () => {
    const { read, unnamed } = lintable([
      'supabase/migrations/20990101_01_a_new_migration.sql',
      'mobile/supabase/migrations-down/20990101_01_a_new_migration.sql',
      'supabase/migrations/archive/a-new-folder/old.sql',
      HIDDEN,
      'mobile/supabase/diagnostics/a-new-folder/a_new_rehearsal.sql',
    ], kindOf);
    expect(read).toEqual([
      { path: 'supabase/migrations/20990101_01_a_new_migration.sql', undo: false },
      { path: 'mobile/supabase/migrations-down/20990101_01_a_new_migration.sql', undo: true },
    ]);
    expect(unnamed).toEqual([HIDDEN]);
  });

  it('the add-only check reads migrations only, and refuses a new folder', () => {
    expect(isMigration('supabase/migrations/20990101_01_a_new_migration.sql')).toBe(true);
    expect(isMigration('mobile/supabase/migrations-down/20990101_01_a_new_migration.sql')).toBe(false);
    expect(isMigration('supabase/migrations/archive/a-new-folder/old.sql')).toBe(false);
    expect(unnamedSql(HIDDEN)).toBe(true);
    expect(unnamedSql('supabase/migrations/archive/a-new-folder/old.sql')).toBe(false);
  });
});
