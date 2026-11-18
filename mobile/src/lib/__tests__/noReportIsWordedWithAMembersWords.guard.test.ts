/**
 * noReportIsWordedWithAMembersWords.guard.test.ts — review round 13
 * ─────────────────────────────────────────────────────────────────────────────
 * A follow of a handle the house no longer knew threw `new Error(\`User "${handle}" not found...\`)`,
 * and the report carried another member's handle to Sentry: its scrub cuts a check failure's row
 * and emails from an exception's words, never a handle written into them by the app itself. An
 * Error is worded by the app, and what it says leaves the phone in a report.
 *
 * Every Error the app's code words from a template is read here, and each thing written into its
 * words is named below with why it holds no member's words (a handle, an email, a review, a salon's
 * name). One that is not named fails, so a new one is read before it ships.
 */
import { relative, sep } from 'path';
import { readCode, MOBILE } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

/** What may be written into an Error's words, and why it is no member's words. */
const SAID_IN_AN_ERROR: Record<string, string> = {
  'featureId': 'useClearance.ts: a feature\'s id from gatedFeatures.ts, the code\'s own.',
  'tier': 'revenueCat.ts: the rank asked for (archivist, auteur), one of the house\'s names.',
  'error.message': 'FollowRequestService.ts: the database\'s own refusal words for a read of the door, which name no member.',
  'parsed.error.issues[0]?.path.join(\'.\')': 'LogService.ts: the path of the field that failed the schema (a column name).',
  'cleanupErrors.join(\', \')': 'auth.ts: the names of the sign-out steps that failed (push-token, stores, auth).',
  'act': 'dispatch.ts: the name of the act on a filing (certify, save), the code\'s own.',
  'where': 'mutationExecutor.ts: the name of the queued write, the code\'s own.',
  'response.status': 'mutationExecutor.ts: an HTTP status number.',
  'ms': 'raceDeadline.ts: a number of milliseconds.',
  'context': 'validateWithTelemetry.ts: the code\'s own label for what was validated.',
  'data.length': 'validateWithTelemetry.ts: a count of rows.',
};

/** Each `new Error(` worded by a template in the text: what each `${}` in its words writes. */
function writtenIntoErrors(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/new Error\(\s*`((?:[^`\\]|\\.)*)`/g)) {
    for (const part of (m[1] ?? '').matchAll(/\$\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g)) out.push((part[1] ?? '').trim());
  }
  return out;
}

const appCode = () => universe('appCode').filter((f) => !f.endsWith('.d.ts'));

it('the reader sees what an Error is worded with, and would have seen the handle', () => {
  expect(writtenIntoErrors('throw new Error(`User "${targetUsername}" not found in profiles table`);')).toEqual(['targetUsername']);
  expect(writtenIntoErrors('throw new Error(`a ${a} and ${b.c}`); new Error(\'plain\');')).toEqual(['a', 'b.c']);
});

it('no Error the app words carries anything but what is named here as no member\'s words', () => {
  const files = appCode();
  expect(files.length).toBeGreaterThanOrEqual(440);
  const unnamed: string[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    for (const written of writtenIntoErrors(readCode(f))) {
      seen.add(written);
      if (!(written in SAID_IN_AN_ERROR)) unnamed.push(`${relative(MOBILE, f).split(sep).join('/')}: \${${written}}`);
    }
  }
  expect(unnamed).toEqual([]);
  // A name no Error writes any more is struck from the list, so the list stays the whole truth.
  expect(Object.keys(SAID_IN_AN_ERROR).filter((k) => !seen.has(k))).toEqual([]);
});
