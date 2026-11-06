/**
 * order.ts — the two ways the app puts text in order (WORKLIST P4.52).
 * ─────────────────────────────────────────────────────────────────────────────
 * A machine's key (an instant as the house writes it, an id, a region or shelf
 * code) is ordered by its characters' codes: the order Postgres gives such keys,
 * and the same on every phone. A title is ordered as a reader alphabetises it, by
 * the phone's own collation, with no locale and no options (the phone has no
 * Intl to ask for one), which is close to the order Postgres gives a visitor's
 * shelf.
 *
 * ESLint lets localeCompare be called here alone; the tests run on Hermes as well
 * (scripts/hermes-suites.cjs).
 */

/** Two keys a machine wrote, by their characters' codes. */
export const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Two titles, as a reader alphabetises them. */
export const byTitle = (a: string, b: string): number => a.localeCompare(b);
