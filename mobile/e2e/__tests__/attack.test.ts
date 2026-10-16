/**
 * attack.test.ts — the attack matrix's own reasoning, with no database.
 *
 * e2e/db/attack/attack.mjs runs in db-integration.yml against production's
 * shape. Held here: the written table covers every table and view of the
 * snapshot today (so a new one fails a push, not only CI's database job), each
 * answer the matrix expects follows its words, and each way a try can come back
 * is read as what it is — above all, a statement that "touched a row" while a
 * trigger kept the row as it was is a refusal, never a success.
 *
 * The script is a module; one child process runs its functions on the inputs
 * below and hands back every answer at once.
 */
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

const DIR = join(__dirname, '..', 'db', 'attack');
const SNAPSHOT = join(__dirname, '..', '..', 'supabase', 'schema', 'live-schema.sql');
const matrix = JSON.parse(readFileSync(join(DIR, 'matrix.json'), 'utf8'));

const SPEC = { owner: 'user_id', read: 'viewable', hidesBlocked: true,
  self: { insert: 'rank1', update: 'unbanned', delete: 'all' }, others: { delete: 'admin' } };
const EXPECTED: [string, string, string, string][] = [
  ['select', 'visitor', 'V', 'seen'], ['select', 'visitor', 'P', 'unseen'], ['select', 'free', 'self', 'seen'],
  ['select', 'free', 'BK', 'unseen'], ['select', 'visitor', 'BK', 'seen'],
  ['insert', 'visitor', 'V', 'refused'], ['insert', 'free', 'self', 'refused'], ['insert', 'archivist', 'self', 'ok'],
  ['insert', 'banned', 'self', 'refused'], ['update', 'banned', 'self', 'refused'], ['delete', 'banned', 'self', 'ok'],
  ['delete', 'admin', 'V', 'ok'], ['delete', 'admin', 'BK', 'refused'], ['delete', 'auteur', 'V', 'refused'],
];
const JUDGED: [Record<string, unknown>, string, string][] = [
  [{ action: 'select' }, 'rows:1', 'seen'],
  [{ action: 'select' }, 'rows:0', 'unseen'],
  [{ action: 'select' }, '42501 permission denied for table x', 'unseen'],
  [{ action: 'insert' }, 'rows:1', 'ok'],
  [{ action: 'insert' }, '42501 new row violates row-level security policy for table "x"', 'refused'],
  [{ action: 'insert' }, 'P0001 The Lounge is an Archivist feature', 'refused'],
  [{ action: 'insert' }, '23502 null value in column "x" violates not-null constraint', 'broken'],
  [{ action: 'insert', refusedAs: ['23503'] }, '23503 That note has no viewing of its writer to belong to.', 'refused'],
  [{ action: 'update' }, 'rows:1 then:true', 'ok'],
  [{ action: 'update' }, 'rows:1 then:false', 'refused'],
  [{ action: 'update' }, 'rows:0 then:false', 'refused'],
  [{ action: 'update' }, 'rows:1 then:null', 'broken'],
  [{ action: 'update', anyError: true }, '23514 A note stays with the viewing it was written about.', 'refused'],
  [{ action: 'delete' }, 'rows:1 then:true', 'ok'],
  [{ action: 'delete' }, 'rows:1 then:false', 'refused'],
  [{ action: 'insert' }, 'rows:1 then:false', 'ok then:false'],
];
const FIXTURE_SNAPSHOT = 'CREATE TABLE public.logs (\nCREATE VIEW public.old_name WITH (security_invoker=true) AS\nCREATE TABLE public.new_table (\n';

type Answers = {
  tables: string[]; coverage: { unjudged: string[]; gone: string[] }; fixtureTables: string[];
  fixtureCoverage: { unjudged: string[]; gone: string[] };
  cases: { label: string; table: string; action: string; actor: string; target: string; sql: string; then?: string }[];
  actors: string[]; head: string; tail: string; commits: boolean;
  expected: string[]; acrossBlocks: string; ranked: string[]; judged: string[]; met: boolean[];
  filled: Record<string, unknown>; uidP: string; unknownPlaceholder: string;
  columns: string[]; dated: string[];
  functions: { unjudged: string[]; gone: string[]; count: number };
};

const answers: Answers = (() => {
  const program = `
    const a = await import(${JSON.stringify(pathToFileURL(join(DIR, 'attack.mjs')).href)});
    const fs = await import('node:fs');
    const u = await import(${JSON.stringify(pathToFileURL(join(__dirname, '..', 'db', 'up-down-up.mjs')).href)});
    const done = u.applied();
    globalThis.__pending = u.migrations().filter((m) => !done.has(m.name)).map((m) => fs.readFileSync(m.path, 'utf8').replace(/\\r/g, ''));
    const matrix = JSON.parse(fs.readFileSync(${JSON.stringify(join(DIR, 'matrix.json'))}, 'utf8'));
    const tables = a.snapshotTables(fs.readFileSync(${JSON.stringify(SNAPSHOT)}, 'utf8').replace(/\\r/g, ''));
    const fixtureTables = a.snapshotTables(${JSON.stringify(FIXTURE_SNAPSHOT)});
    const cases = a.plan(matrix);
    const sql = a.script(matrix, cases.slice(0, 3));
    let unknownPlaceholder = '';
    try { a.fill('{nonsense}', { table: 't', owner: 'V' }); } catch (e) { unknownPlaceholder = e.message; }
    const spec = ${JSON.stringify(SPEC)};
    const notes = { owner: 'user_id', read: 'owner', self: { insert: 'ranked' } };
    console.log(JSON.stringify({
      tables, coverage: a.coverage(matrix, tables), fixtureTables,
      fixtureCoverage: a.coverage({ tables: { logs: {}, gone_table: {} } }, fixtureTables),
      cases: cases.map(({ label, table, action, actor, target, sql, then }) => ({ label, table, action, actor, target, sql, then })),
      actors: Object.keys(a.ACTORS),
      head: sql.slice(0, 40), tail: sql.trimEnd().slice(-20), commits: /^COMMIT\\b/m.test(sql),
      expected: ${JSON.stringify(EXPECTED)}.map(([action, actor, target]) => a.expected(spec, action, actor, target)),
      acrossBlocks: a.expected({ ...spec, acrossBlocks: true }, 'delete', 'admin', 'BK'),
      ranked: [a.expected(notes, 'insert', 'banned', 'self'), a.expected(notes, 'insert', 'lapsed', 'self')],
      judged: ${JSON.stringify(JUDGED)}.map(([c, got]) => a.judge(c, got)),
      met: [['refused-or-then', 'refused'], ['refused-or-then', 'ok then:true'], ['refused-or-then', 'ok then:false'],
        ['refused-or-then', 'ok']].map(([e, g]) => a.met(e, g)),
      filled: a.fill({ a: '{owner}', b: '{uid@P}', c: '{ref:logs}', d: '{ref:logs@V#2}', e: '{id}', f: '{private}' },
        { table: 'notes', owner: 'P', newId: 'new-id' }),
      uidP: a.uid('P'), unknownPlaceholder,
      functions: (() => {
        const callable = a.callableFunctions(fs.readFileSync(${JSON.stringify(SNAPSHOT)}, 'utf8').replace(/\\r/g, ''));
        const pending = (globalThis.__pending ?? []).join('\\n');
        const dropped = [...pending.matchAll(/^DROP FUNCTION public\\.(\\w+)\\(/gm)].map((m) => m[1]);
        const created = [...pending.matchAll(/^CREATE (?:OR REPLACE )?FUNCTION public\\.(\\w+)\\(/gm)].map((m) => m[1]);
        const judged = Object.keys(matrix.functions);
        return {
          unjudged: callable.filter((f) => !dropped.includes(f) && !judged.includes(f)),
          gone: judged.filter((f) => !callable.includes(f) && !created.includes(f)),
          count: judged.length,
        };
      })(),
      columns: a.columnsOf(fs.readFileSync(${JSON.stringify(SNAPSHOT)}, 'utf8').replace(/\\r/g, '')).interactions,
      dated: [a.dated('interactions', { id: 'x' }, { interactions: ['id', 'created_at'] }).created_at,
        a.dated('interactions', { created_at: 'mine' }, { interactions: ['created_at'] }).created_at,
        a.dated('viewings', { viewing_id: 'x' }, { viewings: ['viewing_id'] }).created_at ?? 'none'],
    }));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', program], { encoding: 'utf8', maxBuffer: 1e9 });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
})();

describe('the written table covers every relation a client can name', () => {
  it('has an entry for each table and view of the snapshot, and none besides', () => {
    expect(answers.tables.length).toBeGreaterThan(40);
    expect(answers.tables).toEqual(expect.arrayContaining(['logs', 'dispatch_dossiers', 'dossier_comments']));
    expect(answers.coverage).toEqual({ unjudged: [], gone: [] });
  });

  it('judges each function a visitor or member may run, as production will be once the pending migrations are applied', () => {
    expect(answers.functions.count).toBeGreaterThan(60);
    expect({ unjudged: answers.functions.unjudged, gone: answers.functions.gone }).toEqual({ unjudged: [], gone: [] });
  });

  it('names a table the snapshot has and the matrix lacks, and one the matrix keeps after it is gone', () => {
    expect(answers.fixtureTables).toEqual(['logs', 'new_table', 'old_name']);
    expect(answers.fixtureCoverage).toEqual({ unjudged: ['new_table', 'old_name'], gone: ['gone_table'] });
  });

  it('says why for every table, and every probe', () => {
    const silent = Object.entries(matrix.tables).filter(([, s]) => !(s as { why?: string }).why).map(([t]) => t);
    expect(silent).toEqual([]);
    expect((matrix.probes as { why?: string }[]).filter((p) => !p.why)).toEqual([]);
    expect((matrix.channels as { why?: string }[]).filter((c) => !c.why)).toEqual([]);
    expect(Object.entries(matrix.functions as Record<string, { why?: string }>).filter(([, f]) => !f.why).map(([n]) => n)).toEqual([]);
  });

  it("asks the avatars bucket's table and each live channel, not only public's tables", () => {
    expect(matrix.tables['storage.objects']).toBeDefined();
    for (const ch of matrix.channels as { name: string }[]) {
      expect([ch.name, answers.cases.some((c) => c.label.startsWith(`channel: ${ch.name} (`))]).toEqual([ch.name, true]);
    }
  });
});

describe('every try is planned, filled and written out', () => {
  it('tries each action by each kind of member on each owner of each table, then each probe', () => {
    const missing: string[] = [];
    for (const [table, spec] of Object.entries(matrix.tables) as [string, { owner: string }][]) {
      const tried = new Set(answers.cases.filter((c) => c.table === table && !/ (reach|forbidden) /.test(c.label))
        .map((c) => `${c.action} ${c.actor}→${c.target}`));
      const targets = spec.owner === 'house' ? ['house'] : ['self', 'V', 'P', 'BK', 'BY'];
      for (const actor of answers.actors) {
        for (const target of targets) {
          if (actor === 'visitor' && target === 'self') continue;
          for (const action of ['select', 'insert', 'update', 'delete']) {
            if (!tried.has(`${action} ${actor}→${target}`)) missing.push(`${table} ${action} ${actor}→${target}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
    for (const p of matrix.probes as { name: string; as: string[] }[]) {
      expect(answers.cases.filter((c) => c.label.startsWith(`probe: ${p.name} (`)).length).toBe(p.as.length);
    }
  });

  it('tries every kind of member the plan names, a lapsed one among them', () => {
    expect(answers.actors).toEqual(['visitor', 'free', 'lapsed', 'archivist', 'auteur', 'founding', 'banned', 'admin']);
  });

  it('leaves no placeholder unfilled, and refuses one it does not know', () => {
    const unfilled = answers.cases.filter((c) => /\{[a-z]/.test(`${c.sql} ${c.then ?? ''}`.replace(/'\{[^']*\}'/g, '')));
    expect(unfilled.map((c) => c.label)).toEqual([]);
    expect(answers.unknownPlaceholder).toBe('unknown placeholder {nonsense} in t');
  });

  it('fills a row for its owner, another owner, and a new row, in the made-up id shape', () => {
    const row = answers.filled;
    expect([row.a, row.b]).toEqual([answers.uidP, answers.uidP]);
    expect(row.c).not.toBe(row.d);
    expect([row.e, row.f]).toEqual(['new-id', true]);
    expect(String(row.a)).toMatch(/^[0-9a-f]{8}-0000-4000-8000-[0-9a-f]{12}$/);
  });

  it('lays each row a month ago where its table keeps a date, so no rule over a recent window counts it', () => {
    // A member's interactions are kept a second apart (check_interaction_rate_limit): a row laid
    // now would refuse each try of theirs in production's time zone.
    expect(answers.columns).toEqual(expect.arrayContaining(['id', 'user_id', 'type', 'created_at']));
    const [laid = '', kept, none] = answers.dated;
    expect(Date.now() - Date.parse(laid)).toBeGreaterThan(29 * 86400e3);
    expect([kept, none]).toEqual(['mine', 'none']);
  });

  it('writes one transaction that ends in ROLLBACK and never commits', () => {
    expect(answers.head.startsWith('\\set ON_ERROR_STOP 1\nBEGIN;\n')).toBe(true);
    expect(answers.tail.endsWith('ROLLBACK;')).toBe(true);
    expect(answers.commits).toBe(false);
  });
});

describe('the answer the matrix expects follows its words', () => {
  it.each(EXPECTED.map((e, i) => [...e, i] as const))('%s by %s on %s: %s', (_action, _actor, _target, want, i) => {
    expect(answers.expected[i]).toBe(want);
  });

  it('lets the house\'s word cross a block where the matrix says so', () => {
    expect(answers.acrossBlocks).toBe('ok');
  });

  it('asks only the rank of a ranked rule', () => {
    expect(answers.ranked).toEqual(['ok', 'refused']);
  });
});

describe('each way a try comes back is read as what it is', () => {
  it.each(JUDGED.map((j, i) => [...j, i] as const))('%j answering %s is %s', (_c, _got, want, i) => {
    expect(answers.judged[i]).toBe(want);
  });

  it('meets refused-or-then only by a refusal or a kept row that holds', () => {
    expect(answers.met).toEqual([true, true, false, false]);
  });
});
