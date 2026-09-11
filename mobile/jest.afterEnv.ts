/**
 * jest.afterEnv.ts — the checks that need the test framework to exist.
 *
 * jest.setup.ts is a `setupFiles` entry: it runs before jest's globals are
 * installed, so it can mock modules but cannot register `beforeEach`. Anything
 * that has to run around each test lives here instead.
 */

/**
 * ── A MOCK THAT IS MISSING A PIECE MUST NOT PASS QUIETLY ────────────────────
 * jest.setup.ts mocks the common native modules with their whole export
 * surface. A test file that re-mocks the same module WINS, and 109 local
 * factories do — several with a shorter hand-list. When the code under test
 * calls a dropped export it throws `X is not a function`, the caller's own
 * try/catch swallows it, and the suite stays green having exercised nothing:
 *
 *   followStore.persistFollowing -> setSensitive is not a function  (6 suites)
 *   socialSlice.hydrateFollowing -> data.forEach is not a function  (1 suite)
 *
 * Both were invisible for as long as they had existed. The failure always
 * surfaces as a TypeError reported through a logger, so jest.setup.ts records
 * any such text from console.warn/console.error and this fails the test that
 * produced it. Recorded and asserted afterwards rather than thrown on the spot,
 * because a throw raised inside a catch block is what an outer catch swallows
 * again.
 */
const G = globalThis as Record<string, unknown>;
const gaps = () => G.__mockGaps as string[] | undefined;

beforeEach(() => {
  const g = gaps();
  if (g) g.length = 0;
  G.__armSwallowedTypeError = undefined;
});

afterEach(() => {
  const g = gaps();
  const seen = g ? [...new Set(g)] : [];
  if (g) g.length = 0;

  // A test may declare that it RAISES such an error on purpose — see
  // src/test-support/swallowedTypeError.ts. The declaration is asserted both
  // ways, so it cannot outlive the behaviour it was written for.
  const armed = G.__armSwallowedTypeError as string | undefined;
  G.__armSwallowedTypeError = undefined;
  if (armed !== undefined) {
    if (seen.length === 0) {
      throw new Error(
        `expectSwallowedTypeError(${JSON.stringify(armed)}) was declared, but this test ` +
          'produced no such error. Either it no longer exercises that path, or the ' +
          'declaration is stale — remove it.',
      );
    }
    return;
  }

  if (seen.length === 0) return;
  throw new Error(
    'A mock is missing something the code under test actually calls, and the error ' +
      'was swallowed by a try/catch — so this test proved less than it looks like it did.\n\n  ' +
      seen.join('\n  ') +
      '\n\nFix the mock. jest.setup.ts already mocks the common modules in full; a local ' +
      'factory for the same module replaces it entirely, so it has to be just as complete. ' +
      'If the error is deliberate, say so with expectSwallowedTypeError() from ' +
      'src/test-support/swallowedTypeError.ts. Do not silence this any other way.',
  );
});
