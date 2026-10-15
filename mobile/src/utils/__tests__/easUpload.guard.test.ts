/**
 * Nothing git keeps out reaches an EAS build's upload.
 * ─────────────────────────────────────────────────────────────────────────────
 * eas-cli reads the repo root's `.easignore` INSTEAD of every `.gitignore`
 * (its `vcs/local.js`: "if .easignore exists, .gitignore files are not used").
 * Build 41's `.easignore` listed only heavy folders, so its upload carried every
 * file git keeps out: the database password, the web-push key, the TMDB key.
 *
 * eas.json's `requireCommit` makes EAS upload a clone of what is committed, so an
 * ignored file cannot travel while it is on. This is the second wall, for the
 * day it is off: every rule of both `.gitignore` files is turned into a path it
 * ignores, and the root `.easignore` must ignore that path too, read the way
 * eas-cli reads it (the `ignore` package, one matcher at the root). It works
 * from the rules, not from files on disk, so it holds on a CI checkout that has
 * none of the secret files.
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import ignore from 'ignore';
import { join } from 'path';

const MOBILE = join(__dirname, '..', '..', '..');
const ROOT = join(MOBILE, '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const rulesOf = (text: string) =>
  text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

/** Paths a rule ignores: its wildcards filled, in its folder, and one deeper when unanchored. */
const samplesOf = (rule: string, folder: string): string[] => {
  const anchored = rule.startsWith('/') || rule.slice(0, -1).includes('/');
  const dirOnly = rule.endsWith('/');
  const body = rule.replace(/^\//, '').replace(/\/$/, '')
    .replace(/\*\*/g, 'a').replace(/\*/g, 'x').replace(/\?/g, 'x').replace(/\[[^\]]*\]/g, 'x');
  const here = dirOnly ? `${body}/x` : body;
  return anchored ? [folder + here] : [folder + here, `${folder}deep/${here}`];
};

/** Each git rule's sample paths that the root .easignore lets through. */
const leaks = (gitignores: { folder: string; text: string }[], easignore: string): string[] => {
  const eas = ignore().add(easignore);
  return gitignores.flatMap(({ folder, text }) => {
    const git = ignore().add(text);
    return rulesOf(text).filter((r) => !r.startsWith('!')).flatMap((rule) =>
      samplesOf(rule, folder)
        // A sample git itself keeps (a negation takes it back) says nothing.
        .filter((path) => git.ignores(path.slice(folder.length)))
        .filter((path) => !eas.ignores(path))
        .map((path) => `${folder}.gitignore "${rule}" → ${path}`));
  });
};

const GITIGNORES = [
  { folder: '', text: read('.gitignore') },
  { folder: 'mobile/', text: read('mobile/.gitignore') },
];

it('reads both .gitignore files, and their secret rules are among what it reads', () => {
  const all = GITIGNORES.flatMap((g) => rulesOf(g.text));
  expect(all.length).toBeGreaterThan(80);
  expect(all).toEqual(expect.arrayContaining(['.env', '.env*.local', '.env*.pull', 'vapid.txt', '*.p8', '*.key']));
});

it('every path git keeps out, the root .easignore keeps out of the upload', () => {
  expect(leaks(GITIGNORES, read('.easignore'))).toEqual([]);
});

it('the secrets that build 41 carried are named, each kept out', () => {
  const eas = ignore().add(read('.easignore'));
  for (const path of ['mobile/.env.local', '.env', '.env.local', '.env.vercel.pull', 'scripts/archive/vapid.txt', 'mobile/.env']) {
    expect([path, eas.ignores(path)]).toEqual([path, true]);
  }
});

it('the root is the only .easignore — eas-cli reads no other', () => {
  const tracked = execFileSync('git', ['ls-files', '--', '*.easignore', '.easignore'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  expect(tracked).toEqual(['.easignore']);
});

it('the check says NO — to a secret rule dropped, and to a git rule nothing covers', () => {
  const easignore = read('.easignore');
  const withoutEnv = easignore.split(/\r?\n/).filter((l) => !/^\.env/.test(l.trim())).join('\n');
  expect(leaks(GITIGNORES, withoutEnv)).toEqual(expect.arrayContaining([expect.stringContaining('".env"')]));
  const planted = [...GITIGNORES, { folder: 'mobile/', text: 'secrets-planted.json\n' }];
  expect(leaks(planted, easignore)).toEqual([
    'mobile/.gitignore "secrets-planted.json" → mobile/secrets-planted.json',
    'mobile/.gitignore "secrets-planted.json" → mobile/deep/secrets-planted.json',
  ]);
});
