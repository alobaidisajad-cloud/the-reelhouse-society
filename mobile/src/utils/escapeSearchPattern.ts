/**
 * escapeSearchPattern.ts — LIKE/ILIKE Metacharacter Neutralizer
 * ─────────────────────────────────────────────────────────────
 * Escapes SQL LIKE pattern metacharacters (%, _, \) so user
 * input is treated as literal text in PostgreSQL ILIKE queries.
 *
 * Also escapes PostgREST CSV-style double-quotes to prevent
 * filter expression breakout in .or() string expressions.
 *
 * Why this matters:
 *   Without escaping, a user searching for "100%" matches every
 *   row (% is the LIKE wildcard). "_____" matches any 5-char
 *   title. Both are wildcard amplification vectors that cause
 *   full table scans and expose unintended data.
 *
 * Order of operations matters:
 *   1. Backslash first (prevents double-escaping our own escapes)
 *   2. Then % and _ (LIKE wildcards)
 *   3. Then PostgREST CSV double-quotes last
 *
 * The backslash is PostgreSQL's default LIKE escape character
 * when standard_conforming_strings = on (Supabase default).
 */
export function escapeSearchPattern(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\')   // 1. Escape literal backslashes
    .replace(/%/g, '\\%')     // 2. Escape LIKE % wildcard
    .replace(/_/g, '\\_')     // 3. Escape LIKE _ wildcard
    .replace(/"/g, '""');     // 4. Escape PostgREST CSV quotes
}
