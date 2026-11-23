/**
 * A rehearsal holds a plan to its bound, never to one index's name.
 *
 * A rehearsal runs on production, whose statistics choose the plan. Car 21's rehearsal (the train of
 * 2026-11-23) asked its plan for idx_logs_user_watched_id by name; production's planner read the same
 * member's rows by another index that leads with user_id, as cheap, and the train stopped on a read that
 * was bounded all along. What a plan case guards is the bound: the read goes through an index that leads
 * with what the read asks, never the whole table (pg_temp.rh_reads_by in the rehearsal kit).
 *
 * This finder reads every rehearsal case that asks its plan for one index by name, and the indexes
 * production holds (the snapshot) and the pending migrations add. A case whose table holds another index
 * that leads with the same column or expression names a choice the statistics make: it must ask
 * rh_reads_by instead, or be judged here with why only the named index can serve its read.
 */
import { readFileSync } from 'fs';
import { basename, join } from 'path';
import { files } from '@/test-utils/universe';

const MOBILE = join(__dirname, '..', '..');

type Index = { name: string; table: string; lead: string };

/** Cases judged to name the only index that can serve their read, by "file: index". */
const JUDGED: Record<string, string> = {
  'the_moderators_are_found_at_once_rehearsal.sql: profiles_admins':
    "the read asks role = 'admin', this partial index's own predicate; every other index that leads with id holds every member and reads them all",
};

/** The first key of an index's column list: its column or expression, without order or operator class. */
export const leadOf = (columns: string): string => {
  let depth = 0;
  let end = columns.length;
  for (let k = 0; k < columns.length; k++) {
    const c = columns[k];
    if (c === '(') depth++;
    else if (c === ')' && depth === 0) { end = k; break; }
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) { end = k; break; }
  }
  return columns.slice(0, end).trim()
    .replace(/\s+NULLS\s+(?:FIRST|LAST)$/i, '').replace(/\s+(?:ASC|DESC)$/i, '')
    .replace(/\s+[a-z0-9_]+_ops$/i, '').replace(/\s+COLLATE\s+\S+$/i, '').trim();
};

/** An index from a match's named groups, when it holds them all. */
const indexFrom = (m: RegExpMatchArray): Index[] => {
  const { name, table, columns } = m.groups ?? {};
  return name && table && columns !== undefined ? [{ name, table, lead: leadOf(columns) }] : [];
};

/** Every index in the given SQL: created indexes, and the unique and primary keys of constraints. */
export const indexesIn = (sql: string): Index[] => [
  ...[...sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(?<name>[a-z0-9_]+)\s+ON\s+(?:ONLY\s+)?public\.(?<table>[a-z0-9_]+)\s+(?:USING\s+\w+\s*)?\((?<columns>[^;]*)/gi)].flatMap(indexFrom),
  ...[...sql.matchAll(/ALTER\s+TABLE\s+(?:ONLY\s+)?public\.(?<table>[a-z0-9_]+)\s+ADD\s+CONSTRAINT\s+(?<name>[a-z0-9_]+)\s+(?:UNIQUE|PRIMARY\s+KEY)\s+\((?<columns>[^)]*)\)/gi)].flatMap(indexFrom),
];

/** The indexes production holds and the pending migrations add. */
const houseIndexes = (): Index[] => {
  const applied = new Set(readFileSync(join(MOBILE, 'supabase', 'APPLIED.txt'), 'utf8').split(/\r?\n/));
  const sources = [...files(['snapshot']), ...files(['migrations']).filter((f) => f.endsWith('.sql') && !applied.has(basename(f)))];
  const byName = new Map<string, Index>();
  for (const f of sources) for (const i of indexesIn(readFileSync(f, 'utf8'))) byName.set(i.name, i);
  return [...byName.values()];
};

/** Each rehearsal case that asks its plan for one index by name. */
const namedPlanCases = (known: Set<string>): { file: string; label: string; index: string }[] =>
  files(['rehearsals']).flatMap((f) =>
    [...readFileSync(f, 'utf8').matchAll(/pg_temp\.rh_case\('(?<label>(?:[^']|'')*)'(?<body>[\s\S]*?)\\gset/g)].flatMap((c) =>
      [...(c.groups?.body ?? '').matchAll(/position\('(?<index>[a-z0-9_]+)'\s+in\s+\(?(?:SELECT\s+)?pg_temp\.\w+\(/g)]
        .flatMap((p) => {
          const index = p.groups?.index;
          return index && known.has(index) ? [{ file: basename(f), label: c.groups?.label ?? '', index }] : [];
        })));

describe('a rehearsal holds a plan to its bound, never to one index name', () => {
  const indexes = houseIndexes();
  const found = namedPlanCases(new Set(indexes.map((i) => i.name)));
  const alike = (index: string): string[] => {
    const me = indexes.find((i) => i.name === index);
    return me ? indexes.filter((i) => i.table === me.table && i.name !== me.name && i.lead === me.lead).map((i) => i.name) : [];
  };

  it('reads an index by its first key, and finds the indexes that lead alike', () => {
    const planted = indexesIn([
      'CREATE INDEX a_by_day ON public.t USING btree (user_id, watched_date DESC NULLS LAST, id DESC);',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS a_by_made ON public.t (user_id, created_at DESC);',
      'CREATE INDEX a_handle ON public.t USING btree (lower(username) text_pattern_ops);',
      'ALTER TABLE ONLY public.t\n    ADD CONSTRAINT t_pkey PRIMARY KEY (id);',
    ].join('\n'));
    expect(planted.map((i) => `${i.name}:${i.lead}`)).toEqual(['a_by_day:user_id', 'a_by_made:user_id', 'a_handle:lower(username)', 't_pkey:id']);
    expect(indexes.find((i) => i.name === 'idx_logs_user_watched_id')?.lead).toBe('user_id');
    expect(indexes.find((i) => i.name === 'idx_logs_user_id_created_at')?.lead).toBe('user_id');
  });

  it('finds the rehearsal cases that ask a plan for one index', () => {
    expect(found.length).toBeGreaterThan(5);
  });

  it('every case naming an index among others that lead alike asks the bound instead, or is judged', () => {
    const unjudged = found.filter((c) => alike(c.index).length && !JUDGED[`${c.file}: ${c.index}`])
      .map((c) => `${c.file}: '${c.label}' names ${c.index}; ${alike(c.index).join(', ')} lead alike`);
    expect(unjudged).toEqual([]);
  });

  it('judges only cases still found, each still among indexes that lead alike', () => {
    const stale = Object.keys(JUDGED).filter((k) => !found.some((c) => `${c.file}: ${c.index}` === k && alike(c.index).length));
    expect(stale).toEqual([]);
  });
});
