/**
 * The one sanctioned way to tell the mock-gap trap that a TypeError is the point.
 *
 * jest.afterEnv.ts fails any test whose code logged `X is not a function` and
 * carried on, because that is how a mock missing an export hides inside a
 * try/catch. A handful of tests raise such an error DELIBERATELY — feeding a
 * store a malformed server payload to prove the catch reports it — and they say
 * so by calling this.
 *
 * The declaration is itself asserted: if the test does not actually produce a
 * swallowed TypeError, the trap fails it for claiming one. So this can never
 * become a blanket silencer sitting on a test that stopped exercising the path.
 */
export function expectSwallowedTypeError(reason: string): void {
  (globalThis as Record<string, unknown>).__armSwallowedTypeError = reason;
}
