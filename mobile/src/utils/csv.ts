/**
 * csv.ts — Safe CSV cell encoding.
 *
 * Two concerns, one pass:
 *  1. Formula injection — a cell whose value begins with =, +, -, @, TAB or CR
 *     is evaluated as a formula by Excel / Google Sheets / LibreOffice when the
 *     exported file is opened. An attacker who controls a field (e.g. a film
 *     title or review) could smuggle in =HYPERLINK(...) / =cmd|... payloads.
 *     We neutralize this by prefixing a single quote, which forces the cell to
 *     be treated as literal text.
 *  2. RFC-4180 quoting — wrap in double quotes and double any embedded quotes
 *     so commas, quotes and newlines inside a value don't corrupt the row.
 */

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * Encode an arbitrary value as a single, fully-quoted, injection-safe CSV cell.
 */
export function escapeCsvCell(value: unknown): string {
  let s = value == null ? '' : String(value);
  if (FORMULA_TRIGGER.test(s)) {
    s = `'${s}`;
  }
  return `"${s.replace(/"/g, '""')}"`;
}
