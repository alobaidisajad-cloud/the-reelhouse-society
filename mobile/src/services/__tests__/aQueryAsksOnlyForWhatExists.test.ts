/**
 * aQueryAsksOnlyForWhatExists.test.ts — every query the house sends names a
 * table and columns that exist.
 * ─────────────────────────────────────────────────────────────────────────────
 * A private salon's roster asked for `lounge_members.created_at`; the column is
 * `joined_at`. PostgREST answered 400 to every room for three months, so no one
 * could ask to enter a private salon and no host saw who was waiting. The
 * website's notices asked for `read`; the column is `is_read`, so its bell was
 * always empty. Every test passed: a mocked client accepts any column, and the
 * contract test checked a select list copied by hand.
 *
 * So the queries are read from the source itself — the app, the website and the
 * edge functions — and each table, column, filter, order and written key is
 * looked up in the schema snapshot, which `npm run schema:check` keeps equal to
 * production. A query is followed through the steps that build it, and its
 * column lists through the constants and functions they are made of. What the
 * reader cannot evaluate is counted, never passed. A row written from a
 * variable is not read here: only a literal object's keys are.
 *
 * A function is held the same way: the website asked get_lounge_unread_counts
 * for a `p_user_id` it does not take, was refused on every call, and never
 * showed a salon's unread count. Every `.rpc(…)` names only arguments an
 * overload of its function takes, and every argument one requires.
 *
 * everyNameAClientCallsExists holds the names — tables, functions, buckets;
 * this holds what each query asks of its table.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { readCode, stripComments } from '@/test-utils/readCode';

const MOBILE = join(__dirname, '..', '..', '..');
const REPO = join(MOBILE, '..');
const SCHEMA = readFileSync(join(MOBILE, 'supabase', 'schema', 'live-schema.sql'), 'utf8').replace(/\r/g, '');

/** Split at commas outside brackets and quotes. */
function topLevel(s: string, sep = ','): string[] {
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

/** Table and view columns, from the snapshot. */
function readSchema(sql: string): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  for (const m of sql.matchAll(/CREATE (?:UNLOGGED )?TABLE public\.(\w+) \(\n([\s\S]*?)\n\);/g)) {
    const set = new Set<string>();
    for (const line of m[2].split('\n')) {
      const c = /^ {4}"?(\w+)"? /.exec(line);
      if (c && c[1] !== 'CONSTRAINT') set.add(c[1]);
    }
    tables.set(m[1], set);
  }
  for (const m of sql.matchAll(/CREATE (?:MATERIALIZED )?VIEW public\.(\w+)(?: WITH \([^)]*\))? AS\n([\s\S]*?);\n\n/g)) {
    // The view's columns are the names of its first select list.
    const body = m[2];
    const start = body.search(/\bSELECT\b/i);
    let depth = 0;
    let end = -1;
    for (let i = start + 6; i < body.length; i++) {
      const ch = body[i];
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (depth === 0 && /^\s+FROM\b/i.test(body.slice(i, i + 8)) && /\s/.test(ch)) { end = i; break; }
    }
    const list = body.slice(start + 6, end === -1 ? undefined : end).replace(/^\s*DISTINCT( ON \([^)]*\))?/i, '');
    const set = new Set<string>();
    for (const item of topLevel(list)) {
      const named = /\bAS\s+"?(\w+)"?\s*$/i.exec(item) || /(?:^|\.)"?(\w+)"?\s*$/.exec(item);
      if (named) set.add(named[1]);
    }
    tables.set(m[1], set);
  }
  return tables;
}

/** The text of a query chain: from `.from('t')` to the end of its statement. */
function chainAt(src: string, from: number): string {
  let depth = 0;
  let quote = '';
  for (let i = from; i < src.length; i++) {
    const ch = src[i];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = ''; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; continue; }
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) { depth--; if (depth < 0) return src.slice(from, i); }
    if (depth === 0 && (ch === ';' || ch === ',')) return src.slice(from, i);
    if (depth === 0 && ch === '\n' && !/^\s*\./.test(src.slice(i + 1, i + 200))) return src.slice(from, i);
  }
  return src.slice(from);
}

/**
 * String constants the queries are built from, by name, across every file read:
 * a column list is usually a const in one file and a select in another. A name
 * defined twice with different text is ambiguous and resolves to nothing.
 */
const DEFINITIONS = new Map<string, string | null>();

/** The expression that starts at `from`, to the end of its statement. */
function expressionAt(src: string, from: number): string {
  let depth = 0;
  let quote = '';
  for (let i = from; i < src.length; i++) {
    const ch = src[i];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = ''; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; continue; }
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) { if (depth === 0) return src.slice(from, i); depth--; }
    if (depth === 0 && ch === ';') return src.slice(from, i);
    if (depth === 0 && ch === '\n') {
      const before = src.slice(from, i).trimEnd();
      const after = src.slice(i + 1).trimStart();
      if (!/(=>|[+?:=(,])$/.test(before) && !/^[+.?:]/.test(after)) return src.slice(from, i);
    }
  }
  return src.slice(from);
}

/**
 * What every file defines that a query may be built from: string constants and
 * functions that return a column list, by name. A name defined twice with
 * different text is ambiguous and evaluates to nothing.
 */
function learnDefinitions(src: string) {
  const learn = (name: string, expr: string) => {
    const known = DEFINITIONS.get(name);
    DEFINITIONS.set(name, known === undefined || known === expr ? expr : null);
  };
  // a type annotation may hold `=>`, never a lone `=`
  for (const m of src.matchAll(/\bconst ([A-Za-z_$][\w$]*)(?:\s*:\s*(?:[^=;]|=>)+?)?\s*=(?!>)\s*/g)) {
    learn(m[1], expressionAt(src, m.index + m[0].length).trim());
  }
  for (const m of src.matchAll(/\bfunction ([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::\s*[\w<>[\]| ]+)?\s*\{/g)) {
    // a function's value is any of the things it returns
    const open = m.index + m[0].length - 1;
    const body = src.slice(open + 1, closingOf(src, open));
    const returns = [...body.matchAll(/\breturn\s+/g)].map((r) => expressionAt(body, r.index + r[0].length).trim());
    if (returns.length) learn(m[1], returns.length === 1 ? returns[0] : `(${returns.join(') ?? (')})`);
  }
}

/** Marks a part of a query the reader could not evaluate. */
const UNKNOWN = '\u0000';

/**
 * Every value a string expression can take: literals, templates, `+`, a
 * ternary's two branches, `??`, `.replace(a, b)`, and the names and calls of
 * what learnDefinitions found. A part it cannot evaluate becomes UNKNOWN —
 * never dropped, so a query built from it is counted as unread.
 */
function valuesOf(expr: string, src: string, seen = 0): string[] {
  const e = expr.trim().replace(/\s+as const$/, '').replace(/\s+as string$/, '');
  if (seen > 8 || !e) return [UNKNOWN];
  const cap = (xs: string[]) => [...new Set(xs)].slice(0, 32);
  const q = indexAtTop(e, '?');
  if (q !== -1 && e[q + 1] === '?') {
    // a ?? b — either
    return cap([...valuesOf(e.slice(0, q), src, seen + 1), ...valuesOf(e.slice(q + 2), src, seen + 1)]);
  }
  if (q !== -1 && e[q + 1] !== '.') {
    // cond ? a : b — both branches
    const c = indexAtTop(e, ':', q + 1);
    if (c !== -1) return cap([...valuesOf(e.slice(q + 1, c), src, seen + 1), ...valuesOf(e.slice(c + 1), src, seen + 1)]);
  }
  const parts = topLevel(e, '+');
  if (parts.length > 1) {
    return cap(parts.reduce<string[]>((acc, p) => {
      const vs = valuesOf(p, src, seen + 1);
      return acc.flatMap((a) => vs.map((v) => a + v));
    }, ['']));
  }
  if (/^\(.*\)$/s.test(e) && closesAtEnd(e)) return valuesOf(e.slice(1, -1), src, seen + 1);
  const lit = /^(['"])((?:\\.|(?!\1)[^\\])*)\1$/s.exec(e);
  if (lit) return [lit[2]];
  if (/^`[\s\S]*`$/.test(e) && closesAtEnd(e, '`')) {
    // a template: its ${…} parts, each with every value it can take
    const pieces: string[][] = [];
    let i = 1;
    let text = '';
    while (i < e.length - 1) {
      if (e[i] === '$' && e[i + 1] === '{') {
        pieces.push([text]); text = '';
        let depth = 1; let j = i + 2;
        for (; j < e.length && depth > 0; j++) { if (e[j] === '{') depth++; if (e[j] === '}') depth--; }
        pieces.push(valuesOf(e.slice(i + 2, j - 1), src, seen + 1));
        i = j;
      } else { text += e[i]; i++; }
    }
    pieces.push([text]);
    return cap(pieces.reduce<string[]>((acc, vs) => acc.flatMap((a) => vs.map((v) => a + v)), ['']));
  }
  // [a, b, cond ? c : null].filter(Boolean).join(', ') — every list it can make
  const joined = /^\[([\s\S]*)\](?:\.filter\(Boolean\))?\.join\(\s*(['"])(.*?)\2\s*\)$/.exec(e);
  if (joined) {
    const lists = topLevel(joined[1]).reduce<string[][]>((acc, el) => {
      const vs = /^(null|undefined|false|'')$/.test(el) ? [''] : valuesOf(el.replace(/\s*:\s*(null|undefined)$/, ' : ""'), src, seen + 1).map((v) => (v === 'null' ? '' : v));
      return acc.flatMap((a) => vs.map((v) => [...a, v]));
    }, [[]]);
    return cap(lists.map((l) => l.filter((v) => v !== '').join(joined[3])));
  }
  const replace = /^([\s\S]+)\.replace\(\s*(['"])((?:(?!\2).)*)\2\s*,\s*(['"])((?:(?!\4).)*)\4\s*,?\s*\)$/s.exec(e);
  if (replace) return valuesOf(replace[1], src, seen + 1).map((v) => v.replace(replace[3], replace[5]));
  // `axis.column` of `const axis = sortAxis(sort, 'title')`: any column SORT_AXES names, or that title column
  const member = /^([A-Za-z_$][\w$]*)\.column$/.exec(e);
  if (member) {
    const def = definitionOf(member[1], src);
    const sorted = def && /^sortAxis\(([\s\S]*)\)$/.exec(def);
    const axes = DEFINITIONS.get('SORT_AXES');
    if (!sorted || !axes) return [UNKNOWN];
    const title = topLevel(sorted[1])[1];
    return cap([...[...axes.matchAll(/column:\s*'(\w+)'/g)].map((a) => a[1]), ...(title ? valuesOf(title, src, seen + 1) : [UNKNOWN])]);
  }
  const call = /^([A-Za-z_$][\w$]*)\s*\(([\s\S]*)\)$/.exec(e);
  const name = call ? call[1] : /^[A-Za-z_$][\w$]*$/.test(e) ? e : null;
  if (name) {
    const def = definitionOf(name, src);
    if (def === null) return [UNKNOWN];
    // an arrow function: the value of its body
    const arrow = /^(?:async\s+)?\(?[^)=]*\)?\s*(?::\s*[\w<>[\]| ]+)?\s*=>\s*([\s\S]+)$/.exec(def);
    if (arrow) return call ? valuesOf(arrow[1], src, seen + 1) : [UNKNOWN];
    return valuesOf(def, src, seen + 1);
  }
  return [UNKNOWN];
}

/** Where the bracket at `open` closes, strings skipped. */
function closingOf(src: string, open: number): number {
  let depth = 0;
  let quote = '';
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '\'' || c === '"' || c === '`') { quote = c; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { depth--; if (depth === 0) return i; }
  }
  return src.length;
}

function indexAtTop(e: string, ch: string, from = 0): number {
  let depth = 0;
  let quote = '';
  for (let i = from; i < e.length; i++) {
    const c = e[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '\'' || c === '"' || c === '`') { quote = c; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (depth === 0 && c === ch) return i;
  }
  return -1;
}

/** Whether the bracket (or backtick) that opens `e` is the one that closes it. */
function closesAtEnd(e: string, quote = ''): boolean {
  if (quote) {
    for (let i = 1; i < e.length; i++) {
      if (e[i] === '\\') { i++; continue; }
      if (e[i] === '$' && e[i + 1] === '{') {
        let depth = 1;
        for (i += 2; i < e.length && depth > 0; i++) { if (e[i] === '{') depth++; if (e[i] === '}') depth--; }
        i--;
        continue;
      }
      if (e[i] === quote) return i === e.length - 1;
    }
    return false;
  }
  let depth = 0;
  for (let i = 0; i < e.length; i++) {
    if (e[i] === '(') depth++;
    if (e[i] === ')') { depth--; if (depth === 0 && i < e.length - 1) return false; }
  }
  return true;
}

/** Where in its file the query being read starts. */
let readingAt = Infinity;

function definitionOf(name: string, src: string): string | null {
  // the nearest definition above the query being read, as scope would find it
  const all = [...src.matchAll(new RegExp(`\\bconst ${name.replace(/\$/g, '\\$')}(?:\\s*:\\s*(?:[^=;]|=>)+?)?\\s*=(?!>)\\s*`, 'g'))];
  const m = all.filter((d) => d.index < readingAt).pop() ?? all[0];
  if (m) return expressionAt(src, m.index + m[0].length).trim();
  return DEFINITIONS.get(name) ?? null;
}

/** Every value a call's string argument can take; UNKNOWN marks what could not be read. */
function stringArg(arg: string, src: string): string[] {
  return valuesOf(arg, src);
}

/** How deep in brackets each character of a chain sits (strings count as their opening depth). */
function depths(chain: string): number[] {
  const out: number[] = [];
  let depth = 0;
  let quote = '';
  for (let i = 0; i < chain.length; i++) {
    const ch = chain[i];
    out.push(depth);
    if (quote) { if (ch === '\\') { i++; out.push(depth); } else if (ch === quote) quote = ''; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') quote = ch;
    else if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
  }
  return out;
}

/** The arguments of each call to `.name(` made by the chain itself — not by a query nested in a callback. */
function argsOf(chain: string, name: string): string[][] {
  const out: string[][] = [];
  const level = depths(chain);
  for (const m of chain.matchAll(new RegExp(`\\.${name}\\(`, 'g'))) {
    if (level[m.index] !== 0) continue;
    let depth = 1;
    let quote = '';
    let i = m.index + m[0].length;
    const start = i;
    for (; i < chain.length && depth > 0; i++) {
      const ch = chain[i];
      if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = ''; continue; }
      if (ch === '\'' || ch === '"' || ch === '`') quote = ch;
      else if (ch === '(') depth++;
      else if (ch === ')') depth--;
    }
    out.push(topLevel(chain.slice(start, i - 1)));
  }
  return out;
}

export type Finding = string;

/** Every way the queries in one file (its code, comments blanked) name something the schema does not hold. */
export function readQueries(src: string, where: string, tables: Map<string, Set<string>>, unread: string[]): Finding[] {
  const found: Finding[] = [];
  let at = where;
  const cannotRead = () => { if (!unread.includes(at)) unread.push(at); };
  const columnOf = (table: string, raw: string, how: string) => {
    const col = raw.split('->')[0].trim();
    if (col.includes(UNKNOWN)) { cannotRead(); return; }
    const dotted = /^(\w+)\.(\w+)$/.exec(col);
    if (dotted && tables.has(dotted[1])) {
      if (!tables.get(dotted[1])!.has(dotted[2])) found.push(`${at}: ${how} ${col} does not exist`);
      return;
    }
    if (!/^\w+$/.test(col)) { cannotRead(); return; }
    if (!tables.get(table)!.has(col)) found.push(`${at}: ${how} ${table}.${col} does not exist`);
  };
  const selectList = (table: string, list: string) => {
    for (let item of topLevel(list.replace(/\s+/g, ' '))) {
      if (!item || item === '*') continue;
      item = item.replace(/^\.\.\./, '');
      const embed = /^(?:\w+:)?(\w+)(?:!\w+)*\s*\(([\s\S]*)\)$/.exec(item);
      if (embed) {
        if (/^\s*count\s*$/.test(embed[2]) && !tables.has(embed[1])) continue;
        if (!tables.has(embed[1])) { found.push(`${at}: embeds ${embed[1]}, which is not a table`); continue; }
        selectList(embed[1], embed[2]);
        continue;
      }
      item = item.replace(/^\w+:/, '').replace(/::\w+$/, '').replace(/\.\w+\(\)$/, '');
      if (item === 'count' || item === 'count()') continue;
      columnOf(table, item, 'selects');
    }
  };
  const columnsIn = (arg: string | undefined, table: string, how: string) => {
    if (!arg) return;
    for (const v of stringArg(arg, src)) columnOf(table, v, how);
  };
  const readChain = (table: string, chain: string) => {
    for (const [arg] of argsOf(chain, 'select')) {
      if (arg) for (const list of stringArg(arg, src)) selectList(table, list);
    }
    for (const name of ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'like', 'ilike', 'contains', 'containedBy', 'overlaps', 'not', 'textSearch']) {
      for (const [arg] of argsOf(chain, name)) columnsIn(arg, table, 'filters on');
    }
    for (const [arg, opts] of argsOf(chain, 'order')) {
      const other = opts && /(?:referencedTable|foreignTable)\s*:\s*['"`](\w+)['"`]/.exec(opts);
      if (other && !tables.has(other[1])) { found.push(`${at}: orders through ${other[1]}, which is not a table`); continue; }
      columnsIn(arg, other ? other[1] : table, 'orders by');
    }
    for (const [arg] of argsOf(chain, 'or')) {
      // the column names of an or-filter; the values may be anything
      if (arg) for (const filter of stringArg(arg, src)) {
        for (const f of filter.matchAll(/(?:^|[,(])(\w+)\.(?:not\.)?(?:eq|neq|gt|gte|lt|lte|is|in|like|ilike|cs|cd|ov)\./g)) columnOf(table, f[1], 'filters on');
      }
    }
    for (const name of ['insert', 'update', 'upsert']) {
      for (const [arg, opts] of argsOf(chain, name)) {
        // a literal object's keys; a row built elsewhere is read where it is built, by its type
        const obj = arg && /^\s*\[?\s*\{([\s\S]*)\}\s*\]?\s*$/.exec(arg);
        if (obj) {
          for (const part of topLevel(obj[1])) {
            if (part.startsWith('...')) continue;
            const key = /^(?:(\w+)|['"](\w+)['"])\s*(?::|$)/.exec(part);
            if (key) columnOf(table, key[1] ?? key[2], `${name}s`); else cannotRead();
          }
        }
        const conflict = opts && /onConflict\s*:\s*['"`]([\w, ]+)['"`]/.exec(opts);
        if (conflict) for (const c of conflict[1].split(',')) columnOf(table, c.trim(), 'conflicts on');
      }
    }
  };
  for (const m of src.matchAll(/\.from\(\s*(['"`])(\w+)\1\s*\)/g)) {
    // the storage API has a .from() too: a bucket, not a table
    if (/storage\s*$/.test(src.slice(Math.max(0, m.index - 40), m.index))) continue;
    const table = m[2];
    at = `${where}:${src.slice(0, m.index).split('\n').length}`;
    if (!tables.has(table)) { found.push(`${at}: ${table} is not a table or view`); continue; }
    const chain = chainAt(src, m.index + m[0].length);
    readingAt = m.index;
    readChain(table, chain);
    // A query built in steps: `let q = supabase.from(t)…` and later `q = q.order(…)`.
    // Read every step on that name, up to the next time the name is declared.
    const lead = src.slice(Math.max(0, m.index - 300), m.index);
    const named = /(?:\b(?:let|const|var)\s+|(?:^|[;{}]\s*|\n\s*))(\w+)(?:\s*:[^=;]*)?\s*=\s*(?:await\s+)?(?:[\w.]+\(\s*)*supabase\s*$/.exec(lead);
    if (named && named[1] !== 'supabase') {
      const name = named[1];
      const after = m.index + m[0].length + chain.length;
      const next = new RegExp(`\\b(?:let|const|var)\\s+${name}\\b|\\b${name}\\s*=\\s*(?:await\\s+)?(?:[\\w.]+\\(\\s*)*supabase\\b`, 'g');
      next.lastIndex = after;
      const end = next.exec(src)?.index ?? src.length;
      const step = new RegExp(`(?<![.\\w])${name}(?=\\s*\\.\\s*\\w+\\s*\\()`, 'g');
      step.lastIndex = after;
      for (let s = step.exec(src); s && s.index < end; s = step.exec(src)) {
        readingAt = s.index;
        readChain(table, chainAt(src, s.index + name.length));
      }
    }
  }
  readingAt = Infinity;
  return found;
}

type Param = { name: string; optional: boolean };

/** Every public function's parameters, one list per overload, from the snapshot. */
function readFunctions(sql: string): Map<string, Param[][]> {
  const out = new Map<string, Param[][]>();
  for (const m of sql.matchAll(/CREATE FUNCTION public\.(\w+)\(/g)) {
    const open = m.index + m[0].length - 1;
    const params = topLevel(sql.slice(open + 1, closingOf(sql, open)))
      .filter((p) => p && !/^OUT\s/i.test(p))
      .map((p) => ({ name: (/^(?:IN\s+|INOUT\s+|VARIADIC\s+)?"?(\w+)"?\s/i.exec(p) ?? [])[1] ?? '', optional: /\bDEFAULT\b/i.test(p) }));
    out.set(m[1], [...(out.get(m[1]) ?? []), params]);
  }
  return out;
}

/**
 * Every `.rpc('fn', { … })` whose arguments no overload of the function takes:
 * PostgREST matches a call by its argument NAMES, so a name the function does
 * not have, or a required one left out, is refused — every time.
 */
export function readCalls(src: string, where: string, functions: Map<string, Param[][]>, unread: string[]): Finding[] {
  const found: Finding[] = [];
  for (const m of src.matchAll(/\.rpc\(\s*(['"`])(\w+)\1/g)) {
    const at = `${where}:${src.slice(0, m.index).split('\n').length}`;
    const overloads = functions.get(m[2]);
    if (!overloads) continue; // everyNameAClientCallsExists holds the name
    const [, arg] = argsOf(src.slice(m.index, closingOf(src, m.index + 4) + 1), 'rpc')[0] ?? [];
    let keys: string[] = [];
    if (arg) {
      const obj = /^\s*\{([\s\S]*)\}\s*$/.exec(arg);
      if (!obj) { if (!unread.includes(at)) unread.push(at); continue; }
      const parts = topLevel(obj[1]).filter(Boolean);
      const named = parts.map((p) => (/^(?:(\w+)|['"](\w+)['"])\s*(?::|$)/.exec(p) ?? []).slice(1).find(Boolean));
      if (named.some((k) => !k)) { if (!unread.includes(at)) unread.push(at); continue; }
      keys = named as string[];
    }
    const fits = overloads.some((ps) => keys.every((k) => ps.some((p) => p.name === k)) && ps.every((p) => p.optional || keys.includes(p.name)));
    if (!fits) {
      const takes = overloads.map((ps) => `(${ps.map((p) => p.name + (p.optional ? '?' : '')).join(', ')})`).join(' or ');
      found.push(`${at}: ${m[2]}(${keys.join(', ')}) — it takes ${takes}`);
    }
  }
  return found;
}

function sourcesUnder(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (!['__tests__', 'test', 'node_modules', 'test-support'].includes(e)) sourcesUnder(p, out);
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(e) && !/\.(test|spec)\./.test(e)) out.push(p);
  }
  return out;
}

const tables = readSchema(SCHEMA);
const functions = readFunctions(SCHEMA);
const files = [
  ...sourcesUnder(join(MOBILE, 'src')),
  ...sourcesUnder(join(MOBILE, 'app')),
  ...sourcesUnder(join(MOBILE, 'supabase', 'functions')),
  ...sourcesUnder(join(REPO, 'src')),
  ...sourcesUnder(join(REPO, 'api')),
  ...sourcesUnder(join(REPO, 'supabase', 'functions')),
];

describe('the schema snapshot is read whole', () => {
  it('knows the tables and the views, with their columns', () => {
    expect(tables.size).toBeGreaterThan(40);
    expect([...tables.get('lounge_members')!]).toEqual(expect.arrayContaining(['user_id', 'status', 'joined_at']));
    expect(tables.get('lounge_members')!.has('created_at')).toBe(false);
    expect(tables.get('notifications')!.has('is_read')).toBe(true);
    // a view, by its output names
    expect(tables.get('dossier_comments')!.size).toBeGreaterThan(3);
  });
});

describe('the reader can say no', () => {
  const read = (src: string) => readQueries(src, 'x.ts', tables, []);
  it('finds a column that does not exist, in a select, a filter, an order and a write', () => {
    expect(read(`supabase.from('lounge_members').select('user_id, created_at').eq('lounge_id', id)`)).toEqual(['x.ts:1: selects lounge_members.created_at does not exist']);
    expect(read(`supabase.from('notifications').update({ read: true }).eq('read', false)`)).toEqual([
      'x.ts:1: filters on notifications.read does not exist',
      'x.ts:1: updates notifications.read does not exist',
    ]);
    expect(read(`supabase.from('lists').select('id').order('rank', { ascending: true })`)).toEqual(['x.ts:1: orders by lists.rank does not exist']);
    expect(read(`supabase.from('lounge_members').select('user_id, profiles!lounge_members_user_id_fkey(username, handle)')`)).toEqual(['x.ts:1: selects profiles.handle does not exist']);
    expect(read(`supabase.from('no_such_room').select('*')`)).toEqual(['x.ts:1: no_such_room is not a table or view']);
  });
  it('follows a query built in steps, a constant built from parts, and both sides of a choice', () => {
    expect(read(`let q = supabase.from('lists').select('id');\nq = q.order('rank', { ascending: true });`)).toEqual(['x.ts:1: orders by lists.rank does not exist']);
    expect(read(`const COLS = 'id, ' +\n  'titel';\nsupabase.from('lists').select(COLS)`)).toEqual(['x.ts:3: selects lists.titel does not exist']);
    expect(read(`supabase.from('lists').select(mine ? 'id' : 'titel')`)).toEqual(['x.ts:1: selects lists.titel does not exist']);
    expect(read(`supabase.from('lists').upsert([{\n  id,\n  titel: name,\n}])`)).toEqual(['x.ts:1: upserts lists.titel does not exist']);
  });
  it('counts what it cannot read, and never passes it', () => {
    const unread: string[] = [];
    expect(readQueries(`supabase.from('lists').select(columnsFor(kind))`, 'x.ts', tables, unread)).toEqual([]);
    expect(unread).toEqual(['x.ts:1']);
  });
  it('finds a function called with arguments it does not take', () => {
    const unread: string[] = [];
    const call = (src: string) => readCalls(stripComments(src, 'x.ts'), 'x.ts', functions, unread);
    expect(call(`supabase.rpc('get_lounge_unread_counts', { p_user_id: user.id })`)).toEqual(['x.ts:1: get_lounge_unread_counts(p_user_id) — it takes ()']);
    expect(call(`supabase.rpc('accept_follow_request', {})`)).toEqual(['x.ts:1: accept_follow_request() — it takes (requester_id)']);
    expect(call(`supabase.rpc('accept_follow_request', {\n  requester_id, // the one at the door\n})`)).toEqual([]);
    expect(call(`supabase.rpc('get_lounge_unread_counts')`)).toEqual([]);
    expect(unread).toEqual([]);
    expect(call(`supabase.rpc('accept_follow_request', args)`)).toEqual([]);
    expect(unread).toEqual(['x.ts:1']);
  });
  it('and passes what is there', () => {
    expect(read(`supabase.from('lounge_members').select('user_id, status, joined_at, profiles!lounge_members_user_id_fkey(username, avatar_url)').eq('lounge_id', id).order('joined_at', { ascending: true })`)).toEqual([]);
    expect(read(`supabase.storage.from('avatars').upload(path, file)`)).toEqual([]);
  });
});

describe('every query in the house', () => {
  const unread: string[] = [];
  // as code: comments blanked by the TypeScript parser, every position kept
  const texts = files.map((f) => readCode(f));
  texts.forEach(learnDefinitions);
  const where = (f: string) => relative(REPO, f).split('\\').join('/');
  const found = files.flatMap((f, i) => readQueries(texts[i], where(f), tables, unread));
  const calledWrong = files.flatMap((f, i) => readCalls(texts[i], where(f), functions, unread));

  it('reads the app, the website and the functions', () => {
    expect(files.length).toBeGreaterThan(600);
    expect(files.some((f) => f.includes(join('mobile', 'src', 'stores', 'lounge.ts')))).toBe(true);
    expect(files.some((f) => f.endsWith(join('src', 'components', 'NotificationBell.tsx')) && !f.includes('mobile'))).toBe(true);
  });

  it('names only tables and columns that exist', () => {
    expect(found).toEqual([]);
  });

  it('calls every function with the arguments it takes', () => {
    expect(functions.get('accept_follow_request')).toEqual([[{ name: 'requester_id', optional: false }]]);
    expect(calledWrong).toEqual([]);
  });

  it('can read every query it finds', () => {
    // a query with a part the reader cannot evaluate is made readable, never allowed
    expect(unread).toEqual([]);
  });
});
