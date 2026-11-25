/**
 * Two tests, the second leaving its state behind: forwards, the first reads the state as the file
 * set it and passes; backwards (JEST_BACKWARDS=1), the second runs first, and the first fails.
 * The environment must run this file both ways (aTestRunsInEitherOrder.guard.test.ts).
 */
let mockSeen = 0;

it('reads the state as the file set it', () => {
  expect(mockSeen).toBe(0);
});

it('leaves its state behind', () => {
  mockSeen = 1;
  expect(mockSeen).toBe(1);
});
