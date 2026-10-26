/**
 * Every sign-out goes through endSession (P4.1).
 *
 * A `signOut` the server never heard keeps the stored session, so one called anywhere else could
 * leave a member signed in after they signed out. Read from the app's files: a call outside
 * src/lib/endSession.ts is named here by file.
 */
import { readFileSync } from 'fs';
import { relative, sep } from 'path';
import { MOBILE, stripComments } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

const HOME = 'src/lib/endSession.ts';

/** The files outside the helper that call `auth.signOut(`. */
function signOutsOutside(files: string[]): string[] {
  return files
    .map((f) => ({ rel: relative(MOBILE, f).split(sep).join('/'), text: stripComments(readFileSync(f, 'utf8')) }))
    .filter(({ rel, text }) => rel !== HOME && /\.auth\s*\.\s*signOut\s*\(/.test(text))
    .map(({ rel }) => rel);
}

it('no file but endSession signs a session out', () => {
  const files = universe('appCode').filter((f) => !f.endsWith('.d.ts'));
  expect(files.length).toBeGreaterThanOrEqual(440);
  expect(signOutsOutside(files)).toEqual([]);
  // The helper itself is read, and does call it: the check above would pass on a missing home.
  expect(/\.auth\.signOut\(/.test(readFileSync(`${MOBILE}/${HOME}`, 'utf8'))).toBe(true);
});
