/**
 * houseFunctions — every function of the house's public schema as production will hold it: the
 * schema snapshot's, each replaced, made or dropped by the migrations production has not had yet,
 * in name order (PENDING_SQL). The reader of function bodies for the finders that judge what the
 * house says and computes (aDayIsReadOnItsOwnCalendar).
 *
 * A function is known by its name and its arguments' types, as Postgres knows it: a migration's
 * CREATE OR REPLACE of the same name and types replaces it, another list of types is an overload.
 */
import { PENDING_SQL, SNAPSHOT_SQL, topLevel } from './schema';

export type HouseFunction = {
  /** The function's name, without its schema. */
  name: string;
  /** Its arguments' types, lower case, comma separated: its identity beside its name. */
  types: string;
  /** Its body, between its dollar quotes. */
  body: string;
  /** Where production's copy will come from: the snapshot, or a pending migration. */
  from: 'snapshot' | 'pending';
};

const MODES = new Set(['in', 'out', 'inout', 'variadic']);

/** One argument's type: its mode, name and default taken away. */
function typeOf(arg: string): string {
  const words = arg.replace(/\s+DEFAULT\s[\s\S]*$/i, '').replace(/\s*=[\s\S]*$/, '').trim().split(/\s+/);
  if (MODES.has((words[0] ?? '').toLowerCase())) words.shift();
  if (words.length > 1) words.shift();
  return words.join(' ').toLowerCase().replace(/^public\./, '');
}

/** Where the parenthesis opening at `open` closes. */
function closeOf(sql: string, open: number): number {
  let depth = 0;
  for (let i = open; i < sql.length; i++) {
    const c = sql[i];
    if (c === '\'') { i = sql.indexOf('\'', i + 1); if (i < 0) return sql.length; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
  }
  return sql.length;
}

type Act = { key: string; at: number; fn?: Omit<HouseFunction, 'from'> };

/** What a SQL text does to the functions, in its own order: each one it makes (with `fn`) or drops. */
function actsIn(sql: string): Act[] {
  const made: Act[] = [];
  const dropped: Act[] = [];
  for (const m of sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION (?:public\.)?"?(\w+)"?\s*\(/gi)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const close = closeOf(sql, open);
    const types = topLevel(sql.slice(open + 1, close)).map(typeOf).join(', ');
    const as = /\bAS\s+(\$\w*\$)/gi;
    as.lastIndex = close;
    const a = as.exec(sql);
    if (!a) continue;
    const start = a.index + a[0].length;
    const end = sql.indexOf(a[1] ?? '', start);
    const name = (m[1] ?? '').toLowerCase();
    made.push({ key: `${name}(${types})`, at: m.index ?? 0, fn: { name, types, body: sql.slice(start, end < 0 ? sql.length : end) } });
  }
  for (const m of sql.matchAll(/DROP FUNCTION (?:IF EXISTS )?(?:public\.)?"?(\w+)"?\s*\(/gi)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const types = topLevel(sql.slice(open + 1, closeOf(sql, open))).map(typeOf).join(', ');
    dropped.push({ key: `${(m[1] ?? '').toLowerCase()}(${types})`, at: m.index ?? 0 });
  }
  return [...made, ...dropped].sort((x, y) => x.at - y.at);
}

let held: HouseFunction[] | null = null;

/** Every public function as production will hold it once the pending migrations are applied. */
export function houseFunctions(): HouseFunction[] {
  if (held) return held;
  const byKey = new Map<string, HouseFunction>();
  const apply = (sql: string, from: HouseFunction['from']) => {
    for (const a of actsIn(sql)) {
      if (a.fn) byKey.set(a.key, { ...a.fn, from });
      else byKey.delete(a.key);
    }
  };
  apply(SNAPSHOT_SQL(), 'snapshot');
  apply(PENDING_SQL(), 'pending');
  held = [...byKey.values()].sort((x, y) => (x.name === y.name ? (x.types < y.types ? -1 : 1) : x.name < y.name ? -1 : 1));
  return held;
}

/** A function body with its comments taken out, so a finder judges code and never a word about it. */
export function codeOf(body: string): string {
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\'') { const end = body.indexOf('\'', i + 1); out += body.slice(i, end < 0 ? body.length : end + 1); i = end < 0 ? body.length : end; continue; }
    if (c === '-' && body[i + 1] === '-') { const nl = body.indexOf('\n', i); out += ' '; i = nl < 0 ? body.length : nl - 1; continue; }
    if (c === '/' && body[i + 1] === '*') { const end = body.indexOf('*/', i + 2); out += ' '; i = end < 0 ? body.length : end + 1; continue; }
    out += c;
  }
  return out;
}
