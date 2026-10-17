/**
 * No test or script lists files by walking folders itself: it asks
 * test-utils/universe.js, which names every file each sweep must read
 * (theUniverseNamesEveryFile.test.ts) and sees a new folder at once
 * (theUniverseSeesANewFolder.test.ts). A finder of its own reads the folders
 * its author knew of, and nothing tells it when another appears.
 *
 * What may still list a folder is named below, each with why: a folder whose
 * contents ARE the subject (the art a register must match exactly), or the
 * output of a run, which no universe holds.
 */
import { readCode } from '../readCode';
import { files, rel } from '../universe';

/** Listing a folder, or asking git for its files: what a finder of its own does. */
const LISTS = /\breaddirSync\b|\breaddir\(|\bopendirSync\b|\bglobSync\b|\bglob\(|['"]ls-files['"]/;

const MAY_LIST: Record<string, string> = {
  'test-utils/universe.js': 'the one module that lists folders',
  // A folder whose contents are the subject.
  'src/components/__tests__/busterRegister.test.ts': "assets/buster/ must hold exactly the pictures the register names, at every density",
  'src/utils/__tests__/expoImagePatch.guard.test.ts': 'patches/ must hold exactly the one patch package.json pins',
  'src/utils/__tests__/theRecordingsTravel.test.ts': 'the recordings folders must each be tracked by git, file by file',
  'src/utils/__tests__/easUpload.guard.test.ts': 'which .easignore files git tracks is what an EAS upload reads',
  'scripts/comment-truth.js': "git's own list of the files it tracks, and the type declarations of installed packages",
  'scripts/functions-check.mjs': "a function's whole folder is what a deploy bundles, and a download is a folder of its own",
  'mockups/tools/drawn.cjs': 'the drawn pages a run of the mockups wrote',
  'mockups/tools/harness.cjs': 'the drawn pages a run of the mockups wrote',
  'e2e/shard-verdict.mjs': 'the flows folder its workflow names, as Maestro reads it: the files directly in it',
  'e2e/db/verify-writes.mjs': 'the flows folder its workflow names, as Maestro reads it: the files directly in it',
  'src/utils/__tests__/everyCheckRuns.guard.test.ts': 'a workflow GitHub never reads can sit in any folder: git’s list of every file in the repo, outside any universe',
  'scripts/commit.cjs': 'asks git whether each path it is given is tracked; it lists no folder',
  'scripts/mutants.cjs': "a judge's fixture folder is its logs, every file of them; and the folder of parts a night's runs downloaded",
  'src/utils/__tests__/everyMutantIsSound.guard.test.ts': "asks git which files in the judges' fixture folders it ignores: a log no other checkout would have",
  // The output of a run.
  'e2e/app-crashes.mjs': "the device logs a run wrote",
  'e2e/attempt.mjs': "Maestro's debug folder for the attempt",
  'e2e/flow-screens.mjs': "Maestro's debug folder and reports for the run",
  'e2e/route-judges.mjs': "Maestro's output folder for the route walk, which may nest the walk's captures",
  'e2e/ios-crash.mjs': 'the crash reports the simulator wrote',
  'e2e/ios-launch.cjs': 'the crash reports the simulator wrote since the launch',
  'e2e/scrub.mjs': 'the artifacts folder it is given, before upload',
  'scripts/flake-history.cjs': "the flow reports a night's Sealed E2E rounds wrote, downloaded for it",
  'e2e/old-client-tree.mjs': 'the old client checkout it is making, emptied of all but the harness',
  'e2e/__tests__/flowScreens.test.ts': 'the folder its own run of flow-screens.mjs wrote',
  'scripts/bundle-size.js': 'the bundle an export just wrote',
  'scripts/release-guard.cjs': 'the bundles an export wrote, in the folder it is given',
  'e2e/advisories.mjs': 'the source map an export just wrote, and the folders --roots hands it; the edge trees themselves come from the universe',
  'scripts/dump-production.cjs': 'the dump folder, for the dumps a newer one replaces',
};

describe('every finder asks the shared file list', () => {
  const code = files(['appCode', 'tests', 'testSupport', 'scripts', 'config', 'mockups'])
    .filter((f) => /\.(?:[cm]?js|jsx|ts|tsx)$/.test(f) && !f.endsWith('.d.ts'));
  const listing = code.map(rel).filter((f) => f !== 'test-utils/__tests__/aSweepAsksTheUniverse.test.ts')
    // As code: a comment that names a listing is not one.
    .filter((f) => LISTS.test(readCode(f)));

  it('reads every test and script', () => {
    expect(code.length).toBeGreaterThan(1000);
    expect(code.map(rel)).toEqual(expect.arrayContaining(['e2e/db/rehearsals.mjs', 'scripts/check-app-routes.js', '__tests__/searchPathHardening.test.ts']));
  });

  it('no file lists a folder unless it is named here with why', () => {
    expect(listing.filter((f) => !(f in MAY_LIST))).toEqual([]);
  });

  it('every file named here still lists one', () => {
    expect(Object.keys(MAY_LIST).filter((f) => !listing.includes(f))).toEqual([]);
  });

  it('the pattern catches each way a finder lists files', () => {
    for (const shape of ["readdirSync(dir)", "fs.readdir(dir, cb)", "opendirSync(d)", "globSync('**/*.ts')", "glob('**')", "execFileSync('git', ['ls-files'])"]) {
      expect([shape, LISTS.test(shape)]).toEqual([shape, true]);
    }
    expect(LISTS.test("files('appCode')")).toBe(false);
  });
});
