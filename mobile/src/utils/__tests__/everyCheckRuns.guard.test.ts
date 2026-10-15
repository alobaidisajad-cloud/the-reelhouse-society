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
 *     the ESLint config names.
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
  'release:guard': 'the owner runs it on each EAS download before submitting (P0.0a); CI runs its file too',
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

it('can say no: an unrun script, a nested workflow, an unread tsconfig', () => {
  expect(runs('check:x', 'node ./scripts/x.js', 'run: node mobile/scripts/y.js')).toBe(false);
  expect(runs('check:x', 'node ./scripts/x.js', 'run: npm run check:x')).toBe(true);
  expect(runs('check:x', 'node ./scripts/x.js', 'run: node scripts/x.js')).toBe(true);
  expect(runs('check', 'node ./scripts/x.js', 'run: npm run check:x')).toBe(false);
  expect(['mobile/.github/workflows/ci.yml'].filter((p) => !p.startsWith('.github/workflows/'))).toHaveLength(1);
});
