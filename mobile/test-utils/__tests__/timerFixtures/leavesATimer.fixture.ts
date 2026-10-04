/** Leaves a timer waiting: the environment must fail this file, by name. */
it('starts a minute it does not wait out', () => {
  setTimeout(() => {}, 60_000);
  expect(true).toBe(true);
});
