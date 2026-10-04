/**
 * Fakes the clock, hands it back, then leaves an interval running: still
 * counted (fake timers hand back what they found), and one made outside any
 * test is named as such.
 */
setTimeout(() => {}, 30_000);

it('goes back to real timers and leaves one running', () => {
  jest.useFakeTimers();
  jest.useRealTimers();
  setInterval(() => {}, 1_000);
  expect(true).toBe(true);
});
