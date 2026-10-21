/**
 * ── COUNTING, IN A HOUSE THAT PRINTS ─────────────────────────────────────────
 * The paper said `1 CRITIQUES`.
 *
 * It said it on every card carrying exactly one critique, on the ledger line of
 * every share sheet, and — worse — in the spoken labels, so a screen reader
 * announced "Critique. 1 critiques" and "1 members have certified this". Nine
 * places, all of them a count glued to a plural noun with nothing deciding
 * between the two forms. The Lounge's card said `1 SEATS TAKEN` after that, so
 * every count the app prints comes here (aCountSaysItsWord guards it).
 *
 * A house that sets its own type does not print `1 CRITIQUES`.
 *
 * The count is FORMATTED but the decision is made on the RAW number: at a
 * thousand `formatCount` returns `1K`, and `1K CRITIQUE` would be the same
 * mistake in the other direction. Only exactly one takes the singular.
 *
 * The plural is passed in rather than derived. Guessing it means guessing the
 * case as well — this page prints `CRITIQUES` in the ledger and `critiques` in
 * the spoken label — and an `+ 's'` rule is a rule that will be wrong the first
 * time somebody counts a BALLOT CAST or a PERSON.
 */
export function counted(
  n: number,
  singular: string,
  plural: string,
  format: (n: number) => string | null = String,
): string {
  return `${format(n) ?? String(n)} ${n === 1 ? singular : plural}`;
}
