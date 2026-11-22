/**
 * readAsFar — a list read again as far as the member had read it, not its first page alone.
 *
 * A list drawn page by page and read again (a verdict given, a member lifted, an appeal heard) by its
 * first page alone loses every page the member read after it. Read this way it comes back as long as
 * it was, from the house: what left meanwhile is gone, and what stayed is in its place.
 * The house gives a page of at most `page` rows, so a list read further is read page after page.
 */

/**
 * Pages read from the start until `want` rows are held or the house gives a short page. A read whose
 * pages meet on their boundary row (asked from it, not past it) names each row by `idOf`: held once.
 */
export async function readAsFar<T, C>(
  read: (after: NoInfer<C> | undefined, size: number) => Promise<T[]>,
  after: (last: T) => C,
  want: number,
  page: number,
  idOf?: (row: T) => string,
): Promise<T[]> {
  const rows: T[] = [];
  const held = new Set<string>();
  let cursor: C | undefined;
  for (;;) {
    const got = await read(cursor, page);
    const before = rows.length;
    for (const row of got) {
      const id = idOf?.(row);
      if (id === undefined) rows.push(row);
      else if (!held.has(id)) { held.add(id); rows.push(row); }
    }
    const last = got[got.length - 1];
    // A page that brought nothing new (all its rows on one boundary) ends the read: never asked forever.
    if (got.length < page || rows.length >= want || last === undefined || rows.length === before) return rows;
    cursor = after(last);
  }
}

/** Whether the house may hold more past a read made of whole pages: its last page was full. */
export const moreMayFollow = (rows: readonly unknown[], page: number) => rows.length > 0 && rows.length % page === 0;
