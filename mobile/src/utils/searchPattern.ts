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
 * ── WHY , ( ) ARE TRANSFORMED RATHER THAN ESCAPED ────────────────────────────
 * Unquoting alone would trade one hole for another. Three characters belong to
 * PostgREST's filter parser and are consumed before the value exists, so no
 * escape can reach them:
 *
 *   `,`  separates predicates. A backslash does not escape it — tested, the
 *        request fails with PGRST100 and the injection still succeeds.
 *   `)`  closes the group early. A LEADING one is the dangerous placement:
 *        `or=(username.ilike.*)*)` collapses to "match everything" — 32 of 32
 *        members, measured. A `)` in the middle merely truncates, so testing it
 *        mid-word made it look harmless.
 *   `(`  opens a group, by symmetry.
 *
 * A backslash cannot rescue the parens either: `\)` reaches SQL, where it is not
 * a valid LIKE escape, and the query dies with 22025.
 *
 * Stripping them would break real searches: "Girl, Interrupted" would become
 * "Girl Interrupted", which does not match the stored title, and "Bin (2020)"
 * would lose its brackets. So each becomes `_`, LIKE's single-character
 * wildcard, which still matches the character it replaced. One character of
 * fuzziness buys a filter that cannot be rewritten. Verified: `*W_thering*`
 * matches "Wuthering Heights".
 *
 * ── THE THIRD WILDCARD, WHICH IS NOT A SQL ONE ───────────────────────────────
 * `%` and `_` are LIKE's wildcards. PostgREST adds a THIRD of its own: inside an
 * ilike value it treats `*` as an alias for `%`, whichever delimiter is used.
 * Escaping the two SQL wildcards and leaving this one live reproduces the exact
 * bug at a different character — measured after the first fix shipped:
 *
 *     member types `*`      -> or=(username.ilike.***)    -> 32 of 32 members
 *     member types `sa*ad`  -> matched 3, none of them literal
 *
 * A backslash does escape it (verified: `*sa\*ad*` -> 0, `*\**` -> 0), so it is
 * escaped alongside the other two. Every printable ASCII character was then swept
 * against production to confirm no fourth wildcard exists.
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

  // The structural characters become wildcards below, so a term made only of
  // them would match everything. Refuse it rather than run it.
  if (trimmed.replace(/[(),\s]/g, '').length === 0) return null;

  // Literals, not a shared module-level regex: a /g regex carries mutable state
  // between calls, and that has produced alternating answers here before.
  return trimmed
    .replace(/\\/g, '\\\\')   // our own escape character, first
    .replace(/%/g, '\\%')     // LIKE's "any run of characters"
    .replace(/_/g, '\\_')     // LIKE's "any single character"
    .replace(/\*/g, '\\*')    // PostgREST's OWN alias for % — see below
    .replace(/[(),]/g, '_');  // the characters .or()'s parser owns — see below
}
