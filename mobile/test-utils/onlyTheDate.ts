/**
 * onlyTheDate — what jest's fake timers leave real when a test sets the date and nothing else.
 *
 *   jest.useFakeTimers({ now: new Date('2026-10-03T12:00:00Z'), doNotFake: ALL_BUT_THE_DATE });
 *
 * `Date.now()` and `new Date()` answer the moment given, and stand still there; every timer, the
 * microtasks and the forward clock stay real, so an awaited `setTimeout` still ends. A test whose
 * verdict hangs on the day reads a day it set (aTestReadsAClockItHasSet.test.ts); `jest.useRealTimers()`
 * gives the real date back.
 */
type StaysReal = 'nextTick' | 'queueMicrotask' | 'setImmediate' | 'clearImmediate' | 'setTimeout' | 'clearTimeout' | 'setInterval'
  | 'clearInterval' | 'requestAnimationFrame' | 'cancelAnimationFrame' | 'requestIdleCallback' | 'cancelIdleCallback' | 'hrtime' | 'performance';

export const ALL_BUT_THE_DATE: StaysReal[] = [
  'nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'hrtime', 'performance',
];
