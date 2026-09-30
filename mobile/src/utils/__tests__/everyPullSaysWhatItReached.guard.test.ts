/**
 * everyPullSaysWhatItReached.guard.test.ts — a pull to refresh that reached
 * nothing says so, on every page that has one.
 *
 * Five pages said "Could not refresh — check your connection." and four said
 * nothing (a log's page, a stack's, a member's file, the Tribunal) — each page
 * wrote its own pull, and each decided alone. A sweep, because a new page's
 * pull is exactly what a render of the old pages would not see: every file
 * that draws a RefreshControl either says the shared sentence (REFRESH_FAILED)
 * itself, or is named here with the one that says it for it.
 */
import { readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { MOBILE, readCode } from '@/test-utils/readCode';

/** Pulls handed down from a screen that says it: the file → the one that does. */
const SAID_BY: Record<string, string> = {
  'app/user/[username].tsx': 'src/hooks/useProfileController.ts',
  'src/components/reels/ReelsFeedList.tsx': 'app/(tabs)/reels.tsx',
  'src/components/reels/ReelsStackList.tsx': 'app/(tabs)/reels.tsx',
};

const files: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.tsx') && !/\.test\./.test(name)) files.push(relative(MOBILE, full).split(sep).join('/'));
  }
};
walk(join(MOBILE, 'src'));
walk(join(MOBILE, 'app'));

const says = (f: string) => /\bREFRESH_FAILED\b/.test(readCode(f));
const pulls = files.filter((f) => /<RefreshControl\b/.test(readCode(f)));

describe('every pull says what it reached', () => {
  it('found the pulls, rather than an empty list that passes', () => {
    expect(pulls.length).toBeGreaterThanOrEqual(10);
  });

  it('each says the shared sentence, or is named with the file that says it', () => {
    const silent = pulls.filter((f) => !says(f) && !(f in SAID_BY));
    expect(silent).toEqual([]);
  });

  it('and each file named does say it — the list cannot rot', () => {
    for (const [file, sayer] of Object.entries(SAID_BY)) {
      expect({ file, drawsAPull: pulls.includes(file), sayerSays: says(sayer) })
        .toEqual({ file, drawsAPull: true, sayerSays: true });
    }
  });
});
