/**
 * Discriminated union patterns and exhaustive checking utilities.
 *
 * This module provides reusable patterns for TypeScript discriminated unions
 * with compile-time exhaustiveness enforcement. Adding a new variant to a
 * union causes compile errors at every unhandled switch/if-else site — the
 * compiler drives you to every location that needs updating.
 *
 * @example
 * ```typescript
 * import { assertNever, MutationState } from '@/src/types/unions';
 *
 * function handleMutation(state: MutationState): string {
 *   switch (state.status) {
 *     case 'pending': return `Queued at ${state.enqueuedAt}`;
 *     case 'executing': return `Running since ${state.startedAt}`;
 *     case 'completed': return `Done at ${state.completedAt}`;
 *     case 'failed': return `Error: ${state.error} (retry ${state.retryCount})`;
 *     case 'dead_letter': return `Dead: ${state.reason}`;
 *     default: return assertNever(state);
 *   }
 * }
 * ```
 */

// ─── Exhaustive Check Utility ────────────────────────────────────────────────

/**
 * Exhaustive type check helper for discriminated union switch statements.
 *
 * Place in the `default` case of a switch over a discriminated union's
 * discriminant field. If every variant is handled, TypeScript narrows the
 * value to `never` and this compiles cleanly. If a variant is unhandled,
 * the value is NOT `never` and a compile error is produced — forcing you
 * to handle the new case.
 *
 * At runtime, if somehow reached (e.g., untyped JavaScript caller), throws
 * an informative error with the unexpected value serialized.
 *
 * @param x - The value that should be unreachable (narrowed to `never`)
 * @param message - Optional custom error message
 * @returns Never — always throws if actually called
 *
 * @example
 * ```typescript
 * switch (state.status) {
 *   case 'pending': break;
 *   case 'completed': break;
 *   default: assertNever(state); // Compile error if a case is missing
 * }
 * ```
 */
export function assertNever(x: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(x)}`);
}

// ─── MutationState Discriminated Union ───────────────────────────────────────

/**
 * Represents the lifecycle states of an offline mutation in the queue.
 *
 * This is a discriminated union on the `status` field. Each variant carries
 * only the data relevant to that state — no optional fields, no null checks.
 * The pattern ensures:
 *
 * 1. **Type narrowing** — after checking `status`, TypeScript knows exactly
 *    which fields are available without casts.
 * 2. **Exhaustiveness** — adding a new status forces handling everywhere
 *    the union is switched over (when paired with `assertNever`).
 * 3. **Self-documenting** — the union definition IS the state machine spec.
 *
 * @example
 * ```typescript
 * function getTimestamp(state: MutationState): number {
 *   switch (state.status) {
 *     case 'pending': return state.enqueuedAt;
 *     case 'executing': return state.startedAt;
 *     case 'completed': return state.completedAt;
 *     case 'failed': return Date.now();
 *     case 'dead_letter': return Date.now();
 *     default: return assertNever(state);
 *   }
 * }
 * ```
 */
export type MutationState =
  | { status: 'pending'; payload: unknown; enqueuedAt: number }
  | { status: 'executing'; payload: unknown; startedAt: number }
  | { status: 'completed'; result: unknown; completedAt: number }
  | { status: 'failed'; error: string; retryCount: number }
  | { status: 'dead_letter'; error: string; reason: 'schema_invalid' | 'max_retries' | 'unknown' };
