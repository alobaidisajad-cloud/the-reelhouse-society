/**
 * Compile-time type tests for branded types and unions.
 * These tests verify that incorrect usage produces type errors.
 * Run via: tsc --noEmit src/types/__tests__/branded.typetest.ts
 */
import { createFilmId, createListId, createLogId, createUserId, FilmId, ListId, UserId } from '../branded';
import { assertNever, MutationState } from '../unions';

// ── Test: Branded types are not assignable to each other ──

function acceptsUserId(id: UserId): void { void id; }
function acceptsFilmId(id: FilmId): void { void id; }
function acceptsListId(id: ListId): void { void id; }

// Valid: branded types accepted by their own parameter type
const userId = createUserId('550e8400-e29b-41d4-a716-446655440000');
acceptsUserId(userId); // OK

const filmId = createFilmId(42);
acceptsFilmId(filmId); // OK

// Invalid: cross-type assignment is a compile error
// @ts-expect-error FilmId is not assignable to UserId
acceptsUserId(filmId);

// @ts-expect-error UserId is not assignable to FilmId
acceptsFilmId(userId);

// @ts-expect-error raw string is not assignable to UserId
acceptsUserId('raw-string');

// @ts-expect-error raw number is not assignable to FilmId
acceptsFilmId(42);

const listId = createListId('550e8400-e29b-41d4-a716-446655440001');
// @ts-expect-error ListId is not assignable to UserId
acceptsUserId(listId);

// ── Test: Exhaustive union checking ──

function handleState(state: MutationState): string {
  switch (state.status) {
    case 'pending': return 'pending';
    case 'executing': return 'executing';
    case 'completed': return 'completed';
    case 'failed': return 'failed';
    case 'dead_letter': return 'dead_letter';
    default: return assertNever(state); // OK — all cases handled
  }
}

// Verify the function compiles
void handleState;

// Suppress unused variable warnings
void acceptsListId;
void createLogId;
