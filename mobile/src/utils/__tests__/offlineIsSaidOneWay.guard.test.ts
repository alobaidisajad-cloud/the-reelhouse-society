/**
 * offlineIsSaidOneWay.guard.test.ts — what the app says when it keeps a write
 * for later.
 *
 * Twenty places tell a member that what they did was kept and will go when the
 * connection returns. Fifteen said it one way ("Follow saved offline. Will sync
 * when connected."), and the rest four others — "Message queued for offline
 * network transmission." among them — as if written by different apps. The
 * Dispatch keeps its own paper voice on purpose, for its two.
 *
 * A sweep, not a render: it reads every toast in the app, including screens no
 * test mounts offline.
 */
import { readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { MOBILE, readCode } from '@/test-utils/readCode';

const files: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) files.push(full);
  }
};
walk(join(MOBILE, 'src'));
walk(join(MOBILE, 'app'));

/** Every toast sentence that says a write was kept for later. */
const said = files.flatMap((f) => {
  const code = readCode(relative(MOBILE, f).split(sep).join('/'));
  return [...code.matchAll(/reelToast(?:\.\w+)?\(\s*'([^']*)'/g)]
    .map((m) => m[1])
    // Every way it has been said: a new phrasing is caught by its words, then
    // held to the house sentence below.
    .filter((s) => /offline|connected|reconnect|wire is back|queued|will sync/i.test(s))
    .map((s) => ({ file: relative(MOBILE, f).split(sep).join('/'), s }));
});

/** The house's sentence: what was kept, then what will happen. */
const HOUSE = /^[A-Z][^.]* offline\. Will [a-z ]+ when connected\.$/;
/** The Dispatch speaks in its paper voice, and only the Dispatch does. */
const PAPER = 'Filed. It goes out when the wire is back.';

describe('a write kept for later is said one way', () => {
  it('found the sentences, rather than an empty list that passes', () => {
    expect(said.length).toBeGreaterThanOrEqual(18);
  });

  it('in the house sentence — or, in the Dispatch alone, its paper one', () => {
    const odd = said.filter(({ file, s }) =>
      !(HOUSE.test(s) || (s === PAPER && /dispatch/i.test(file))));
    expect(odd).toEqual([]);
  });
});
