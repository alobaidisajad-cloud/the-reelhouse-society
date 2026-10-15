/**
 * aBuildNamesOnlyWhatProductionHas.release-test.ts — run by the build's
 * pre-flight (scripts/eas-build-preflight.cjs), never by the ordinary suite.
 *
 * main may carry an app that names what a pending migration makes
 * (everyNameAClientCallsExists.test.ts allows it). A build may not: it would
 * put in members' hands a call production cannot answer. So before any build,
 * every name the app asks for must be in production's snapshot, and a pending
 * one is named with the migration that must be applied first.
 */
import { readFileSync } from 'fs';
import { relative } from 'path';
import { callsIn, FILES, fromTheApp, inProduction, pendingMaker, REPO } from './clientNames';

it('the app names only what production has: no build before its migrations are applied', () => {
  const calls = FILES.flatMap((f) => callsIn(relative(REPO, f).replace(/\\/g, '/'), readFileSync(f, 'utf8')))
    .filter(fromTheApp);
  expect(calls.length).toBeGreaterThan(100);
  expect(calls.filter((c) => !inProduction(c))
    .map((c) => `${c.at}  ${c.kind} ${c.name}${pendingMaker(c) ? `  (apply ${pendingMaker(c)} first)` : ''}`))
    .toEqual([]);
});
