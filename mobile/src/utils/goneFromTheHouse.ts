/**
 * goneFromTheHouse — the house's answer for a write on something no longer there.
 *
 * A record or a stack deleted meanwhile (by its owner, from the member's other phone, or by the
 * house) is answered with SQLSTATE P0002 and a word naming what is gone: 'LOG_GONE', 'STACK_GONE'.
 * It is not a refusal: before round 11 a critique on a page gone was refused as the owner's rule
 * (42501), and the member was told the owner limits who may annotate. Told apart by its word.
 */
export function isGoneFromTheHouse(e: unknown, word?: string): boolean {
  const x = e as { code?: unknown; message?: unknown } | null;
  if (x?.code !== 'P0002') return false;
  return word === undefined || x.message === word;
}
