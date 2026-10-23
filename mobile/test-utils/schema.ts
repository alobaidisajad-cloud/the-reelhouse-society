/**
 * schema — production's tables, views and functions, read from the schema
 * snapshot (mobile/supabase/schema/live-schema.sql, which `npm run
 * schema:check` keeps equal to production). The one reader of it for the
 * tests: aQueryAsksOnlyForWhatExists holds the app's queries to it, and
 * supabaseFake holds every fake query and fixture row to it.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

/** Split at commas (or `sep`) outside brackets and quotes. */
export function topLevel(s: string, sep = ','): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (const ch of s) {
    if (quote) { if (ch === quote) quote = ''; cur += ch; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; cur += ch; continue; }
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === sep && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Where the bracket at `open` closes, strings skipped. */
export function closingOf(src: string, open: number): number {
  let depth = 0;
  let quote = '';
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '\'' || c === '"' || c === '`') { quote = c; continue; }
    if ('([{'.includes(c ?? '')) depth++;
    else if (')]}'.includes(c ?? '')) { depth--; if (depth === 0) return i; }
  }
  return src.length;
}

/** A column as the snapshot writes it: its type, and whether it may be null. */
export type Column = { type: string; notNull: boolean };

/** Table and view columns, from the snapshot (a view's types are unknown: ''). */
export function readColumns(sql: string): Map<string, Map<string, Column>> {
  const tables = new Map<string, Map<string, Column>>();
  for (const m of sql.matchAll(/CREATE (?:UNLOGGED )?TABLE public\.(\w+) \(\n([\s\S]*?)\n\);/g)) {
    const cols = new Map<string, Column>();
    for (const line of (m[2] ?? '').split('\n')) {
      // The whole line: a default can hold commas of its own (timezone('utc'::text, now())).
      const c = /^ {4}"?(\w+)"? (.+?),?$/.exec(line);
      if (!c || c[1] === 'CONSTRAINT') continue;
      const spec = c[2] ?? '';
      cols.set(c[1] ?? '', { type: (/^([a-z ]+(?:\[\])?|[\w.]+(?:\[\])?)/i.exec(spec)?.[1] ?? '').replace(/ (DEFAULT|NOT|GENERATED).*$/, '').trim(), notNull: / NOT NULL\b/.test(spec) });
    }
    tables.set(m[1] ?? '', cols);
  }
  for (const m of sql.matchAll(/CREATE (?:MATERIALIZED )?VIEW public\.(\w+)(?: WITH \([^)]*\))? AS\n([\s\S]*?);\n\n/g)) {
    // The view's columns are the names of its first select list.
    const body = m[2] ?? '';
    const start = body.search(/\bSELECT\b/i);
    let depth = 0;
    let end = -1;
    for (let i = start + 6; i < body.length; i++) {
      const ch = body[i] ?? '';
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (depth === 0 && /^\s+FROM\b/i.test(body.slice(i, i + 8)) && /\s/.test(ch)) { end = i; break; }
    }
    const list = body.slice(start + 6, end === -1 ? undefined : end).replace(/^\s*DISTINCT( ON \([^)]*\))?/i, '');
    const cols = new Map<string, Column>();
    for (const item of topLevel(list)) {
      const named = /\bAS\s+"?(\w+)"?\s*$/i.exec(item) || /(?:^|\.)"?(\w+)"?\s*$/.exec(item);
      if (named) cols.set(named[1] ?? '', { type: '', notNull: false });
    }
    tables.set(m[1] ?? '', cols);
  }
  return tables;
}

/** Table and view column names, from the snapshot. */
export function readSchema(sql: string): Map<string, Set<string>> {
  return new Map([...readColumns(sql)].map(([t, cols]) => [t, new Set(cols.keys())]));
}

export type Param = { name: string; optional: boolean };

/** Every public function's parameters, one list per overload, from the snapshot. */
export function readFunctions(sql: string): Map<string, Param[][]> {
  const out = new Map<string, Param[][]>();
  for (const m of sql.matchAll(/CREATE FUNCTION public\.(\w+)\(/g)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const params = topLevel(sql.slice(open + 1, closingOf(sql, open)))
      .filter((p) => p && !/^OUT\s/i.test(p))
      .map((p) => ({ name: (/^(?:IN\s+|INOUT\s+|VARIADIC\s+)?"?(\w+)"?\s/i.exec(p) ?? [])[1] ?? '', optional: /\bDEFAULT\b/i.test(p) }));
    out.set(m[1] ?? '', [...(out.get(m[1] ?? '') ?? []), params]);
  }
  return out;
}

/** Whether these argument names fit one overload: none it lacks, every required one given. */
export function fitsAnOverload(overloads: Param[][], keys: string[]): boolean {
  return overloads.some((ps) => keys.every((k) => ps.some((p) => p.name === k)) && ps.every((p) => p.optional || keys.includes(p.name)));
}

/** The snapshot's text, CR-free. */
/** A foreign key: `from.column` holds a `to.toColumn`, under the constraint's `name`. */
export type ForeignKey = { name: string; from: string; column: string; to: string; toColumn: string };

/** The schema's single-column foreign keys between public tables: what PostgREST embeds by. */
export function readForeignKeys(sql: string): ForeignKey[] {
  const keys: ForeignKey[] = [];
  const re = /ALTER TABLE ONLY public\.(\w+)\s+ADD CONSTRAINT (\w+) FOREIGN KEY \((\w+)\) REFERENCES public\.(\w+)\((\w+)\)/g;
  for (const [, from = '', name = '', column = '', to = '', toColumn = ''] of sql.matchAll(re)) keys.push({ from, name, column, to, toColumn });
  return keys;
}

export const SNAPSHOT_SQL = (): string => readFileSync(join(__dirname, '..', 'supabase', 'schema', 'live-schema.sql'), 'utf8').replace(/\r/g, '');
