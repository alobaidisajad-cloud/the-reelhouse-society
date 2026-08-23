/**
 * keysetCursor — multi-axis keyset pagination, in one place.
 *
 * Three of the profile's queries page by cursor, and each carries a sort that
 * can move the ordering axis: sort by title and the cursor must be keyed on
 * TITLE, or page two returns rows page one already showed. The Watchlist had
 * this written out by hand; the Vault and the Stacks are about to need the same
 * thing, and a third copy is how the three quietly stop agreeing.
 *
 * ── WHY A CURSOR AND NOT AN OFFSET ────────────────────────────────────────────
 * `.range(50, 99)` re-reads the first fifty rows on every page and shifts under
 * any insert. A keyset cursor asks for "everything after this exact row", so
 * deep scroll costs the same as the first page and nothing is skipped when the
 * member catalogues something while scrolling.
 *
 * ── THE TIE-BREAKER IS NOT OPTIONAL ───────────────────────────────────────────
 * Two films can share a title and two rows can share a timestamp. Ordering on
 * the primary axis alone leaves their relative order undefined between queries,
 * so a row can appear on both pages or on neither. Every axis here is paired
 * with `id`.
 *
 * ── QUOTING ───────────────────────────────────────────────────────────────────
 * The cursor value goes into a PostgREST `.or()` string, where an unescaped `"`
 * ends the value early and the rest is parsed as filter syntax. A film titled
 * `2001: A Space Odyssey "Director's Cut"` is not hypothetical. PostgREST
 * doubles an embedded quote, the same as SQL.
 */

export type CursorDirection = 'asc' | 'desc';

/** A row's ordering value is a string on every axis these queries use. */
export interface CursorParts {
  primary: string;
  id: string;
}

/**
 * Split a `"<primary>|<id>"` cursor.
 *
 * The primary is joined back from everything before the LAST separator, because
 * a film title may itself contain a `|` — splitting on the first would truncate
 * the title and page from the wrong place.
 */
export function parseCursor(cursor: string | undefined | null): CursorParts | null {
  if (!cursor) return null;
  const parts = String(cursor).split('|');
  if (parts.length < 2) return null;
  const id = parts[parts.length - 1];
  const primary = parts.slice(0, -1).join('|');
  if (!id) return null;
  return { primary, id };
}

/** Build the cursor for the next page from the last row actually returned. */
export function buildCursor(primary: unknown, id: unknown): string {
  return `${primary ?? ''}|${id ?? ''}`;
}

/**
 * A PostgREST literal.
 *
 * A bare integer stays bare — quoting it is harmless but makes the filter
 * harder to read in a log. Everything else is quoted, with embedded quotes
 * doubled.
 */
export function pgLiteral(value: string): string {
  if (/^\d+$/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * The `.or()` filter that asks for every row strictly after the cursor.
 *
 * `(primary > p) OR (primary = p AND id > i)` — the standard keyset predicate,
 * flipped to `<` when the sort descends. Returns null for an unusable cursor so
 * the caller falls back to the first page rather than paging from nowhere.
 */
export function keysetFilter(
  column: string,
  cursor: CursorParts | null,
  direction: CursorDirection,
): string | null {
  if (!cursor) return null;
  const op = direction === 'asc' ? 'gt' : 'lt';
  const p = pgLiteral(cursor.primary);
  const i = pgLiteral(cursor.id);
  return `${column}.${op}.${p},and(${column}.eq.${p},id.${op}.${i})`;
}

/**
 * The axis a sort orders by. Shared so a query's ORDER BY, its cursor filter
 * and the cursor it hands back can never name three different columns — which
 * is the failure that makes deep scroll duplicate rows, and it is silent.
 */
export interface SortAxis {
  column: string;
  direction: CursorDirection;
}

export const SORT_AXES: Record<'default' | 'az' | 'za', (titleColumn: string) => SortAxis> = {
  default: () => ({ column: 'created_at', direction: 'desc' }),
  az: (titleColumn: string) => ({ column: titleColumn, direction: 'asc' }),
  za: (titleColumn: string) => ({ column: titleColumn, direction: 'desc' }),
};

/** Resolve a sort to its axis, defaulting to newest-first for anything unknown. */
export function sortAxis(sort: string | undefined | null, titleColumn: string): SortAxis {
  const build = SORT_AXES[(sort ?? 'default') as keyof typeof SORT_AXES] ?? SORT_AXES.default;
  return build(titleColumn);
}
