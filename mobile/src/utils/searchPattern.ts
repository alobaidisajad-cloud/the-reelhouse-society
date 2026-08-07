/**
 * searchPattern.ts — the one place a member's search text becomes a query
 * ──────────────────────────────────────────────────────────────────────
 * Every database search in the app goes through `buildSearchPattern`. It returns
 * the body of an ILIKE pattern, or `null` when the text carries nothing worth
 * searching for — the null is deliberate, so a caller cannot forget the case.
 *
 * ── WHY THE OLD ONE DID NOTHING ──────────────────────────────────────────────
 * The previous version escaped `%` and `_` correctly and then the call sites
 * wrapped the result in double quotes. Measured against production (32 members,
 * exactly 4 with a literal underscore in their name):
 *
 *     or=(username.ilike."%\_%")   quoted   -> 32   the escape is swallowed
 *     or=(username.ilike.*\_%)     unquoted ->  4   the escape survives
 *
 * PostgREST consumes the backslash inside a quoted value before SQL ever sees
 * it, so no number of backslashes helps — 1 and 2 were both tested. Searching
 * for `_` matched every member; searching for `%` matched everything.
 *
 * ── AND THE QUOTES LET THE FILTER BE REWRITTEN ───────────────────────────────
 * The old version also doubled `"` to `""`. A term that re-opens the quote at
 * the end balances the template and injects a second predicate. Measured live:
 *
 *     honest search for "zzqq"                     ->  0 members
 *     zzqq",id.not.is.null,username.ilike."%zzqq   -> 32 members
 *
 * It cannot reach past row-level security — private rows stayed hidden, and
 * filters ANDed outside the group survived — but the search filter itself was
 * defeated, so the doubling is gone.
 *
 * ── WHY THE COMMA IS TRANSFORMED RATHER THAN ESCAPED ─────────────────────────
 * Unquoting alone would trade one hole for another: a bare comma separates
 * predicates, and a backslash does NOT escape it (tested — PGRST100, and the
 * injection still succeeded). The comma is the only character that cannot be
 * made literal inside `.or()`.
 *
 * Stripping it would break real searches: a member typing "Girl, Interrupted"
 * would get "Girl Interrupted", which does not match the stored title. So a
 * comma becomes `_`, LIKE's single-character wildcard, which still matches the
 * comma it replaced. One character of fuzziness buys a filter that cannot be
 * rewritten. Verified: `*W_thering*` matches "Wuthering Heights".
 *
 * ── AND WHY A TERM CAN BE REFUSED ────────────────────────────────────────────
 * That transform has one edge: a term of nothing but commas becomes nothing but
 * wildcards, and `___` matches every name of three characters or more (measured:
 * 32 of 32). An empty term does the same. Both are refused at the source.
 *
 * Every claim above was executed against the live database, not reasoned about.
 */

/**
 * Build the body of an ILIKE pattern from a member's search text.
 *
 * Callers interpolate the result **without quotes**:
 *   `.or(\`title.ilike.*${pattern}*,description.ilike.*${pattern}*\`)`
 *   `.ilike('film_title', \`%${pattern}%\`)`
 *
 * @returns the pattern body, or `null` when there is nothing to search for —
 *          in which case the caller must not run a query at all.
 */
export function buildSearchPattern(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim();

  // Commas become wildcards below, so a term made only of commas and spaces
  // would match everything. Refuse it rather than run it.
  if (trimmed.replace(/[,\s]/g, '').length === 0) return null;

  // Literals, not a shared module-level regex: a /g regex carries mutable state
  // between calls, and that has produced alternating answers here before.
  return trimmed
    .replace(/\\/g, '\\\\')   // our own escape character, first
    .replace(/%/g, '\\%')     // LIKE's "any run of characters"
    .replace(/_/g, '\\_')     // LIKE's "any single character"
    .replace(/,/g, '_');      // the one character .or() cannot quote
}
