/**
 * savedVersion — how a saved store opens what an older build saved (P4.11).
 *
 * The saved stores had no version: an update that changed what one saves would open the old shape
 * as the new, and draw it wrong or not at all. Each now names its version. Version 0 is what the
 * builds in members' hands saved, before stores had versions; version 1 is that same shape, named,
 * so it is carried as it is. A change to a store's saved shape bumps that store's version and
 * writes the step from the one before; savedStoresAreVersioned.guard.test.ts refuses a store with
 * no version, no migration, or no saved fixture of the last release's shape.
 */

/** The version every saved store is at: the shape the last release saved, named. */
export const SAVED_VERSION = 1;

/**
 * Version 0 (the last release, unversioned) to 1: one shape, carried as it is. One saved by a later
 * build (a member who went back a version) is carried too, never wiped.
 */
export function carriedForward<T>(persisted: unknown): T {
  return persisted as T;
}
