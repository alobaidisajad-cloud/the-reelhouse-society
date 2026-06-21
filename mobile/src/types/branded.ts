/**
 * Branded type system for compile-time ID safety.
 *
 * Prevents accidental mixing of structurally identical but semantically
 * different ID types (e.g., passing a FilmId where a UserId is expected).
 * Zero runtime overhead — brands are erased at compile time.
 *
 * @example
 * ```typescript
 * const userId = createUserId('550e8400-e29b-41d4-a716-446655440000');
 * const filmId = createFilmId(42);
 *
 * // Type error: FilmId is not assignable to UserId
 * followUser(filmId);
 * ```
 */
import { z } from 'zod';

// Phantom brand symbol — never exists at runtime
declare const __brand: unique symbol;

/**
 * Utility type that brands a base type T with a unique string literal B.
 * The brand field is purely a compile-time construct (phantom type).
 */
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ─── Branded Type Aliases ────────────────────────────────────────────────────

/** A UUID string branded as a user identifier. */
export type UserId = Brand<string, 'UserId'>;

/** A positive integer branded as a film identifier (TMDB ID). */
export type FilmId = Brand<number, 'FilmId'>;

/** A UUID string branded as a list identifier. */
export type ListId = Brand<string, 'ListId'>;

/** A UUID string branded as a log entry identifier. */
export type LogId = Brand<string, 'LogId'>;

// ─── Zod Schemas (produce branded types from raw values) ─────────────────────

/** Validates UUID format and produces a branded UserId. */
export const UserIdSchema = z.string().uuid().transform((s) => s as UserId);

/** Validates positive integer and produces a branded FilmId. */
export const FilmIdSchema = z.number().int().positive().transform((n) => n as FilmId);

/** Validates UUID format and produces a branded ListId. */
export const ListIdSchema = z.string().uuid().transform((s) => s as ListId);

/** Validates UUID format and produces a branded LogId. */
export const LogIdSchema = z.string().uuid().transform((s) => s as LogId);

// ─── Factory Functions (shorthand for schema.parse) ──────────────────────────

/**
 * Creates a branded UserId from a raw string.
 *
 * @param raw - A UUID string to brand as a UserId
 * @returns A branded UserId value
 * @throws {ZodError} if the string is not a valid UUID
 *
 * @example
 * ```typescript
 * const userId = createUserId('550e8400-e29b-41d4-a716-446655440000');
 * ```
 */
export const createUserId = (raw: string): UserId => UserIdSchema.parse(raw);

/**
 * Creates a branded FilmId from a raw number.
 *
 * @param raw - A positive integer to brand as a FilmId (TMDB ID)
 * @returns A branded FilmId value
 * @throws {ZodError} if the number is not a positive integer
 *
 * @example
 * ```typescript
 * const filmId = createFilmId(550);
 * ```
 */
export const createFilmId = (raw: number): FilmId => FilmIdSchema.parse(raw);

/**
 * Creates a branded ListId from a raw string.
 *
 * @param raw - A UUID string to brand as a ListId
 * @returns A branded ListId value
 * @throws {ZodError} if the string is not a valid UUID
 *
 * @example
 * ```typescript
 * const listId = createListId('7c9e6679-7425-40de-944b-e07fc1f90ae7');
 * ```
 */
export const createListId = (raw: string): ListId => ListIdSchema.parse(raw);

/**
 * Creates a branded LogId from a raw string.
 *
 * @param raw - A UUID string to brand as a LogId
 * @returns A branded LogId value
 * @throws {ZodError} if the string is not a valid UUID
 *
 * @example
 * ```typescript
 * const logId = createLogId('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
 * ```
 */
export const createLogId = (raw: string): LogId => LogIdSchema.parse(raw);
