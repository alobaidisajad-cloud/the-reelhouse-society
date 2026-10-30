/**
 * everyCheckRuns.guard.test.ts — no check sits in the repo that nothing runs.
 *
 * A check nobody runs is worse than none: it reads as coverage. Three shapes
 * were found (GUARDS.md §7): a workflow under mobile/.github that GitHub never
 * reads, npm scripts no workflow or hook calls (one of them saying "CI runs
 * this"), and tsconfig files no tool is pointed at. So:
 *   · every workflow file is in the repo's own .github/workflows;
 *   · every npm script is run by a workflow or a hook (by `npm run`, or by the
 *     file it runs), or is named in LOCAL with why it runs by hand;
 *   · every tsconfig is the project's own or one a workflow, hook, script or
 *     the ESLint config names;
 *   · every script file in mobile/scripts is run by a workflow, a hook, an npm
 *     script or another script, or loaded by a test that runs it, or is named
 *     in BY_HAND with why (the EAS preflight was named by tests alone, and no
 *     build ran it until build:ios and build:android did, P0.64);
 *   · every store build runs that preflight before EAS is asked.
 */
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import { files as universe } from '@/test-utils/universe';

const MOBILE = join(__dirname, '..', '..', '..');
const ROOT = join(MOBILE, '..');
const read = (p: string) => readFileSync(p, 'utf8');
/** The repo's files, as on disk: a deletion not yet committed is already gone. */
const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter((p) => p && existsSync(join(ROOT, p)));

/** Scripts run by hand, each with why; anything else must be run by CI or a hook. */
const LOCAL: Record<string, string> = {
  prepare: 'npm runs it after every install: it installs the hooks',
  postinstall: 'npm runs it after every install: it applies patches/',
  start: 'the development server',
  android: 'a development build on a device',
  ios: 'a development build on a device',
  lint: 'Expo\'s wrapper; CI runs ESLint itself, with --max-warnings=0',
  test: 'jest by hand; CI runs jest itself, with coverage and the ratchet',
  'schema:snapshot': 'writes the snapshot from production; run by the owner\'s train, never by CI',
  'check:backend': 'reads production; runs before and after each train until decision 1 gives CI a read login (P0.25)',
  'gates:check': 'reads production; runs before and after each train until decision 1 gives CI a read login (P0.25)',
  'functions:check': 'reads the deployed functions with the owner\'s login; runs after any function deploy',
  'docs:generate': 'writes API documentation on request; it checks nothing',
  'docs:deps': 'draws the dependency graph on request; it checks nothing',
  icons: 'regenerates the icon list; lucide-icons\' own test holds the list to the package',
  'icons:house': 'draws the app\'s icons from the official logo, when the logo changes; theAppWearsTheHouseIcon holds the files',
  'update:publish': 'the owner publishes, widens or rolls back an over-the-air update (Decision 6); never CI',
  'release:guard': 'the owner runs it on each EAS download before submitting (P0.0a); CI runs its file too',
  'build:ios': "the owner's store build: the preflight, then EAS; no store build is made by CI",
  'build:android': "the owner's store build: the preflight, then EAS; no store build is made by CI",
};

/** Script files run by a person, each with why. */
const BY_HAND: Record<string, string> = {
  'resume.cjs': 'every working session starts by running it (P0.59)',
  'dump-production.cjs': "the owner's full dump of production before a train that touches data (PLAN §3c-17)",
  'commit.cjs': 'the one way a commit is made here: explicit paths, the message from a file, each refusal said',
};

const workflows = universe('workflows').map(read);
const hooks = universe('scripts', { under: ['scripts/hooks'] }).map(read);
const runners = [...workflows, ...hooks].join('\n');
const scripts = JSON.parse(read(join(MOBILE, 'package.json'))).scripts as Record<string, string>;

/** The file a script runs, if it runs one of the repo's own. */
const fileOf = (cmd: string) => cmd.match(/(?:node|bash)\s+\.?\/?((?:scripts|e2e)\/[\w./-]+)/)?.[1];
const runs = (name: string, cmd: string, text: string) => {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const file = fileOf(cmd);
  return new RegExp(`npm run (--silent )?${esc}(?![\\w:-])`).test(text) || (!!file && text.includes(file));
};

it('keeps every workflow where GitHub reads workflows', () => {
  const all = tracked.filter((p) => /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/.test(p));
  expect(all.length).toBeGreaterThan(5);
  expect(all.filter((p) => !p.startsWith('.github/workflows/'))).toEqual([]);
});

it('runs every npm script in a workflow or a hook, or says why it is run by hand', () => {
  const unrun = Object.entries(scripts).filter(([name, cmd]) => !runs(name, cmd, runners) && !LOCAL[name]).map(([n]) => n);
  expect(unrun).toEqual([]);
  // A script named here that CI does run is named in the wrong place, unless it runs by hand too.
  const stale = Object.keys(LOCAL).filter((name) => !scripts[name]);
  expect(stale).toEqual([]);
});

it('points a tool at every tsconfig', () => {
  const configs = universe('config').map((f) => basename(f)).filter((f) => /^tsconfig.*\.json$/.test(f) && f !== 'tsconfig.json');
  const named = [runners, read(join(MOBILE, 'eslint.config.js')),
    ...universe('scripts', { under: ['scripts'], ext: ['.js', '.cjs', '.mjs'] }).map(read)].join('\n');
  expect(configs.filter((c) => !named.includes(c))).toEqual([]);
});

it('runs every script file, from a workflow, a hook, an npm script or another script, or a test that loads it, or says why by hand', () => {
  // The hooks are git's to run, installed by `prepare` (hooks.guard holds them).
  const files = universe('scripts', { under: ['scripts'], ext: ['.js', '.cjs', '.mjs'] })
    .filter((p) => !/__tests__/.test(p) && !/[\\/]scripts[\\/]hooks[\\/]/.test(p));
  expect(files.length).toBeGreaterThan(30);
  const others = files.map((p) => [p, read(p)] as const);
  const npm = read(join(MOBILE, 'package.json'));
  const tests = universe('tests').filter((p) => /\.(test|spec)\.[jt]sx?$/.test(p)).map(read).join('\n');
  const unrun = files.map((p) => basename(p)).filter((name) => {
    if (BY_HAND[name]) return false;
    if (runners.includes(name) || npm.includes(name)) return false;
    if (others.some(([p, text]) => basename(p) !== name && text.includes(name))) return false;
    const stem = name.replace(/\.[cm]?js$/, '');
    return !new RegExp(`(require|requireActual|import|spawnSync|execFileSync|spawn)\\([^)]*scripts/${stem}\\b|from ['"][^'"]*scripts/${stem}\\b`).test(tests);
  });
  expect(unrun).toEqual([]);
  expect(Object.keys(BY_HAND).filter((name) => !files.some((p) => basename(p) === name))).toEqual([]);
});

it('runs the preflight before every store build asks EAS', () => {
  const builds = Object.entries(scripts).filter(([, cmd]) => /\beas build\b/.test(cmd));
  expect(builds.map(([n]) => n).sort()).toEqual(['build:android', 'build:ios']);
  for (const [name, cmd] of builds) {
    expect([name, /^node scripts\/eas-build-preflight\.cjs && eas build /.test(cmd)]).toEqual([name, true]);
  }
});

it('can say no: an unrun script, a nested workflow, an unread tsconfig', () => {
  expect(runs('check:x', 'node ./scripts/x.js', 'run: node mobile/scripts/y.js')).toBe(false);
  expect(runs('check:x', 'node ./scripts/x.js', 'run: npm run check:x')).toBe(true);
  expect(runs('check:x', 'node ./scripts/x.js', 'run: node scripts/x.js')).toBe(true);
  expect(runs('check', 'node ./scripts/x.js', 'run: npm run check:x')).toBe(false);
  expect(['mobile/.github/workflows/ci.yml'].filter((p) => !p.startsWith('.github/workflows/'))).toHaveLength(1);
});
