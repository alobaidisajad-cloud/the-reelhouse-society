/**
 * Two tests, the first leaving a mark in flight in the marks' ledger, as a write queued with no signal
 * does: whichever runs first, the other begins with the ledger empty (jest.afterEnv.ts). Run in each
 * order by aMarkIsNeverLeftToTheNextTest.guard.test.ts, never by the suite itself.
 */
import { beginTap, tappedSince } from '@/src/stores/markCounts';

it('leaves a mark in flight', () => {
  beginTap('note', 'a-viewing', 1);
  expect(tappedSince('note', 'a-viewing', 0)).toBe(true);
});

it('sees no mark it did not make', () => {
  expect(tappedSince('note', 'a-viewing', 0)).toBe(false);
});
