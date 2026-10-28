/**
 * supabaseFake — the house as the app's Supabase client meets it, as strict as
 * the real one (TST-05, TST-06, TST-10).
 *
 * A hand-made mock answers whatever it is asked: a column production does not
 * have, an rpc argument its function does not take, `[]` to every read, no
 * error from `.single()` when there is no row, ten thousand rows where
 * PostgREST sends a thousand. Each passed a test while the app was wrong in
 * production (the salon roster read a missing column for three months). This
 * fake refuses what production refuses:
 *   · a table, view or column the schema snapshot does not have (nor a table a
 *     migration not yet applied makes, which a build ships beside), in a select,
 *     a filter, an order or a row written; an rpc whose arguments no overload
 *     takes; a fixture row with a column the table lacks, or an id that is not
 *     a uuid where the column is one (each throws, naming it);
 *   · a read of a table the test never said what it holds (no silent `[]`);
 * and answers as PostgREST does:
 *   · `.single()` with no row or several is PGRST116; `.maybeSingle()` with
 *     several is too; a read is capped at 1,000 rows (the project's max-rows);
 *     `.range(a, b)` and `.limit(n)` take their rows; `count: 'exact'` counts
 *     before the cap; filters, `.order()`, and writes change what later reads
 *     find.
 *
 *   const mockHouse = supabaseFake({ rows: { logs: [ ... ] }, rpc: { claim_founding_seat: true } });
 *   jest.mock('@/src/lib/supabase', () => ({ supabase: mockHouse.client }));
 *   mockHouse.asked   // every query made, in order
 *
 * What it cannot read (an `or()` filter, a `contains`) it refuses too, unless
 * the test answers that table itself with `answer: { table: (ask) => rows }`.
 *
 * Its `auth.mfa` is the account's second factors (`mfa: { code, factors, level }`),
 * refusing what the auth server refuses (mfaFake, below).
 */
import { fitsAnOverload, PENDING_SQL, readColumns, readForeignKeys, readFunctions, SNAPSHOT_SQL, topLevel, type Column, type ForeignKey } from './schema';

type Row = Record<string, unknown>;
type Failure = { code: string; message: string };
/** What a query answers, as the client hands it back: data is whatever the rows are, as supabase-js types it. */
export type Answer = { data: any; error: Failure | null; count: number | null };
type Filter = (column: string, value: unknown) => Query;
/** A query, as the client builds it: each step returns it, and it is awaited for its answer. */
export interface Query extends PromiseLike<Answer> {
  select(columns?: string, options?: { count?: 'exact'; head?: boolean }): Query;
  eq: Filter; neq: Filter; gt: Filter; gte: Filter; lt: Filter; lte: Filter; is: Filter; in: Filter; like: Filter; ilike: Filter;
  not(column: string, op: string, value: unknown): Query;
  or(filters: string): Query;
  contains(column: string, value: unknown): Query;
  order(column: string, options?: { ascending?: boolean }): Query;
  range(from: number, to: number): Query;
  limit(n: number): Query;
  abortSignal(signal: AbortSignal): Query;
  insert(values: Row | Row[]): Query;
  upsert(values: Row | Row[], options?: unknown): Query;
  update(values: Row): Query;
  delete(): Query;
  single(): Promise<Answer>;
  maybeSingle(): Promise<Answer>;
}
export type Ask = {
  table: string; op: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  columns: string[]; filters: [string, string, unknown][]; order: [string, boolean][];
  range: [number, number] | null; limit: number | null; one: 'single' | 'maybeSingle' | null;
  values: Row[] | null; count: boolean; head: boolean; selects: boolean;
  /** The embeds the select names, resolved by their keys (embedsOf). */
  embeds?: Embed[];
  /** Each `or()` filter's text, as the client wrote it: read by a test that answers the table itself. */
  ors?: string[];
};
type Options = {
  /** What each table holds: checked against its columns. A table not named here cannot be read. */
  rows?: Record<string, Row[]>;
  /** A table whose every query fails with this. */
  fail?: Record<string, Failure>;
  /**
   * A table whose every answer came with an empty body (a gateway's bare 404, an empty 2xx):
   * no data and no error, as postgrest-js reads it, even from `.single()`.
   */
  silent?: Record<string, true>;
  /** A table the test answers itself, from the query. */
  answer?: Record<string, (ask: Ask) => Row[] | Failure>;
  /** Each rpc's answer: a value, or a function of its arguments; `{ error }` fails it. */
  rpc?: Record<string, unknown>;
  /** The account's second factors (supabase.auth.mfa). A test that never says cannot ask. */
  mfa?: MfaWorld;
  /** Whose session the phone holds (supabase.auth.getSession), or none. A test that never says cannot ask. */
  session?: { userId: string } | null;
};

/** One second factor, as the auth server lists it. */
export interface FakeFactor { id: string; factor_type: 'totp'; status: 'verified' | 'unverified'; friendly_name: string }
type MfaCall = 'level' | 'list' | 'enroll' | 'unenroll' | 'verify';
/**
 * The account's second factors, as the auth server holds them (WORKLIST P0.94): the session's
 * level, its factors, the code the authenticator shows now, and any call that fails (its error,
 * handed back as supabase-js hands it, never thrown).
 */
export interface MfaWorld {
  level?: 'aal1' | 'aal2';
  factors?: FakeFactor[];
  code: string;
  fail?: Partial<Record<MfaCall, Failure>>;
}

/** The secret every key the fake registers holds (a base32 key, as the server sends one). */
export const FAKE_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

/**
 * supabase.auth.mfa, as strict as the auth server: a second key of one name is refused
 * (mfa_factor_name_conflict); a factor it does not hold is mfa_factor_not_found; a confirmed key
 * is removed only by a session that gave it (insufficient_aal); a code that is not the
 * authenticator's is mfa_verification_failed. A code taken confirms its key and lifts the
 * session to aal2.
 */
function mfaFake(world: MfaWorld | undefined) {
  let level = world?.level ?? 'aal1';
  const factors = (world?.factors ?? []).map((f) => ({ ...f }));
  let made = 0;
  const asked: { call: MfaCall; args: Row }[] = [];
  const fault = (code: string, message: string): Failure => ({ code, message });
  const isFailure = (v: unknown): v is Failure => typeof v === 'object' && v !== null && 'code' in v && 'message' in v && Object.keys(v).length === 2;
  const answer = (call: MfaCall, args: Row, data: () => unknown): Promise<{ data: any; error: Failure | null }> => {
    if (!world) throw new Error('supabaseFake: the test never said what second factors the account holds (mfa)');
    asked.push({ call, args });
    const failed = world.fail?.[call];
    if (failed) return Promise.resolve({ data: null, error: failed });
    const out = data();
    return Promise.resolve(isFailure(out) ? { data: null, error: out } : { data: out, error: null });
  };
  const mfa = {
    getAuthenticatorAssuranceLevel: () => answer('level', {}, () => ({
      currentLevel: level,
      nextLevel: factors.some((f) => f.status === 'verified') ? 'aal2' : level,
      currentAuthenticationMethods: [],
    })),
    listFactors: () => answer('list', {}, () => ({
      all: factors.map((f) => ({ ...f })),
      totp: factors.filter((f) => f.status === 'verified').map((f) => ({ ...f })),
      phone: [],
    })),
    enroll: (args: { factorType: string; friendlyName?: string; issuer?: string }) => answer('enroll', args, () => {
      if (args.factorType !== 'totp') return fault('validation_failed', `the fake registers totp keys, not ${args.factorType}`);
      const name = args.friendlyName ?? '';
      if (factors.some((f) => f.friendly_name === name)) return fault('mfa_factor_name_conflict', `A factor with the friendly name "${name}" for this user already exists`);
      made += 1;
      const id = `00000000-0000-4000-8000-${String(made).padStart(12, '0')}`;
      factors.push({ id, factor_type: 'totp', status: 'unverified', friendly_name: name });
      const issuer = encodeURIComponent(args.issuer ?? 'house');
      return { id, type: 'totp', friendly_name: name, totp: { qr_code: '<svg/>', secret: FAKE_SECRET, uri: `otpauth://totp/${issuer}:member?secret=${FAKE_SECRET}&issuer=${issuer}` } };
    }),
    unenroll: (args: { factorId: string }) => answer('unenroll', args, () => {
      const i = factors.findIndex((f) => f.id === args.factorId);
      if (i < 0) return fault('mfa_factor_not_found', 'Factor not found');
      if (factors[i]?.status === 'verified' && level !== 'aal2') return fault('insufficient_aal', 'AAL2 required to unenroll verified factor');
      factors.splice(i, 1);
      return { id: args.factorId };
    }),
    challengeAndVerify: (args: { factorId: string; code: string }) => answer('verify', args, () => {
      const f = factors.find((x) => x.id === args.factorId);
      if (!f) return fault('mfa_factor_not_found', 'Factor not found');
      if (args.code !== world?.code) return fault('mfa_verification_failed', 'Invalid TOTP code entered');
      f.status = 'verified';
      level = 'aal2';
      return { access_token: 'aal2', token_type: 'bearer', expires_in: 3600, refresh_token: 'refresh', user: null };
    }),
  };
  return { mfa, asked, factors: () => factors.map((f) => ({ ...f })), level: () => level };
}

/** The project's max-rows: PostgREST never sends more in one answer. */
export const MAX_ROWS = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_ONE: Failure = { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' };

let schema: { tables: Map<string, Map<string, Column>>; functions: ReturnType<typeof readFunctions>; keys: ForeignKey[] } | null = null;
const house = () => {
  // Production, and the tables a migration not yet applied makes: the app ships beside them.
  if (!schema) { const sql = `${SNAPSHOT_SQL()}\n${PENDING_SQL()}`; schema = { tables: readColumns(sql), functions: readFunctions(sql), keys: readForeignKeys(sql) }; }
  return schema;
};

const columnsOf = (table: string): Map<string, Column> => {
  const cols = house().tables.get(table);
  if (!cols) throw new Error(`supabaseFake: production has no table or view "${table}"`);
  return cols;
};
const mustHave = (table: string, column: string, where: string) => {
  if (!columnsOf(table).has(column)) throw new Error(`supabaseFake: ${table} has no column "${column}" (${where})`);
};

/** A row as the table could hold it: no column it lacks, a uuid where the column is one. */
const checkRow = (table: string, row: Row, where: string) => {
  const cols = columnsOf(table);
  for (const [k, v] of Object.entries(row)) {
    const col = cols.get(k);
    if (!col) throw new Error(`supabaseFake: ${table} has no column "${k}" (${where})`);
    if (col.type === 'uuid' && v !== null && v !== undefined && !(typeof v === 'string' && UUID.test(v))) {
      throw new Error(`supabaseFake: ${table}.${k} is a uuid; ${JSON.stringify(v)} is not one (${where})`);
    }
  }
};

/** The plain columns a select names. */
const selected = (table: string, text: string): string[] => topLevel(text.replace(/\s+/g, ' ')).flatMap((item) => {
  if (item === '*' || item.includes('(')) return [];
  const name = (/^(?:\w+:)?(\w+)(?:::\w+)?$/.exec(item) ?? [])[1];
  if (!name) throw new Error(`supabaseFake: cannot read "${item}" in a select of ${table}`);
  mustHave(table, name, 'select');
  return [name];
});

/**
 * An embed a select names, resolved as PostgREST resolves it: by a foreign key between the two
 * tables, the one its hint names when it names one. One it cannot resolve is the house's 400
 * (PGRST200), two it cannot choose between its PGRST201: each throws here, naming it. `one` is
 * an embed through this table's own key (an object), else through the other's (a list).
 */
type Embed = { key: string; table: string; via: ForeignKey; one: boolean; columns: string[]; embeds: Embed[] };
const embedsOf = (table: string, text: string): Embed[] => topLevel(text.replace(/\s+/g, ' ')).flatMap((item) => {
  if (!item.includes('(')) return [];
  const m = /^(?:(\w+):)?(\w+)(?:!(\w+))?(?:!(\w+))?\((.*)\)$/s.exec(item);
  if (!m) throw new Error(`supabaseFake: cannot read the embed "${item}" in a select of ${table}`);
  const [, alias, child = '', first, second, inner = ''] = m;
  columnsOf(child);
  const hint = [first, second].find((h) => h && h !== 'inner' && h !== 'left');
  const links = house().keys.filter((k) => (k.from === table && k.to === child) || (k.from === child && k.to === table))
    .filter((k) => !hint || k.name === hint || k.column === hint);
  const [via, ...others] = links;
  if (!via) throw new Error(`supabaseFake: ${table} has no relationship with ${child}${hint ? ` by "${hint}"` : ''} (PGRST200, a 400 in production)`);
  if (others.length) throw new Error(`supabaseFake: ${table} reaches ${child} by more than one key (${links.map((k) => k.name).join(', ')}): name one (PGRST201, a 400 in production)`);
  return [{ key: alias ?? child, table: child, via, one: via.from === table, columns: selected(child, inner), embeds: embedsOf(child, inner) }];
});

/**
 * A row as the select shapes it: its columns, and each embed's rows from what the test holds of
 * that table. A table it holds nothing of leaves its embed out, as before embeds were read.
 */
const shapeRow = (row: Row, columns: string[], embeds: Embed[], tables: Map<string, Row[]>): Row => {
  const out: Row = columns.length ? Object.fromEntries(columns.map((c) => [c, row[c] ?? null])) : { ...row };
  for (const e of embeds) {
    const held = tables.get(e.table);
    if (!held) continue;
    const shape = (r: Row) => shapeRow(r, e.columns, e.embeds, tables);
    out[e.key] = e.one
      ? (() => { const hit = held.find((r) => r[e.via.toColumn] === row[e.via.column]); return hit ? shape(hit) : null; })()
      : held.filter((r) => r[e.via.column] === row[e.via.toColumn]).map(shape);
  }
  return out;
};

const matches = (row: Row, [op, col, val]: [string, string, unknown]): boolean => {
  if (op.startsWith('not.')) return !matches(row, [op.slice(4), col, val]);
  const v = row[col];
  switch (op) {
    case 'eq': return v === val;
    case 'neq': return v !== val;
    case 'gt': return (v as number) > (val as number);
    case 'gte': return (v as number) >= (val as number);
    case 'lt': return (v as number) < (val as number);
    case 'lte': return (v as number) <= (val as number);
    case 'is': return v === val || (val === null && v === undefined);
    case 'in': return (val as unknown[]).includes(v);
    case 'like': case 'ilike': {
      const re = new RegExp(`^${String(val).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, op === 'ilike' ? 'i' : '');
      return re.test(String(v ?? ''));
    }
    default: throw new Error(`supabaseFake: the filter ${op} is not read here; answer this table with \`answer\``);
  }
};

export function supabaseFake(options: Options = {}) {
  const tables = new Map<string, Row[]>();
  for (const [t, rows] of Object.entries(options.rows ?? {})) {
    rows.forEach((r, i) => checkRow(t, r, `rows.${t}[${i}]`));
    tables.set(t, rows.map((r) => ({ ...r })));
  }
  for (const t of Object.keys(options.fail ?? {})) columnsOf(t);
  for (const t of Object.keys(options.silent ?? {})) columnsOf(t);
  for (const t of Object.keys(options.answer ?? {})) columnsOf(t);
  for (const fn of Object.keys(options.rpc ?? {})) {
    if (!house().functions.has(fn)) throw new Error(`supabaseFake: production has no function "${fn}"`);
  }
  const asked: Ask[] = [];

  const settle = (ask: Ask) => {
    const failure = options.fail?.[ask.table];
    if (failure) return { data: null, error: failure, count: null };
    if (options.silent?.[ask.table]) return { data: null, error: null, count: null };
    let rows: Row[];
    const answered = options.answer?.[ask.table]?.(ask);
    if (answered && !Array.isArray(answered)) return { data: null, error: answered, count: null };
    if (answered) {
      answered.forEach((r, i) => checkRow(ask.table, r, `the answer for ${ask.table}[${i}]`));
      rows = answered;
    } else {
      const held = tables.get(ask.table);
      if (!held && ask.op === 'select') throw new Error(`supabaseFake: the test never said what ${ask.table} holds; give it rows (even [])`);
      const all = held ?? [];
      const hit = all.filter((r) => ask.filters.every((f) => matches(r, f)));
      if (ask.op === 'insert' || ask.op === 'upsert') {
        const made = (ask.values ?? []).map((v) => ({ ...v }));
        tables.set(ask.table, [...all, ...made]);
        rows = made;
      } else if (ask.op === 'update') {
        for (const r of hit) Object.assign(r, ask.values?.[0] ?? {});
        tables.set(ask.table, all);
        rows = hit;
      } else if (ask.op === 'delete') {
        tables.set(ask.table, all.filter((r) => !hit.includes(r)));
        rows = hit;
      } else {
        rows = hit;
      }
    }
    for (const [col, ascending] of [...ask.order].reverse()) {
      rows = [...rows].sort((a, b) => ((a[col] as number) > (b[col] as number) ? 1 : (a[col] as number) < (b[col] as number) ? -1 : 0) * (ascending ? 1 : -1));
    }
    const count = ask.count ? rows.length : null;
    if (ask.range) rows = rows.slice(ask.range[0], ask.range[1] + 1);
    if (ask.limit !== null) rows = rows.slice(0, ask.limit);
    rows = rows.slice(0, MAX_ROWS);
    const embeds = ask.embeds ?? [];
    const shaped = ask.columns.length || embeds.length ? rows.map((r) => shapeRow(r, ask.columns, embeds, tables)) : rows;
    if (ask.head) return { data: null, error: null, count };
    if (ask.one === 'single') return shaped.length === 1 ? { data: shaped[0], error: null, count } : { data: null, error: NOT_ONE, count };
    if (ask.one === 'maybeSingle') return shaped.length > 1 ? { data: null, error: NOT_ONE, count } : { data: shaped[0] ?? null, error: null, count };
    // A write answers its rows only when .select() asked for them, as PostgREST does.
    return { data: ask.op === 'select' || ask.selects ? shaped : null, error: null, count };
  };

  const from = (table: string): Query => {
    columnsOf(table);
    const ask: Ask = { table, op: 'select', columns: [], filters: [], order: [], range: null, limit: null, one: null, values: null, count: false, head: false, selects: false };
    asked.push(ask);
    const filter = (op: string): Filter => (col, val) => { mustHave(table, col, op); ask.filters.push([op, col, val]); return chain; };
    const write = (op: Ask['op']) => (values: Row | Row[]): Query => {
      const list = Array.isArray(values) ? values : [values];
      list.forEach((v, i) => checkRow(table, v, `${op}[${i}]`));
      ask.op = op;
      ask.values = list;
      return chain;
    };
    // A filter the fake cannot read: refused, unless the test answers the table itself (it read it).
    const refuse = (what: string) => (): Query => {
      if (options.answer?.[table]) return chain;
      throw new Error(`supabaseFake: ${what}() is not read here; answer ${table} with \`answer\``);
    };
    const chain: Query = {
      select: (text = '*', opts = {}) => {
        ask.columns = selected(table, text);
        ask.embeds = embedsOf(table, text);
        ask.selects = true;
        ask.count = opts.count === 'exact';
        ask.head = !!opts.head;
        return chain;
      },
      eq: filter('eq'), neq: filter('neq'), gt: filter('gt'), gte: filter('gte'), lt: filter('lt'), lte: filter('lte'),
      is: filter('is'), in: filter('in'), like: filter('like'), ilike: filter('ilike'),
      not: (col, op, val) => { mustHave(table, col, 'not'); ask.filters.push([`not.${op}`, col, val]); return chain; },
      or: (filters: string) => { ask.ors = [...(ask.ors ?? []), filters]; return refuse('or')(); },
      contains: refuse('contains'),
      order: (col, opts = {}) => { mustHave(table, col, 'order'); ask.order.push([col, opts.ascending !== false]); return chain; },
      range: (a, b) => { ask.range = [a, b]; return chain; },
      limit: (n) => { ask.limit = n; return chain; },
      abortSignal: () => chain,
      insert: write('insert'),
      upsert: write('upsert'),
      update: (values) => write('update')(values),
      delete: () => { ask.op = 'delete'; return chain; },
      single: () => { ask.one = 'single'; return Promise.resolve(settle(ask)); },
      maybeSingle: () => { ask.one = 'maybeSingle'; return Promise.resolve(settle(ask)); },
      then: (res, rej) => {
        try { return Promise.resolve(settle(ask)).then(res, rej); } catch (e) { return Promise.reject(e).then(res, rej); }
      },
    };
    return chain;
  };

  const rpc = (fn: string, args: Row = {}): Promise<{ data: unknown; error: Failure | null }> => {
    const overloads = house().functions.get(fn);
    if (!overloads) throw new Error(`supabaseFake: production has no function "${fn}"`);
    if (!fitsAnOverload(overloads, Object.keys(args))) {
      throw new Error(`supabaseFake: ${fn}(${Object.keys(args).join(', ')}) fits no overload: ${overloads.map((ps) => `(${ps.map((p) => p.name + (p.optional ? '?' : '')).join(', ')})`).join(' or ')}`);
    }
    if (!(fn in (options.rpc ?? {}))) throw new Error(`supabaseFake: the test never said what ${fn} answers`);
    const written = options.rpc?.[fn];
    const out = typeof written === 'function' ? (written as (a: Row) => unknown)(args) : written;
    if (out && typeof out === 'object' && 'error' in (out as object)) return Promise.resolve({ data: null, error: (out as { error: Failure }).error });
    return Promise.resolve({ data: out ?? null, error: null });
  };

  const getSession = () => {
    if (!('session' in options)) throw new Error('supabaseFake: the test never said whose session the phone holds');
    const held = options.session;
    return Promise.resolve({ data: { session: held ? { user: { id: held.userId }, access_token: 'fake-access-token' } : null }, error: null });
  };

  const second = mfaFake(options.mfa);
  return {
    client: { from, rpc, auth: { mfa: second.mfa, getSession } },
    asked,
    rows: (table: string) => tables.get(table) ?? [],
    /** The second factors as the calls left them: every call asked, the factors, the session's level. */
    mfa: { asked: second.asked, factors: second.factors, level: second.level },
  };
}
