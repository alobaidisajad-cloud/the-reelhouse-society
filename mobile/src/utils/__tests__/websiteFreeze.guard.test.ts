/**
 * The website stays frozen unless the user approved the change, by date.
 * ─────────────────────────────────────────────────────────────────────────────
 * scripts/website-freeze.cjs runs on every push (god_tier_ci.yml). Here its
 * three parts are held: which files are the website's, what an approval looks
 * like, and which commits it refuses; then that CI runs it, and that
 * Dependabot opens no website update while the freeze holds.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const { approval, frozen, unapproved } = require('../../../scripts/website-freeze.cjs') as {
  approval: (message: string) => { date: string; words: string } | null;
  frozen: (path: string) => boolean;
  unapproved: (commits: { hash: string; subject: string; message: string; files: string[] }[]) => string[];
};

const ROOT = join(__dirname, '..', '..', '..', '..');

it('the website\'s files are frozen, and nothing else is', () => {
  for (const path of ['src/pages/FeedPage.tsx', 'api/og.js', 'public/robots.txt', 'index.html', 'vite.config.js',
    'vercel.json', 'tsconfig.json', 'package.json', 'package-lock.json', 'src/utils/validateUsername.ts']) {
    expect([path, frozen(path)]).toEqual([path, true]);
  }
  for (const path of ['mobile/src/utils/validateUsername.ts', 'mobile/package.json', 'tests/feed.spec.ts',
    'supabase/migrations/x.sql', '.github/workflows/god_tier_ci.yml', 'mobile/tsconfig.json']) {
    expect([path, frozen(path)]).toEqual([path, false]);
  }
});

it('an approval is a dated line of its own with the user\'s words quoted', () => {
  expect(approval('fix(web): x\n\nWebsite-approved: 2026-10-20 "yes ship the push change"\n')).toEqual({
    date: '2026-10-20', words: 'yes ship the push change',
  });
  expect(approval('Website-approved: yes')).toBeNull();
  expect(approval('Website-approved: 2026-10-20')).toBeNull();
  expect(approval('the user said Website-approved: 2026-10-20 "ok" in passing')).toBeNull();
});

it('refuses a commit that changes the website with no approval, and only that one', () => {
  const commits = [
    { hash: 'a'.repeat(40), subject: 'web change', message: 'web change', files: ['src/App.tsx', 'mobile/app.json'] },
    { hash: 'b'.repeat(40), subject: 'app change', message: 'app change', files: ['mobile/app.json'] },
    { hash: 'c'.repeat(40), subject: 'approved', message: 'x\n\nWebsite-approved: 2026-10-20 "go ahead"', files: ['vercel.json'] },
  ];
  expect(unapproved(commits)).toEqual(['aaaaaaaa web change\n    src/App.tsx']);
});

it('runs on every push from the push\'s base, and Dependabot opens no website update meanwhile', () => {
  const ci = readFileSync(join(ROOT, '.github/workflows/god_tier_ci.yml'), 'utf8');
  expect(ci).toContain('node mobile/scripts/website-freeze.cjs "$BEFORE"');
  const deps = readFileSync(join(ROOT, '.github/dependabot.yml'), 'utf8').split('\r\n').join('\n');
  const root = deps.slice(deps.indexOf('    directory: /\n'));
  expect(root.slice(0, root.indexOf('\n  - package-ecosystem'))).toMatch(/open-pull-requests-limit: 0\b/);
});
