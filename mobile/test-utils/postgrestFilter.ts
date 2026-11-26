/**
 * postgrestFilter — a PostgREST `.or()` filter and an ORDER BY, held over rows as Postgres holds them.
 *
 * A page that begins after its last row is a filter string the house reads: a wrong one returns rows,
 * some twice and some never, and throws nothing. A test that pages an in-memory table through the
 * filter the app really writes (keysetCursor.keysetAfter) sees every row once or sees what is lost.
 * Only what the keyset filters use: `col.gt|lt|eq.value`, `col.is.null`, `col.not.is.null`, and
 * `and(...)` groups, values bare digits or quoted with backslash escapes.
 */
export type Value = string | number | null;
export type Row = Record<string, Value>;

/** A PostgREST list split at its top-level commas: none inside a quote or a bracket. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let at = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quoted) {
      if (c === '\\') i += 1;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    else if (c === ',' && depth === 0) {
      out.push(s.slice(at, i));
      at = i + 1;
    }
  }
  out.push(s.slice(at));
  return out;
}

const unquote = (v: string) => (v.startsWith('"') ? v.slice(1, -1).replace(/\\(.)/g, '$1') : v);
const compare = (a: Value, b: string) => (typeof a === 'number' ? a - Number(b) : String(a) < b ? -1 : String(a) > b ? 1 : 0);

/** Whether a row is in an `.or()` filter: SQL's comparisons with a null are never true. */
export function holdsFilter(filter: string, row: Row): boolean {
  return splitTop(filter).some((term) => {
    if (term.startsWith('and(')) return splitTop(term.slice(4, -1)).every((t) => holdsFilter(t, row));
    const m = /^(\w+)\.(not\.is|is|gt|lt|eq)\.(.*)$/.exec(term);
    if (!m) throw new Error(`not a condition: ${term}`);
    const v = row[m[1]!] ?? null;
    if (m[2] === 'is') return v === null;
    if (m[2] === 'not.is') return v !== null;
    if (v === null) return false;
    const d = compare(v, unquote(m[3]!));
    return m[2] === 'gt' ? d > 0 : m[2] === 'lt' ? d < 0 : d === 0;
  });
}

/** Postgres' order with no NULLS clause: a null above every value, so last going up and first going down. */
export function postgresOrder(axes: readonly { column: string; direction: 'asc' | 'desc' }[]): (a: Row, b: Row) => number {
  return (a, b) => {
    for (const { column, direction } of axes) {
      const x = a[column] ?? null;
      const y = b[column] ?? null;
      const d = x === y ? 0 : x === null ? 1 : y === null ? -1 : x < y ? -1 : 1;
      if (d) return direction === 'asc' ? d : -d;
    }
    return 0;
  };
}
