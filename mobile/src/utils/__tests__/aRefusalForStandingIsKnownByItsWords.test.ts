/**
 * aRefusalForStandingIsKnownByItsWords.test.ts — utils/refusedForStanding.ts: the server's two
 * sentences for a write refused for the member's standing are known whole and alone, their edges'
 * spaces aside; only the suspension's is one that ends; anything else, or nothing, is neither.
 */
import { isStandingRefusal, isSuspensionRefusal } from '../refusedForStanding';

const SILENCED = 'Your account has been silenced by The Society.';
const SUSPENDED = 'Your account is suspended until 04 Oct 2026 18:00 UTC.';

it('knows both sentences as a refusal for standing, and only the suspension as one that ends', () => {
  expect([isStandingRefusal(SILENCED), isStandingRefusal(SUSPENDED)]).toEqual([true, true]);
  expect([isSuspensionRefusal(SILENCED), isSuspensionRefusal(SUSPENDED)]).toEqual([false, true]);
  expect([isStandingRefusal(`  ${SUSPENDED}\n`), isSuspensionRefusal(`  ${SUSPENDED}\n`)]).toEqual([true, true]);
});

it('takes each sentence whole: nothing before it, nothing after it, a date inside the suspension', () => {
  for (const said of [`Error: ${SILENCED}`, `${SILENCED} And more`, `Note: ${SUSPENDED}`, `${SUSPENDED} Appeal`, 'Your account is suspended until .']) {
    expect([said, isStandingRefusal(said), isSuspensionRefusal(said)]).toEqual([said, false, false]);
  }
});

it('is neither for any other refusal, or for what is not words', () => {
  for (const said of ['new row violates row-level security policy for table "logs"', '', null, undefined, 42, { message: SUSPENDED }]) {
    expect([isStandingRefusal(said), isSuspensionRefusal(said)]).toEqual([false, false]);
  }
});
